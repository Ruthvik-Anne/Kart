"""Campus-scoped task workflow and simulated funding invariants."""
import sqlite3
import time
from uuid import uuid4

from .database import Database
from .ledger import LedgerError, balance, post, reserve, wallet


class DomainError(ValueError):
    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.status = status


def _id() -> str:
    return str(uuid4())


class KartService:
    def __init__(self, database: Database):
        self.database = database

    @staticmethod
    def _actor(db: sqlite3.Connection, user_id: str):
        actor = db.execute("SELECT * FROM users WHERE id=?", (user_id,)).fetchone()
        if actor is None:
            raise DomainError("Unknown user", 401)
        return actor

    @staticmethod
    def _task(db: sqlite3.Connection, actor: sqlite3.Row, task_id: str):
        task = db.execute("SELECT * FROM tasks WHERE id=? AND campus_id=?", (task_id, actor["campus_id"])).fetchone()
        if task is None:
            raise DomainError("Task not found", 404)
        if task["status"] != "open" and actor["id"] not in (task["poster_id"], task["assignee_id"]) and actor["role"] not in ("campus_admin", "platform_admin"):
            raise DomainError("Task not found", 404)
        return task

    @staticmethod
    def _student(actor: sqlite3.Row):
        if actor["role"] != "student" or not actor["verified"]:
            raise DomainError("Verified student required", 403)

    @staticmethod
    def _audit(db, actor, action, target):
        db.execute("INSERT INTO audit_events VALUES (?,?,?,?,?,?)", (
            _id(), actor["campus_id"], actor["id"], action, target, int(time.time()),
        ))

    @staticmethod
    def _project(task, actor):
        result = dict(task)
        if result["anonymous"] and actor["id"] != task["poster_id"]:
            result.pop("poster_id")
            result["poster_alias"] = "Campus Member " + task["id"][:8]
        result.pop("anonymous")
        result["anonymous"] = bool(task["anonymous"])
        if actor["id"] not in (task["poster_id"], task["assignee_id"]):
            result.pop("assignee_id")
            result.pop("agreed_amount")
        return result

    def list_tasks(self, user_id: str):
        with self.database.connect() as db:
            actor = self._actor(db, user_id)
            tasks = db.execute("""SELECT * FROM tasks WHERE campus_id=? AND
                 (status='open' OR poster_id=? OR assignee_id=?) ORDER BY created_at DESC""",
                (actor["campus_id"], user_id, user_id)).fetchall()
            return [self._project_with_source(db, t, actor) for t in tasks]

    @classmethod
    def _project_with_source(cls, db, task, actor):
        result = cls._project(task, actor)
        if actor["id"] in (task["poster_id"], task["assignee_id"]):
            link = db.execute("""SELECT o.id,o.status,s.name AS store_name FROM task_order_links l
                JOIN orders o ON o.id=l.order_id JOIN stores s ON s.id=o.store_id WHERE l.task_id=?""",
                (task["id"],)).fetchone()
            if link:
                result["source_order"] = dict(link)
        return result

    def task(self, user_id: str, task_id: str):
        with self.database.connect() as db:
            actor = self._actor(db, user_id)
            task = self._task(db, actor, task_id)
            return self._project_with_source(db, task, actor)

    def create_task(self, user_id: str, data: dict):
        with self.database.transaction() as db:
            actor = self._actor(db, user_id)
            self._student(actor)
            if data["deadline"] <= time.time():
                raise DomainError("Deadline must be in the future")
            task_id = _id()
            db.execute("""INSERT INTO tasks (id,campus_id,poster_id,title,description,category,anonymous,
                urgency,pricing,budget,deadline,status,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)""", (
                task_id, actor["campus_id"], user_id, data["title"], data["description"],
                data["category"], int(data["anonymous"]), data["urgency"], data["pricing"],
                data["budget"], data["deadline"], "open", int(time.time()),
            ))
            if data.get("order_id"):
                order = db.execute("SELECT * FROM orders WHERE id=? AND buyer_id=? AND campus_id=?", (
                    data["order_id"], user_id, actor["campus_id"])).fetchone()
                if not order or order["status"] == "cancelled":
                    raise DomainError("Linked order not found", 404)
                db.execute("INSERT INTO task_order_links VALUES (?,?)", (task_id, order["id"]))
            self._audit(db, actor, "task.created", task_id)
            return {"id": task_id, "status": "open"}

    def bid(self, user_id: str, task_id: str, data: dict):
        with self.database.transaction() as db:
            actor = self._actor(db, user_id)
            self._student(actor)
            task = self._task(db, actor, task_id)
            if task["status"] != "open" or task["deadline"] <= time.time():
                raise DomainError("Task is closed for bids", 409)
            if task["poster_id"] == user_id:
                raise DomainError("Cannot bid on your own task", 403)
            if task["pricing"] == "fixed" and data["amount"] != task["budget"]:
                raise DomainError("Fixed reward bid must match the task budget")
            if data["amount"] > task["budget"]:
                raise DomainError("Bid exceeds the funded budget")
            bid_id = _id()
            try:
                db.execute("INSERT INTO bids VALUES (?,?,?,?,?,?,?)", (
                    bid_id, task_id, user_id, data["amount"], data["eta_minutes"], data["note"], int(time.time()),
                ))
            except sqlite3.IntegrityError:
                raise DomainError("You already bid on this task", 409) from None
            self._audit(db, actor, "task.bid", task_id)
            return {"id": bid_id}

    def bids(self, user_id: str, task_id: str):
        with self.database.connect() as db:
            actor = self._actor(db, user_id)
            task = self._task(db, actor, task_id)
            if task["poster_id"] != user_id:
                raise DomainError("Only the poster can compare bids", 403)
            return [dict(b) for b in db.execute("SELECT * FROM bids WHERE task_id=? ORDER BY amount,created_at", (task_id,))]

    def bid_recommendations(self, user_id: str, task_id: str):
        """Explainable feasibility and ranking; the poster still chooses the worker."""
        with self.database.connect() as db:
            actor = self._actor(db, user_id)
            task = self._task(db, actor, task_id)
            if task["poster_id"] != user_id:
                raise DomainError("Only the poster can compare bids", 403)
            rows = db.execute("""SELECT b.*,
                (SELECT COUNT(*) FROM tasks t WHERE t.assignee_id=b.bidder_id AND t.status='completed') AS completed,
                (SELECT COUNT(*) FROM tasks t WHERE t.assignee_id=b.bidder_id AND t.status='cancelled') AS cancelled,
                (SELECT COUNT(*) FROM tasks t WHERE t.assignee_id=b.bidder_id) AS assignments
                FROM bids b WHERE b.task_id=?""", (task_id,)).fetchall()
            if not rows:
                return {"estimate_minutes": None, "confidence": "none", "ranked": []}
            times = sorted(b["eta_minutes"] for b in rows)
            median = times[len(times) // 2]
            estimate = {"low": max(1, int(median * 0.8)), "high": int(median * 1.3) + 1}
            max_eta = max(b["eta_minutes"] for b in rows)
            max_price = max(b["amount"] for b in rows)
            ranked = []
            for bid in rows:
                feasible = int(time.time()) + bid["eta_minutes"] * 60 <= task["deadline"]
                price_score = 1 - bid["amount"] / (max_price + 1)
                speed_score = 1 - bid["eta_minutes"] / (max_eta + 1)
                reliability = (bid["completed"] + 1) / (bid["completed"] + bid["cancelled"] + 2)
                opportunity = 1 / (bid["assignments"] + 1)
                weights = (0.25, 0.45, 0.20, 0.10) if task["urgency"] == "urgent" else (0.40, 0.25, 0.25, 0.10)
                score = round(100 * sum(a * b for a, b in zip(weights, (price_score, speed_score, reliability, opportunity))), 1)
                ranked.append({"bid_id": bid["id"], "bidder_id": bid["bidder_id"], "amount": bid["amount"],
                               "eta_minutes": bid["eta_minutes"], "feasible": feasible, "score": score,
                               "completed": bid["completed"], "cancelled": bid["cancelled"],
                               "reason": "Fits the deadline" if feasible else "ETA exceeds the deadline"})
            ranked.sort(key=lambda r: (not r["feasible"], -r["score"], r["bid_id"]))
            return {"estimate_minutes": estimate, "confidence": "medium" if len(rows) >= 3 else "low",
                    "ranked": ranked, "method": "deterministic-v1"}

    def accept(self, user_id: str, task_id: str, bid_id: str):
        with self.database.transaction() as db:
            actor = self._actor(db, user_id)
            task = self._task(db, actor, task_id)
            if task["poster_id"] != user_id:
                raise DomainError("Only the poster may assign a task", 403)
            if task["status"] != "open" or task["deadline"] <= time.time():
                raise DomainError("Task is no longer assignable", 409)
            bid = db.execute("SELECT * FROM bids WHERE id=? AND task_id=?", (bid_id, task_id)).fetchone()
            if not bid:
                raise DomainError("Bid not found", 404)
            if int(time.time()) + bid["eta_minutes"] * 60 > task["deadline"]:
                raise DomainError("Worker ETA exceeds task deadline", 409)
            worker = self._actor(db, bid["bidder_id"])
            self._student(worker)
            if worker["campus_id"] != actor["campus_id"]:
                raise DomainError("Worker is in another campus", 403)
            try:
                post(db, key=f"task:{task_id}:reserve", kind="task_reserve", ref=task_id,
                     debit=wallet(user_id), credit=reserve(task_id), amount=bid["amount"])
            except LedgerError as exc:
                raise DomainError(str(exc), 409) from exc
            db.execute("UPDATE tasks SET status='assigned',assignee_id=?,agreed_amount=? WHERE id=?",
                       (worker["id"], bid["amount"], task_id))
            self._audit(db, actor, "task.assigned", task_id)
            return {"id": task_id, "status": "assigned", "agreed_amount": bid["amount"]}

    def transition(self, user_id: str, task_id: str, action: str):
        rules = {
            "start": ("assigned", "in_progress", "assignee"),
            "submit": ("in_progress", "review", "assignee"),
            "approve": ("review", "completed", "poster"),
            "cancel": ("open", "cancelled", "poster"),
            "cancel_assigned": ("assigned", "cancelled", "poster"),
            "dispute": ("review", "disputed", "either"),
        }
        if action not in rules:
            raise DomainError("Unknown action", 404)
        with self.database.transaction() as db:
            actor = self._actor(db, user_id)
            task = self._task(db, actor, task_id)
            before, after, who = rules[action]
            allowed = {"poster": [task["poster_id"]], "assignee": [task["assignee_id"]],
                       "either": [task["poster_id"], task["assignee_id"]]}[who]
            if user_id not in allowed:
                raise DomainError("Not a task participant", 403)
            if task["status"] != before:
                raise DomainError("Invalid task transition", 409)
            if action == "start":
                linked = db.execute("""SELECT o.status FROM task_order_links l JOIN orders o ON o.id=l.order_id
                    WHERE l.task_id=?""", (task_id,)).fetchone()
                if linked and linked["status"] != "ready":
                    raise DomainError("Linked order must be ready for pickup", 409)
            if action == "approve":
                post(db, key=f"task:{task_id}:release", kind="task_release", ref=task_id,
                     debit=reserve(task_id), credit=wallet(task["assignee_id"]), amount=task["agreed_amount"])
            elif action == "cancel_assigned":
                post(db, key=f"task:{task_id}:refund", kind="task_refund", ref=task_id,
                     debit=reserve(task_id), credit=wallet(task["poster_id"]), amount=task["agreed_amount"])
            db.execute("UPDATE tasks SET status=? WHERE id=?", (after, task_id))
            self._audit(db, actor, "task." + action, task_id)
            return {"id": task_id, "status": after}

    def pickup_credential(self, user_id: str, task_id: str):
        from .security import secret
        import hashlib
        import hmac

        with self.database.connect() as db:
            actor = self._actor(db, user_id)
            task = self._task(db, actor, task_id)
            if user_id != task["assignee_id"] or task["status"] not in ("assigned", "in_progress"):
                raise DomainError("Pickup authorization unavailable", 403)
            order = db.execute("""SELECT o.id,o.status FROM task_order_links l JOIN orders o ON o.id=l.order_id
                WHERE l.task_id=?""", (task_id,)).fetchone()
            if not order or order["status"] != "ready":
                raise DomainError("Order is not ready", 409)
            credential = hmac.new(secret().encode(), order["id"].encode(), hashlib.sha256).hexdigest()[:24]
            return {"order_id": order["id"], "pickup_code": credential}

    def messages(self, user_id: str, task_id: str, bidder_id: str | None = None):
        with self.database.connect() as db:
            actor = self._actor(db, user_id)
            task = self._task(db, actor, task_id)
            thread = self._thread(db, task, user_id, bidder_id)
            messages = [dict(m) for m in db.execute(
                "SELECT id,sender_id,body,created_at FROM messages WHERE task_id=? AND thread_key=? ORDER BY created_at,id",
                (task_id, thread))]
            if task["anonymous"] and user_id != task["poster_id"]:
                for message in messages:
                    if message["sender_id"] == task["poster_id"]:
                        message["sender_id"] = "anonymous-poster"
            return messages

    @staticmethod
    def _thread(db, task, user_id, bidder_id):
        if bidder_id:
            bid = db.execute("SELECT 1 FROM bids WHERE task_id=? AND bidder_id=?", (task["id"], bidder_id)).fetchone()
            if not bid or user_id not in (task["poster_id"], bidder_id):
                raise DomainError("Thread not found", 404)
            return "bid:" + bidder_id
        if task["status"] == "open" or user_id not in (task["poster_id"], task["assignee_id"]):
            raise DomainError("Thread not found", 404)
        return "assignment"

    def message(self, user_id: str, task_id: str, body: str, bidder_id: str | None = None):
        with self.database.transaction() as db:
            actor = self._actor(db, user_id)
            task = self._task(db, actor, task_id)
            thread = self._thread(db, task, user_id, bidder_id)
            if task["status"] in ("cancelled", "completed"):
                raise DomainError("Conversation is closed", 409)
            message_id = _id()
            db.execute("INSERT INTO messages VALUES (?,?,?,?,?,?)", (
                message_id, task_id, thread, user_id, body, int(time.time()),
            ))
            return {"id": message_id}

    def demo_grant(self, user_id: str, amount: int, key: str):
        with self.database.transaction() as db:
            actor = self._actor(db, user_id)
            self._student(actor)
            try:
                post(db, key=f"demo:{user_id}:{key}", kind="demo_grant", ref=user_id,
                     debit="demo:issuer", credit=wallet(user_id), amount=amount)
            except LedgerError as exc:
                raise DomainError(str(exc), 409) from exc
            return {"balance": balance(db, wallet(user_id))}

    def wallet(self, user_id: str):
        with self.database.connect() as db:
            self._actor(db, user_id)
            return {"unit": "KC (simulation)", "available": balance(db, wallet(user_id)),
                    "reserved": db.execute("""SELECT COALESCE(SUM(t.agreed_amount),0) AS n FROM tasks t
                        WHERE t.poster_id=? AND t.status IN ('assigned','in_progress','review','disputed')""",
                        (user_id,)).fetchone()["n"]}

    def resolve_dispute(self, user_id: str, task_id: str, release_to_worker: bool):
        with self.database.transaction() as db:
            actor = self._actor(db, user_id)
            task = self._task(db, actor, task_id)
            if actor["role"] not in ("campus_admin", "platform_admin"):
                raise DomainError("Administrator required", 403)
            if task["status"] != "disputed":
                raise DomainError("Task is not disputed", 409)
            post(db, key=f"task:{task_id}:resolve", kind="task_dispute_resolution", ref=task_id,
                 debit=reserve(task_id),
                 credit=wallet(task["assignee_id"] if release_to_worker else task["poster_id"]),
                 amount=task["agreed_amount"])
            db.execute("UPDATE tasks SET status=? WHERE id=?", ("completed" if release_to_worker else "cancelled", task_id))
            self._audit(db, actor, "task.dispute_resolved", task_id)
            return {"id": task_id, "status": "completed" if release_to_worker else "cancelled"}
