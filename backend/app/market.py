"""Campus commerce and student marketplace workflows backed by one ledger."""
import hashlib
import hmac
import json
import sqlite3
import time
from uuid import uuid4

from .database import Database
from .ledger import LedgerError, balance, organizer_payable, post, reserve, vendor_payable, wallet
from .security import secret
from .service import DomainError, KartService


def uid() -> str:
    return str(uuid4())


def code(reference: str) -> str:
    return hmac.new(secret().encode(), reference.encode(), hashlib.sha256).hexdigest()[:24]


def digest(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def payment(db, **kwargs):
    try:
        return post(db, **kwargs)
    except LedgerError as exc:
        raise DomainError(str(exc), 409) from exc


class MarketService(KartService):
    def __init__(self, database: Database):
        super().__init__(database)

    @staticmethod
    def _org(db, actor, organization_id, org_type=None):
        org = db.execute("SELECT * FROM organizations WHERE id=? AND campus_id=?", (
            organization_id, actor["campus_id"])).fetchone()
        if not org or (org_type and org["type"] != org_type):
            raise DomainError("Organization not found", 404)
        return org

    @staticmethod
    def _member(db, actor, organization_id):
        member = db.execute("SELECT role FROM memberships WHERE user_id=? AND organization_id=?", (
            actor["id"], organization_id)).fetchone()
        if not member:
            raise DomainError("Organization membership required", 403)
        return member

    @staticmethod
    def _store(db, actor, store_id):
        store = db.execute("SELECT * FROM stores WHERE id=? AND campus_id=?", (store_id, actor["campus_id"])).fetchone()
        if not store:
            raise DomainError("Store not found", 404)
        return store

    @staticmethod
    def _listing(db, actor, listing_id):
        listing = db.execute("SELECT * FROM student_listings WHERE id=? AND campus_id=?", (
            listing_id, actor["campus_id"])).fetchone()
        if not listing:
            raise DomainError("Listing not found", 404)
        return listing

    @staticmethod
    def _booking(db, actor, booking_id):
        booking = db.execute("SELECT * FROM service_bookings WHERE id=? AND campus_id=?", (
            booking_id, actor["campus_id"])).fetchone()
        if not booking or actor["id"] not in (booking["buyer_id"], booking["provider_id"]) and actor["role"] not in ("campus_admin", "platform_admin"):
            raise DomainError("Booking not found", 404)
        return booking

    @staticmethod
    def _event(db, actor, event_id):
        event = db.execute("SELECT * FROM events WHERE id=? AND campus_id=?", (event_id, actor["campus_id"])).fetchone()
        if not event:
            raise DomainError("Event not found", 404)
        return event

    def create_organization(self, owner_id: str, name: str, org_type: str, store_type: str | None = None):
        """Development onboarding only; production needs approval and organization verification."""
        with self.database.transaction() as db:
            actor = self._actor(db, owner_id)
            self._student(actor)
            if org_type not in ("vendor", "club") or (org_type == "vendor") != bool(store_type):
                raise DomainError("Invalid organization type")
            if store_type and store_type not in ("canteen", "xerox", "stationery", "merch"):
                raise DomainError("Invalid store type")
            org_id = uid()
            db.execute("INSERT INTO organizations VALUES (?,?,?,?)", (org_id, actor["campus_id"], name, org_type))
            db.execute("INSERT INTO memberships VALUES (?,?,?)", (owner_id, org_id, "owner"))
            store_id = None
            if store_type:
                store_id = uid()
                db.execute("INSERT INTO stores VALUES (?,?,?,?,?,?)", (
                    store_id, actor["campus_id"], org_id, name, store_type, 1,
                ))
            self._audit(db, actor, "organization.created", org_id)
            return {"organization_id": org_id, "store_id": store_id}

    def organizations(self, user_id: str):
        with self.database.connect() as db:
            actor = self._actor(db, user_id)
            return [dict(row) for row in db.execute("""SELECT o.id,o.name,o.type,m.role,s.id AS store_id,s.type AS store_type
                FROM memberships m JOIN organizations o ON o.id=m.organization_id
                LEFT JOIN stores s ON s.organization_id=o.id
                WHERE m.user_id=? AND o.campus_id=? ORDER BY o.name""",
                (user_id, actor["campus_id"]))]

    def stores(self, user_id: str):
        with self.database.connect() as db:
            actor = self._actor(db, user_id)
            return [dict(row) for row in db.execute("""SELECT id,name,type,open FROM stores
                WHERE campus_id=? AND open=1 ORDER BY name""", (actor["campus_id"],))]

    def add_product(self, user_id: str, store_id: str, data: dict):
        with self.database.transaction() as db:
            actor = self._actor(db, user_id)
            store = self._store(db, actor, store_id)
            self._member(db, actor, store["organization_id"])
            product_id = uid()
            db.execute("INSERT INTO products VALUES (?,?,?,?,?,?,?)", (
                product_id, store_id, data["name"], data["description"], data["price"], data["stock"], 1,
            ))
            self._audit(db, actor, "product.created", product_id)
            return {"id": product_id}

    def catalog(self, user_id: str, store_id: str | None = None):
        with self.database.connect() as db:
            actor = self._actor(db, user_id)
            params = [actor["campus_id"]]
            query = """SELECT p.id,p.store_id,p.name,p.description,p.price,p.stock,s.name AS store_name,s.type
                       FROM products p JOIN stores s ON s.id=p.store_id
                       WHERE s.campus_id=? AND s.open=1 AND p.active=1"""
            if store_id:
                query += " AND s.id=?"
                params.append(store_id)
            return [dict(row) for row in db.execute(query + " ORDER BY s.name,p.name", params)]

    def checkout(self, user_id: str, store_id: str, items: list[dict], request_key: str):
        with self.database.transaction() as db:
            actor = self._actor(db, user_id)
            self._student(actor)
            store = self._store(db, actor, store_id)
            if not store["open"]:
                raise DomainError("Store is closed", 409)
            quantities: dict[str, int] = {}
            for item in items:
                item_id, qty = item["product_id"], item["quantity"]
                quantities[item_id] = quantities.get(item_id, 0) + qty
            if not quantities or any(q > 50 for q in quantities.values()):
                raise DomainError("Invalid cart")
            fingerprint = digest(json.dumps([store_id, sorted(quantities.items())]))
            existing = db.execute("SELECT id,fingerprint FROM orders WHERE buyer_id=? AND request_key=?", (
                user_id, request_key)).fetchone()
            if existing:
                if existing["fingerprint"] != fingerprint:
                    raise DomainError("Checkout key reused with a different cart", 409)
                return {"id": existing["id"], "replayed": True, "pickup_code": code(existing["id"])}
            lines = []
            for product_id, qty in quantities.items():
                p = db.execute("SELECT * FROM products WHERE id=? AND store_id=? AND active=1", (
                    product_id, store_id)).fetchone()
                if not p or p["stock"] < qty:
                    raise DomainError("Product unavailable or insufficient stock", 409)
                lines.append((p, qty))
            amount = sum(p["price"] * qty for p, qty in lines)
            if amount > 10_000_000:
                raise DomainError("Cart total too high")
            order_id = uid()
            payment(db, key=f"order:{order_id}:pay", kind="order_purchase", ref=order_id,
                    debit=wallet(user_id), credit=vendor_payable(store["organization_id"]), amount=amount)
            db.execute("INSERT INTO orders VALUES (?,?,?,?,?,?,?,?,?,?)", (
                order_id, actor["campus_id"], user_id, store_id, request_key, fingerprint,
                amount, "placed", digest(code(order_id)), int(time.time()),
            ))
            for p, qty in lines:
                db.execute("UPDATE products SET stock=stock-? WHERE id=?", (qty, p["id"]))
                db.execute("INSERT INTO order_items VALUES (?,?,?,?,?)", (
                    order_id, p["id"], p["name"], p["price"], qty,
                ))
            self._audit(db, actor, "order.placed", order_id)
            return {"id": order_id, "amount": amount, "status": "placed", "pickup_code": code(order_id)}

    def orders(self, user_id: str, store_id: str | None = None):
        with self.database.connect() as db:
            actor = self._actor(db, user_id)
            if store_id:
                store = self._store(db, actor, store_id)
                self._member(db, actor, store["organization_id"])
                rows = db.execute("SELECT * FROM orders WHERE store_id=? ORDER BY created_at DESC", (store_id,))
            else:
                rows = db.execute("SELECT * FROM orders WHERE buyer_id=? ORDER BY created_at DESC", (user_id,))
            return [self._order_projection(db, row, actor) for row in rows]

    @staticmethod
    def _order_projection(db, row, actor):
        result = dict(row)
        result.pop("pickup_hash")
        result.pop("fingerprint")
        result.pop("request_key")
        result["items"] = [dict(i) for i in db.execute(
            "SELECT product_id,name,price,quantity FROM order_items WHERE order_id=?", (row["id"],))]
        if actor["id"] == row["buyer_id"]:
            result["pickup_code"] = code(row["id"])
        return result

    def advance_order(self, user_id: str, order_id: str, pickup_code: str | None = None):
        with self.database.transaction() as db:
            actor = self._actor(db, user_id)
            order = db.execute("SELECT * FROM orders WHERE id=? AND campus_id=?", (
                order_id, actor["campus_id"])).fetchone()
            if not order:
                raise DomainError("Order not found", 404)
            store = self._store(db, actor, order["store_id"])
            self._member(db, actor, store["organization_id"])
            transitions = {"placed": "preparing", "preparing": "ready", "ready": "collected"}
            if order["status"] not in transitions:
                raise DomainError("Order cannot advance", 409)
            if order["status"] == "ready" and (not pickup_code or not hmac.compare_digest(digest(pickup_code), order["pickup_hash"])):
                raise DomainError("Invalid pickup credential", 403)
            status = transitions[order["status"]]
            db.execute("UPDATE orders SET status=? WHERE id=?", (status, order_id))
            self._audit(db, actor, "order." + status, order_id)
            return {"id": order_id, "status": status}

    def cancel_order(self, user_id: str, order_id: str):
        with self.database.transaction() as db:
            actor = self._actor(db, user_id)
            order = db.execute("SELECT * FROM orders WHERE id=? AND campus_id=? AND buyer_id=?", (
                order_id, actor["campus_id"], user_id)).fetchone()
            if not order:
                raise DomainError("Order not found", 404)
            if order["status"] != "placed":
                raise DomainError("Order has already started", 409)
            active_link = db.execute("""SELECT 1 FROM task_order_links l JOIN tasks t ON t.id=l.task_id
                WHERE l.order_id=? AND t.status NOT IN ('open','cancelled','completed') LIMIT 1""",
                (order_id,)).fetchone()
            if active_link:
                raise DomainError("Cancel the assigned pickup task first", 409)
            store = self._store(db, actor, order["store_id"])
            payment(db, key=f"order:{order_id}:refund", kind="order_refund", ref=order_id,
                    debit=vendor_payable(store["organization_id"]), credit=wallet(user_id), amount=order["amount"])
            db.execute("UPDATE orders SET status='cancelled' WHERE id=?", (order_id,))
            db.execute("""UPDATE tasks SET status='cancelled' WHERE id IN
                (SELECT task_id FROM task_order_links WHERE order_id=?) AND status='open'""", (order_id,))
            for item in db.execute("SELECT * FROM order_items WHERE order_id=?", (order_id,)):
                db.execute("UPDATE products SET stock=stock+? WHERE id=?", (item["quantity"], item["product_id"]))
            self._audit(db, actor, "order.cancelled", order_id)
            return {"id": order_id, "status": "cancelled"}

    def create_listing(self, user_id: str, data: dict):
        with self.database.transaction() as db:
            actor = self._actor(db, user_id)
            self._student(actor)
            if data["kind"] not in ("sale", "rental"):
                raise DomainError("Invalid listing kind")
            if data["kind"] == "rental" and (not 1 <= data.get("max_days", 0) <= 30 or
                                              not 0 <= data.get("deposit", -1) <= 1_000_000):
                raise DomainError("Invalid rental terms")
            listing_id = uid()
            db.execute("INSERT INTO student_listings VALUES (?,?,?,?,?,?,?,?,?,?)", (
                listing_id, actor["campus_id"], user_id, data["title"], data["description"],
                data["amount"], data["kind"], "active", None, int(time.time()),
            ))
            if data["kind"] == "rental":
                db.execute("INSERT INTO rental_terms VALUES (?,?,?)", (
                    listing_id, data["deposit"], data["max_days"],
                ))
            self._audit(db, actor, "listing.created", listing_id)
            return {"id": listing_id}

    def listings(self, user_id: str):
        with self.database.connect() as db:
            actor = self._actor(db, user_id)
            return [dict(row) for row in db.execute("""SELECT l.*,r.deposit,r.max_days FROM student_listings l
                LEFT JOIN rental_terms r ON r.listing_id=l.id
                WHERE l.campus_id=? AND (l.status='active' OR l.seller_id=? OR l.buyer_id=?) ORDER BY l.created_at DESC""",
                (actor["campus_id"], user_id, user_id))]

    def reserve_listing(self, user_id: str, listing_id: str):
        with self.database.transaction() as db:
            actor = self._actor(db, user_id)
            self._student(actor)
            listing = self._listing(db, actor, listing_id)
            if listing["kind"] != "sale" or listing["status"] != "active" or listing["seller_id"] == user_id:
                raise DomainError("Listing is unavailable", 409)
            payment(db, key=f"listing:{listing_id}:reserve", kind="listing_reserve", ref=listing_id,
                    debit=wallet(user_id), credit=reserve("listing:" + listing_id), amount=listing["amount"])
            db.execute("UPDATE student_listings SET status='reserved',buyer_id=? WHERE id=?", (user_id, listing_id))
            self._audit(db, actor, "listing.reserved", listing_id)
            return {"id": listing_id, "status": "reserved"}

    def listing_action(self, user_id: str, listing_id: str, action: str):
        if action not in ("confirm", "cancel", "withdraw"):
            raise DomainError("Unknown listing action", 404)
        with self.database.transaction() as db:
            actor = self._actor(db, user_id)
            listing = self._listing(db, actor, listing_id)
            if action == "withdraw":
                if listing["seller_id"] != user_id or listing["status"] != "active":
                    raise DomainError("Cannot withdraw listing", 409)
                status = "withdrawn"
            elif action == "confirm":
                if listing["buyer_id"] != user_id or listing["status"] != "reserved":
                    raise DomainError("Only the buyer can confirm handover", 403)
                payment(db, key=f"listing:{listing_id}:release", kind="listing_release", ref=listing_id,
                        debit=reserve("listing:" + listing_id), credit=wallet(listing["seller_id"]), amount=listing["amount"])
                status = "completed"
            else:
                if user_id not in (listing["buyer_id"], listing["seller_id"]) or listing["status"] != "reserved":
                    raise DomainError("Cannot cancel reservation", 409)
                payment(db, key=f"listing:{listing_id}:refund", kind="listing_refund", ref=listing_id,
                        debit=reserve("listing:" + listing_id), credit=wallet(listing["buyer_id"]), amount=listing["amount"])
                status = "withdrawn"
            db.execute("UPDATE student_listings SET status=? WHERE id=?", (status, listing_id))
            self._audit(db, actor, "listing." + action, listing_id)
            return {"id": listing_id, "status": status}

    def rentals(self, user_id: str):
        with self.database.connect() as db:
            actor = self._actor(db, user_id)
            return [dict(row) for row in db.execute("""SELECT * FROM rentals WHERE campus_id=?
                AND (renter_id=? OR seller_id=?) ORDER BY created_at DESC""",
                (actor["campus_id"], user_id, user_id))]

    def rent_listing(self, user_id: str, listing_id: str, days: int):
        with self.database.transaction() as db:
            actor = self._actor(db, user_id)
            self._student(actor)
            listing = self._listing(db, actor, listing_id)
            terms = db.execute("SELECT * FROM rental_terms WHERE listing_id=?", (listing_id,)).fetchone()
            if not terms or listing["status"] != "active" or listing["seller_id"] == user_id:
                raise DomainError("Rental is unavailable", 409)
            if not isinstance(days, int) or isinstance(days, bool) or days < 1 or days > terms["max_days"]:
                raise DomainError("Choose a valid rental period")
            amount = listing["amount"] * days
            total = amount + terms["deposit"]
            if total > 10_000_000:
                raise DomainError("Rental total too high")
            rental_id = uid()
            payment(db, key=f"rental:{rental_id}:reserve", kind="rental_reserve", ref=rental_id,
                    debit=wallet(user_id), credit=reserve("rental:" + rental_id), amount=total)
            db.execute("INSERT INTO rentals VALUES (?,?,?,?,?,?,?,?,?,?,?)", (
                rental_id, listing_id, actor["campus_id"], user_id, listing["seller_id"],
                amount, terms["deposit"], days, 0, "reserved", int(time.time()),
            ))
            db.execute("UPDATE student_listings SET status='reserved',buyer_id=? WHERE id=?", (user_id, listing_id))
            self._audit(db, actor, "rental.reserved", rental_id)
            return {"id": rental_id, "status": "reserved", "fee": amount, "deposit": terms["deposit"]}

    def rental_action(self, user_id: str, rental_id: str, action: str):
        rules = {"handover": ("reserved", "active", "seller_id"),
                 "return": ("active", "return_pending", "renter_id"),
                 "confirm_return": ("return_pending", "completed", "seller_id"),
                 "cancel": ("reserved", "cancelled", "renter_id"),
                 "dispute": ("return_pending", "disputed", None)}
        if action not in rules:
            raise DomainError("Unknown rental action", 404)
        with self.database.transaction() as db:
            actor = self._actor(db, user_id)
            rental = db.execute("SELECT * FROM rentals WHERE id=? AND campus_id=?", (rental_id, actor["campus_id"])).fetchone()
            if not rental or user_id not in (rental["renter_id"], rental["seller_id"]):
                raise DomainError("Rental not found", 404)
            before, after, owner = rules[action]
            if owner and rental[owner] != user_id:
                raise DomainError("Not permitted for this rental", 403)
            if rental["status"] != before:
                raise DomainError("Invalid rental transition", 409)
            account = reserve("rental:" + rental_id)
            if action == "handover":
                payment(db, key=f"rental:{rental_id}:fee", kind="rental_fee", ref=rental_id,
                        debit=account, credit=wallet(rental["seller_id"]), amount=rental["fee"])
            elif action == "cancel":
                payment(db, key=f"rental:{rental_id}:refund", kind="rental_refund", ref=rental_id,
                        debit=account, credit=wallet(rental["renter_id"]), amount=rental["fee"] + rental["deposit"])
            elif action == "confirm_return" and rental["deposit"]:
                payment(db, key=f"rental:{rental_id}:deposit", kind="rental_deposit_refund", ref=rental_id,
                        debit=account, credit=wallet(rental["renter_id"]), amount=rental["deposit"])
            db.execute("UPDATE rentals SET status=? WHERE id=?", (after, rental_id))
            if action == "handover":
                db.execute("UPDATE rentals SET due_at=? WHERE id=?", (int(time.time()) + rental["duration_days"] * 86400, rental_id))
            if action in ("cancel", "confirm_return"):
                db.execute("UPDATE student_listings SET status='active',buyer_id=NULL WHERE id=?", (rental["listing_id"],))
            self._audit(db, actor, "rental." + action, rental_id)
            return {"id": rental_id, "status": after}

    def resolve_rental(self, user_id: str, rental_id: str, release_deposit_to_seller: bool):
        with self.database.transaction() as db:
            actor = self._actor(db, user_id)
            rental = db.execute("SELECT * FROM rentals WHERE id=? AND campus_id=?", (rental_id, actor["campus_id"])).fetchone()
            if not rental:
                raise DomainError("Rental not found", 404)
            if actor["role"] not in ("campus_admin", "platform_admin"):
                raise DomainError("Administrator required", 403)
            if rental["status"] != "disputed":
                raise DomainError("Rental is not disputed", 409)
            if rental["deposit"]:
                payment(db, key=f"rental:{rental_id}:resolve", kind="rental_resolution", ref=rental_id,
                        debit=reserve("rental:" + rental_id),
                        credit=wallet(rental["seller_id"] if release_deposit_to_seller else rental["renter_id"]),
                        amount=rental["deposit"])
            db.execute("UPDATE rentals SET status='completed' WHERE id=?", (rental_id,))
            db.execute("UPDATE student_listings SET status='active',buyer_id=NULL WHERE id=?", (rental["listing_id"],))
            self._audit(db, actor, "rental.resolved", rental_id)
            return {"id": rental_id, "status": "completed"}

    def create_service(self, user_id: str, data: dict):
        with self.database.transaction() as db:
            actor = self._actor(db, user_id)
            self._student(actor)
            service_id = uid()
            db.execute("INSERT INTO services VALUES (?,?,?,?,?,?,?,?)", (
                service_id, actor["campus_id"], user_id, data["title"], data["description"],
                data["amount"], 1, int(time.time()),
            ))
            self._audit(db, actor, "service.created", service_id)
            return {"id": service_id}

    def services(self, user_id: str):
        with self.database.connect() as db:
            actor = self._actor(db, user_id)
            return [dict(row) for row in db.execute("""SELECT * FROM services
                 WHERE campus_id=? AND (active=1 OR provider_id=?) ORDER BY created_at DESC""",
                 (actor["campus_id"], user_id))]

    def book_service(self, user_id: str, service_id: str):
        with self.database.transaction() as db:
            actor = self._actor(db, user_id)
            self._student(actor)
            service = db.execute("SELECT * FROM services WHERE id=? AND campus_id=? AND active=1", (
                service_id, actor["campus_id"])).fetchone()
            if not service:
                raise DomainError("Service not found", 404)
            if service["provider_id"] == user_id:
                raise DomainError("Cannot book your own service", 403)
            booking_id = uid()
            payment(db, key=f"service:{booking_id}:reserve", kind="service_reserve", ref=booking_id,
                    debit=wallet(user_id), credit=reserve("service:" + booking_id), amount=service["amount"])
            db.execute("INSERT INTO service_bookings VALUES (?,?,?,?,?,?,?,?)", (
                booking_id, actor["campus_id"], service_id, user_id, service["provider_id"],
                service["amount"], "requested", int(time.time()),
            ))
            self._audit(db, actor, "service.booked", booking_id)
            return {"id": booking_id, "status": "requested"}

    def bookings(self, user_id: str):
        with self.database.connect() as db:
            actor = self._actor(db, user_id)
            return [dict(row) for row in db.execute("""SELECT * FROM service_bookings
                WHERE campus_id=? AND (buyer_id=? OR provider_id=?) ORDER BY created_at DESC""",
                (actor["campus_id"], user_id, user_id))]

    def booking_action(self, user_id: str, booking_id: str, action: str):
        rules = {
            "start": ("requested", "in_progress", "provider_id"),
            "submit": ("in_progress", "submitted", "provider_id"),
            "approve": ("submitted", "completed", "buyer_id"),
            "cancel": ("requested", "cancelled", "buyer_id"),
            "dispute": ("submitted", "disputed", None),
        }
        if action not in rules:
            raise DomainError("Unknown booking action", 404)
        with self.database.transaction() as db:
            actor = self._actor(db, user_id)
            booking = self._booking(db, actor, booking_id)
            old, new, owner = rules[action]
            if owner and booking[owner] != user_id:
                raise DomainError("Not permitted to change booking", 403)
            if booking["status"] != old:
                raise DomainError("Invalid booking transition", 409)
            if action in ("approve", "cancel"):
                payment(db, key=f"service:{booking_id}:{action}", kind="service_" + action, ref=booking_id,
                        debit=reserve("service:" + booking_id),
                        credit=wallet(booking["provider_id"] if action == "approve" else booking["buyer_id"]),
                        amount=booking["amount"])
            db.execute("UPDATE service_bookings SET status=? WHERE id=?", (new, booking_id))
            self._audit(db, actor, "service." + action, booking_id)
            return {"id": booking_id, "status": new}

    def resolve_booking(self, user_id: str, booking_id: str, release_to_provider: bool):
        with self.database.transaction() as db:
            actor = self._actor(db, user_id)
            booking = self._booking(db, actor, booking_id)
            if actor["role"] not in ("campus_admin", "platform_admin"):
                raise DomainError("Administrator required", 403)
            if booking["status"] != "disputed":
                raise DomainError("Booking is not disputed", 409)
            payment(db, key=f"service:{booking_id}:resolve", kind="service_resolution", ref=booking_id,
                    debit=reserve("service:" + booking_id),
                    credit=wallet(booking["provider_id"] if release_to_provider else booking["buyer_id"]),
                    amount=booking["amount"])
            status = "completed" if release_to_provider else "cancelled"
            db.execute("UPDATE service_bookings SET status=? WHERE id=?", (status, booking_id))
            self._audit(db, actor, "service.resolved", booking_id)
            return {"id": booking_id, "status": status}

    def create_event(self, user_id: str, organization_id: str, data: dict):
        with self.database.transaction() as db:
            actor = self._actor(db, user_id)
            self._org(db, actor, organization_id, "club")
            member = self._member(db, actor, organization_id)
            if member["role"] != "owner":
                raise DomainError("Organizer owner required", 403)
            if data["starts_at"] <= time.time():
                raise DomainError("Event must be in the future")
            event_id = uid()
            db.execute("INSERT INTO events VALUES (?,?,?,?,?,?,?,?,?)", (
                event_id, actor["campus_id"], organization_id, data["title"], data["description"],
                data["starts_at"], data["capacity"], data["price"], "published",
            ))
            self._audit(db, actor, "event.published", event_id)
            return {"id": event_id}

    def events(self, user_id: str):
        with self.database.connect() as db:
            actor = self._actor(db, user_id)
            return [dict(row) for row in db.execute("""SELECT e.*,
                 (SELECT COUNT(*) FROM tickets t WHERE t.event_id=e.id AND t.status!='cancelled') AS reserved_seats
                 FROM events e WHERE e.campus_id=? AND e.status='published' ORDER BY starts_at""",
                 (actor["campus_id"],))]

    def register_event(self, user_id: str, event_id: str):
        with self.database.transaction() as db:
            actor = self._actor(db, user_id)
            self._student(actor)
            event = self._event(db, actor, event_id)
            if event["status"] != "published" or event["starts_at"] <= time.time():
                raise DomainError("Registration is closed", 409)
            existing = db.execute("SELECT * FROM tickets WHERE event_id=? AND attendee_id=?", (
                event_id, user_id)).fetchone()
            if existing:
                raise DomainError("Already registered for this event", 409)
            count = db.execute("SELECT COUNT(*) FROM tickets WHERE event_id=? AND status!='cancelled'", (
                event_id,)).fetchone()[0]
            if count >= event["capacity"]:
                raise DomainError("Event is full", 409)
            ticket_id = uid()
            if event["price"]:
                payment(db, key=f"ticket:{ticket_id}:pay", kind="event_ticket", ref=ticket_id,
                        debit=wallet(user_id), credit=organizer_payable(event["organization_id"]),
                        amount=event["price"])
            db.execute("INSERT INTO tickets VALUES (?,?,?,?,?,?)", (
                ticket_id, event_id, user_id, digest(code(ticket_id)), "valid", int(time.time()),
            ))
            self._audit(db, actor, "event.registered", ticket_id)
            return {"id": ticket_id, "code": code(ticket_id)}

    def tickets(self, user_id: str):
        with self.database.connect() as db:
            self._actor(db, user_id)
            rows = db.execute("""SELECT t.*,e.title,e.starts_at FROM tickets t
                JOIN events e ON e.id=t.event_id WHERE t.attendee_id=? ORDER BY t.created_at DESC""", (user_id,))
            return [{**dict(row), "code": code(row["id"]), "code_hash": None} for row in rows]

    def check_in(self, user_id: str, ticket_id: str, presented_code: str):
        with self.database.transaction() as db:
            actor = self._actor(db, user_id)
            ticket = db.execute("""SELECT t.*,e.campus_id,e.organization_id FROM tickets t
                 JOIN events e ON e.id=t.event_id WHERE t.id=? AND e.campus_id=?""",
                 (ticket_id, actor["campus_id"])).fetchone()
            if not ticket:
                raise DomainError("Ticket not found", 404)
            self._member(db, actor, ticket["organization_id"])
            if ticket["status"] != "valid":
                raise DomainError("Ticket has already been used or cancelled", 409)
            if not hmac.compare_digest(digest(presented_code), ticket["code_hash"]):
                raise DomainError("Invalid ticket credential", 403)
            db.execute("UPDATE tickets SET status='used' WHERE id=?", (ticket_id,))
            self._audit(db, actor, "event.check_in", ticket_id)
            return {"id": ticket_id, "status": "used"}
