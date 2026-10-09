import importlib.util
import os
import tempfile
import time
import unittest


@unittest.skipUnless(importlib.util.find_spec("fastapi") and importlib.util.find_spec("httpx"),
                     "HTTP dependencies are installed in CI")
class ApiIntegrationTests(unittest.TestCase):
    def test_full_http_purchase_task_and_ticket_flow(self):
        from fastapi.testclient import TestClient
        from app.database import Database
        from app.market import MarketService
        from app import main

        with tempfile.TemporaryDirectory() as directory:
            os.environ["KART_SESSION_SECRET"] = "integration-test-secret-at-least-32-characters"
            os.environ["KART_DEMO_MODE"] = "1"
            main.service = MarketService(Database(directory + "/kart.db"))
            with TestClient(main.app) as client:
                def user(name):
                    r = client.post("/dev/users", json={"name": name, "campus_id": "campus-one"})
                    self.assertEqual(r.status_code, 201, r.text)
                    return r.json()

                buyer, worker, vendor = user("Buyer"), user("Worker"), user("Vendor")
                auth = lambda person: {"Authorization": "Bearer " + person["token"]}
                grant = client.post("/dev/kc-grants", headers=auth(buyer),
                                    json={"amount": 500, "key": "checkout-grant-one"})
                self.assertEqual(grant.status_code, 200, grant.text)
                org = client.post("/dev/organizations", headers=auth(vendor),
                                  json={"name": "Canteen", "type": "vendor", "store_type": "canteen"}).json()
                product = client.post(f"/v1/stores/{org['store_id']}/products", headers=auth(vendor),
                                      json={"name": "Lunch", "description": "Fresh", "price": 50, "stock": 2}).json()
                order = client.post("/v1/orders", headers=auth(buyer), json={"store_id": org["store_id"],
                                    "items": [{"product_id": product["id"], "quantity": 1}],
                                    "request_key": "one-http-order-key"})
                self.assertEqual(order.status_code, 201, order.text)
                order = order.json()
                task = client.post("/v1/tasks", headers=auth(buyer), json={
                    "title": "Collect lunch", "description": "Meet at library", "category": "pickup",
                    "anonymous": True, "urgency": "urgent", "pricing": "fixed", "budget": 20,
                    "deadline": int(time.time()) + 3600, "order_id": order["id"],
                })
                self.assertEqual(task.status_code, 201, task.text)
                task_id = task.json()["id"]
                detail = client.get(f"/v1/tasks/{task_id}", headers=auth(worker)).json()
                self.assertNotIn("poster_id", detail)
                bid = client.post(f"/v1/tasks/{task_id}/bids", headers=auth(worker),
                                  json={"amount": 20, "eta_minutes": 10, "note": "Ready"}).json()
                accepted = client.post(f"/v1/tasks/{task_id}/bids/{bid['id']}/accept", headers=auth(buyer))
                self.assertEqual(accepted.status_code, 200, accepted.text)
                self.assertEqual(client.post(f"/v1/tasks/{task_id}/actions/start", headers=auth(worker)).status_code, 409)
                for _ in range(2):
                    self.assertEqual(client.post(f"/v1/orders/{order['id']}/advance", headers=auth(vendor), json={}).status_code, 200)
                credential = client.get(f"/v1/tasks/{task_id}/pickup", headers=auth(worker)).json()
                self.assertEqual(credential["pickup_code"], order["pickup_code"])
                self.assertEqual(client.post(f"/v1/tasks/{task_id}/actions/start", headers=auth(worker)).status_code, 200)
                self.assertEqual(client.post(f"/v1/orders/{order['id']}/advance", headers=auth(vendor),
                                             json={"code": credential["pickup_code"]}).status_code, 200)
                for person, action in [(worker, "submit"), (buyer, "approve")]:
                    response = client.post(f"/v1/tasks/{task_id}/actions/{action}", headers=auth(person))
                    self.assertEqual(response.status_code, 200, response.text)
                self.assertEqual(client.get("/v1/wallet", headers=auth(worker)).json()["available"], 20)
                club = client.post("/dev/organizations", headers=auth(vendor),
                                   json={"name": "Club", "type": "club"}).json()
                event = client.post(f"/v1/organizations/{club['organization_id']}/events", headers=auth(vendor),
                                    json={"title": "Tech talk", "description": "Campus seminar",
                                          "starts_at": int(time.time()) + 3600, "capacity": 1, "price": 10}).json()
                ticket = client.post(f"/v1/events/{event['id']}/register", headers=auth(buyer))
                self.assertEqual(ticket.status_code, 200, ticket.text)
                ticket = ticket.json()
                self.assertEqual(client.post(f"/v1/tickets/{ticket['id']}/check-in", headers=auth(vendor),
                                             json={"code": ticket["code"]}).status_code, 200)
