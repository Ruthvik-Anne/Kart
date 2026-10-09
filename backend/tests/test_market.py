import os
import tempfile
import time
import unittest
from unittest.mock import patch
from concurrent.futures import ThreadPoolExecutor

from app.database import Database
from app.ledger import balance, organizer_payable, reserve, vendor_payable, wallet
from app.market import MarketService
from app.service import DomainError


class MarketTests(unittest.TestCase):
    def setUp(self):
        demo = patch.dict(os.environ, {"KART_DEMO_MODE": "1"})
        demo.start()
        self.addCleanup(demo.stop)
        os.environ["KART_SESSION_SECRET"] = "test-secret-with-more-than-32-characters"
        self.tmp = tempfile.TemporaryDirectory()
        self.s = MarketService(Database(os.path.join(self.tmp.name, "kart.db")))
        with self.s.database.transaction() as db:
            db.executemany("INSERT INTO campuses VALUES (?,?)", [("c1", "One"), ("c2", "Two")])
            db.executemany("INSERT INTO users VALUES (?,?,?,?,?)", [
                ("buyer", "c1", "Buyer", "student", 1),
                ("vendor", "c1", "Vendor", "student", 1),
                ("provider", "c1", "Provider", "student", 1),
                ("other", "c1", "Other", "student", 1),
                ("foreign", "c2", "Foreign", "student", 1),
                ("admin", "c1", "Admin", "campus_admin", 1),
            ])
        self.s.demo_grant("buyer", 500, "initial-buyer-grant")

    def tearDown(self):
        self.tmp.cleanup()

    def store(self):
        org = self.s.create_organization("vendor", "Campus Canteen", "vendor", "canteen")
        product = self.s.add_product("vendor", org["store_id"], {
            "name": "Idli", "description": "Breakfast", "price": 30, "stock": 4,
        })
        return org, product["id"]

    def test_checkout_idempotency_inventory_and_handover(self):
        org, product = self.store()
        order = self.s.checkout("buyer", org["store_id"], [{"product_id": product, "quantity": 2}], "idempotent-order-1")
        self.assertEqual(order["amount"], 60)
        replay = self.s.checkout("buyer", org["store_id"], [{"product_id": product, "quantity": 2}], "idempotent-order-1")
        self.assertEqual(replay["id"], order["id"])
        self.assertEqual(self.s.wallet("buyer")["available"], 440)
        self.assertEqual(self.s.catalog("buyer")[0]["stock"], 2)
        with self.s.database.connect() as db:
            self.assertEqual(balance(db, vendor_payable(org["organization_id"])), 60)
        with self.assertRaises(DomainError):
            self.s.checkout("buyer", org["store_id"], [{"product_id": product, "quantity": 1}], "idempotent-order-1")
        with self.assertRaises(DomainError):
            self.s.advance_order("other", order["id"])
        self.s.advance_order("vendor", order["id"])
        self.s.advance_order("vendor", order["id"])
        with self.assertRaises(DomainError):
            self.s.advance_order("vendor", order["id"], "wrong")
        self.s.advance_order("vendor", order["id"], order["pickup_code"])
        self.assertEqual(self.s.orders("buyer")[0]["status"], "collected")
        self.assertNotIn("pickup_code", self.s.orders("vendor", org["store_id"])[0])

    def test_cancel_restocks_and_refunds_once(self):
        org, product = self.store()
        order = self.s.checkout("buyer", org["store_id"], [{"product_id": product, "quantity": 2}], "idempotent-order-2")
        self.s.cancel_order("buyer", order["id"])
        self.assertEqual(self.s.wallet("buyer")["available"], 500)
        self.assertEqual(self.s.catalog("buyer")[0]["stock"], 4)
        with self.assertRaises(DomainError):
            self.s.cancel_order("buyer", order["id"])
        with self.assertRaises(DomainError) as error:
            self.s.cancel_order("foreign", order["id"])
        self.assertEqual(error.exception.status, 404)

    def test_concurrent_last_item_has_one_winner(self):
        org, product = self.store()
        with self.s.database.transaction() as db:
            db.execute("UPDATE products SET stock=1 WHERE id=?", (product,))
        self.s.demo_grant("other", 100, "other-stock-grant")

        def purchase(user):
            try:
                return self.s.checkout(user, org["store_id"], [{"product_id": product, "quantity": 1}],
                                       "last-item-" + user)["id"]
            except DomainError:
                return None

        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(purchase, ["buyer", "other"]))
        self.assertEqual(sum(result is not None for result in results), 1)
        self.assertEqual(self.s.catalog("buyer")[0]["stock"], 0)
        with self.s.database.connect() as db:
            self.assertEqual(db.execute("SELECT COUNT(*) FROM orders").fetchone()[0], 1)

    def test_sale_reservation_and_buyer_release(self):
        listing = self.s.create_listing("provider", {
            "title": "Engineering book", "description": "Clean copy", "amount": 120, "kind": "sale",
        })["id"]
        self.s.reserve_listing("buyer", listing)
        with self.assertRaises(DomainError):
            self.s.reserve_listing("other", listing)
        with self.assertRaises(DomainError):
            self.s.listing_action("provider", listing, "confirm")
        self.assertEqual(self.s.wallet("buyer")["available"], 380)
        self.s.listing_action("buyer", listing, "confirm")
        self.assertEqual(self.s.wallet("provider")["available"], 120)
        with self.s.database.connect() as db:
            self.assertEqual(balance(db, reserve("listing:" + listing)), 0)
        with self.assertRaises(DomainError):
            self.s.listing_action("buyer", listing, "confirm")

    def test_service_booking_approval_and_dispute(self):
        service = self.s.create_service("provider", {
            "title": "Poster design", "description": "One revision", "amount": 100,
        })["id"]
        booking = self.s.book_service("buyer", service)["id"]
        self.assertEqual(len(self.s.bookings("provider")), 1)
        self.assertEqual(len(self.s.bookings("other")), 0)
        self.s.booking_action("provider", booking, "start")
        self.s.booking_action("provider", booking, "submit")
        self.s.booking_action("buyer", booking, "approve")
        self.assertEqual(self.s.wallet("provider")["available"], 100)
        disputed = self.s.book_service("buyer", service)["id"]
        self.s.booking_action("provider", disputed, "start")
        self.s.booking_action("provider", disputed, "submit")
        self.s.booking_action("buyer", disputed, "dispute")
        self.s.resolve_booking("admin", disputed, False)
        self.assertEqual(self.s.wallet("buyer")["available"], 400)

    def test_rental_fee_deposit_return_and_repeat_booking(self):
        listing = self.s.create_listing("provider", {
            "title": "Camera rental", "description": "Good condition", "amount": 40,
            "kind": "rental", "deposit": 100, "max_days": 7,
        })["id"]
        rental = self.s.rent_listing("buyer", listing, 2)
        self.assertEqual((rental["fee"], rental["deposit"]), (80, 100))
        self.assertEqual(self.s.wallet("buyer")["available"], 320)
        with self.assertRaises(DomainError):
            self.s.rent_listing("other", listing, 1)
        with self.assertRaises(DomainError):
            self.s.rental_action("buyer", rental["id"], "handover")
        self.s.rental_action("provider", rental["id"], "handover")
        self.assertEqual(self.s.wallet("provider")["available"], 80)
        self.assertGreater(self.s.rentals("buyer")[0]["due_at"], int(time.time()))
        self.s.rental_action("buyer", rental["id"], "return")
        self.s.rental_action("provider", rental["id"], "confirm_return")
        self.assertEqual(self.s.wallet("buyer")["available"], 420)
        self.assertEqual(self.s.listings("other")[0]["status"], "active")
        second = self.s.rent_listing("buyer", listing, 1)
        self.s.rental_action("buyer", second["id"], "cancel")
        self.assertEqual(self.s.wallet("buyer")["available"], 420)

    def test_rental_dispute_controls_deposit(self):
        listing = self.s.create_listing("provider", {
            "title": "Projector rental", "description": "Comes with cable", "amount": 30,
            "kind": "rental", "deposit": 50, "max_days": 2,
        })["id"]
        rental_id = self.s.rent_listing("buyer", listing, 1)["id"]
        self.s.rental_action("provider", rental_id, "handover")
        self.s.rental_action("buyer", rental_id, "return")
        self.s.rental_action("buyer", rental_id, "dispute")
        with self.assertRaises(DomainError):
            self.s.resolve_rental("other", rental_id, True)
        self.s.resolve_rental("admin", rental_id, False)
        self.assertEqual(self.s.wallet("buyer")["available"], 470)
        self.assertEqual(self.s.wallet("provider")["available"], 30)

    def test_ticket_capacity_payment_and_one_time_checkin(self):
        club = self.s.create_organization("vendor", "Tech Club", "club")
        event = self.s.create_event("vendor", club["organization_id"], {
            "title": "Robotics workshop", "description": "Beginner session",
            "starts_at": int(time.time()) + 3600, "capacity": 1, "price": 50,
        })["id"]
        ticket = self.s.register_event("buyer", event)
        self.assertEqual(self.s.wallet("buyer")["available"], 450)
        with self.assertRaises(DomainError):
            self.s.register_event("other", event)
        with self.assertRaises(DomainError):
            self.s.check_in("other", ticket["id"], ticket["code"])
        with self.assertRaises(DomainError):
            self.s.check_in("vendor", ticket["id"], "wrong")
        self.s.check_in("vendor", ticket["id"], ticket["code"])
        with self.assertRaises(DomainError):
            self.s.check_in("vendor", ticket["id"], ticket["code"])
        with self.s.database.connect() as db:
            self.assertEqual(balance(db, organizer_payable(club["organization_id"])), 50)
        self.assertEqual(self.s.events("foreign"), [])

    def test_linked_pickup_waits_for_ready_and_restricts_credential(self):
        org, product = self.store()
        order = self.s.checkout("buyer", org["store_id"], [{"product_id": product, "quantity": 1}], "linked-order-key")
        task_id = self.s.create_task("buyer", {
            "title": "Collect my food", "description": "Bring it to the library", "category": "pickup",
            "anonymous": True, "urgency": "urgent", "pricing": "fixed", "budget": 20,
            "deadline": int(time.time()) + 3600, "order_id": order["id"],
        })["id"]
        bid = self.s.bid("provider", task_id, {"amount": 20, "eta_minutes": 10, "note": "Sure"})["id"]
        self.s.accept("buyer", task_id, bid)
        self.assertEqual(self.s.task("provider", task_id)["source_order"]["status"], "placed")
        with self.assertRaises(DomainError):
            self.s.transition("provider", task_id, "start")
        with self.assertRaises(DomainError):
            self.s.pickup_credential("other", task_id)
        with self.assertRaises(DomainError):
            self.s.cancel_order("buyer", order["id"])
        self.s.advance_order("vendor", order["id"])
        self.s.advance_order("vendor", order["id"])
        credential = self.s.pickup_credential("provider", task_id)
        self.assertEqual(credential["pickup_code"], order["pickup_code"])
        self.s.transition("provider", task_id, "start")
        self.s.advance_order("vendor", order["id"], credential["pickup_code"])
        self.s.transition("provider", task_id, "submit")
        self.s.transition("buyer", task_id, "approve")
        self.assertEqual(self.s.wallet("provider")["available"], 20)


if __name__ == "__main__":
    unittest.main()
