"""First API slice: real persistence for tasks, conversations, and simulated KC."""
import os
from uuid import uuid4

from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

from .database import Database
from .security import secret, sign, verify
from .service import DomainError, KartService


app = FastAPI(title="KART backend", version="0.1.0")
service = KartService(Database())


class TaskIn(BaseModel):
    title: str = Field(min_length=3, max_length=120)
    description: str = Field(min_length=3, max_length=4000)
    category: str = Field(min_length=1, max_length=60)
    anonymous: bool = False
    urgency: str = Field(pattern="^(urgent|scheduled|long_term)$")
    pricing: str = Field(pattern="^(fixed|bidding)$")
    budget: int = Field(gt=0, le=1_000_000)
    deadline: int


class BidIn(BaseModel):
    amount: int = Field(gt=0, le=1_000_000)
    eta_minutes: int = Field(gt=0, le=100_800)
    note: str = Field(default="", max_length=1000)


class MessageIn(BaseModel):
    body: str = Field(min_length=1, max_length=4000)
    bidder_id: str | None = None


class DemoUser(BaseModel):
    campus_id: str = Field(min_length=2, max_length=60, pattern="^[a-zA-Z0-9_-]+$")
    name: str = Field(min_length=2, max_length=80)


class GrantIn(BaseModel):
    amount: int = Field(gt=0, le=10_000)
    key: str = Field(min_length=8, max_length=100)


class DisputeDecision(BaseModel):
    release_to_worker: bool


def current_user(authorization: str = Header(default="")) -> str:
    if os.getenv("KART_DEMO_MODE") != "1":
        raise HTTPException(503, "Identity integration is not configured")
    token = authorization.removeprefix("Bearer ") if authorization.startswith("Bearer ") else ""
    user_id = verify(token, secret()) if token else None
    if not user_id:
        raise HTTPException(401, "Invalid or expired session")
    return user_id


def call(fn, *args, **kwargs):
    try:
        return fn(*args, **kwargs)
    except DomainError as exc:
        raise HTTPException(exc.status, str(exc)) from exc


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/dev/users", status_code=201, include_in_schema=False)
def demo_user(data: DemoUser):
    if os.getenv("KART_DEMO_MODE") != "1":
        raise HTTPException(404, "Not found")
    user_id = str(uuid4())
    with service.database.transaction() as db:
        db.execute("INSERT OR IGNORE INTO campuses VALUES (?,?)", (data.campus_id, data.campus_id))
        db.execute("INSERT INTO users VALUES (?,?,?,?,?)", (user_id, data.campus_id, data.name, "student", 1))
    return {"id": user_id, "token": sign(user_id, secret())}


@app.post("/dev/kc-grants", include_in_schema=False)
def demo_grant(data: GrantIn, user_id: str = Depends(current_user)):
    if os.getenv("KART_DEMO_MODE") != "1":
        raise HTTPException(404, "Not found")
    return call(service.demo_grant, user_id, data.amount, data.key)


@app.get("/v1/tasks")
def tasks(user_id: str = Depends(current_user)):
    return call(service.list_tasks, user_id)


@app.post("/v1/tasks", status_code=201)
def create_task(data: TaskIn, user_id: str = Depends(current_user)):
    return call(service.create_task, user_id, data.model_dump())


@app.get("/v1/tasks/{task_id}")
def task(task_id: str, user_id: str = Depends(current_user)):
    return call(service.task, user_id, task_id)


@app.post("/v1/tasks/{task_id}/bids", status_code=201)
def bid(task_id: str, data: BidIn, user_id: str = Depends(current_user)):
    return call(service.bid, user_id, task_id, data.model_dump())


@app.get("/v1/tasks/{task_id}/bids")
def bids(task_id: str, user_id: str = Depends(current_user)):
    return call(service.bids, user_id, task_id)


@app.post("/v1/tasks/{task_id}/bids/{bid_id}/accept")
def accept(task_id: str, bid_id: str, user_id: str = Depends(current_user)):
    return call(service.accept, user_id, task_id, bid_id)


@app.post("/v1/tasks/{task_id}/actions/{action}")
def transition(task_id: str, action: str, user_id: str = Depends(current_user)):
    return call(service.transition, user_id, task_id, action)


@app.post("/v1/tasks/{task_id}/resolve")
def resolve(task_id: str, data: DisputeDecision, user_id: str = Depends(current_user)):
    return call(service.resolve_dispute, user_id, task_id, data.release_to_worker)


@app.get("/v1/tasks/{task_id}/messages")
def messages(task_id: str, bidder_id: str | None = None, user_id: str = Depends(current_user)):
    return call(service.messages, user_id, task_id, bidder_id)


@app.post("/v1/tasks/{task_id}/messages", status_code=201)
def message(task_id: str, data: MessageIn, user_id: str = Depends(current_user)):
    return call(service.message, user_id, task_id, data.body, data.bidder_id)


@app.get("/v1/wallet")
def wallet(user_id: str = Depends(current_user)):
    return call(service.wallet, user_id)
