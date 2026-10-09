"""First API slice: real persistence for tasks, conversations, and simulated KC."""
import os
from uuid import uuid4

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from .database import Database
from .market import MarketService
from .print_jobs import PrintService
from .security import secret, sign, verify
from .service import DomainError


app = FastAPI(title="KART backend", version="0.1.0")
origins = [value.strip() for value in os.getenv("KART_CORS_ORIGINS", "").split(",") if value.strip()]
if origins:
    app.add_middleware(CORSMiddleware, allow_origins=origins, allow_credentials=False,
                       allow_methods=["GET", "POST"], allow_headers=["Authorization", "Content-Type"])
service = PrintService(Database())


class TaskIn(BaseModel):
    title: str = Field(min_length=3, max_length=120)
    description: str = Field(min_length=3, max_length=4000)
    category: str = Field(min_length=1, max_length=60)
    anonymous: bool = False
    urgency: str = Field(pattern="^(urgent|scheduled|long_term)$")
    pricing: str = Field(pattern="^(fixed|bidding)$")
    budget: int = Field(gt=0, le=1_000_000)
    deadline: int
    order_id: str | None = None
    print_job_id: str | None = None


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


class OrganizationIn(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    type: str = Field(pattern="^(vendor|club)$")
    store_type: str | None = None


class ProductIn(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    description: str = Field(default="", max_length=2000)
    price: int = Field(gt=0, le=1_000_000)
    stock: int = Field(ge=0, le=1_000_000)


class CartItem(BaseModel):
    product_id: str
    quantity: int = Field(gt=0, le=50)


class CheckoutIn(BaseModel):
    store_id: str
    items: list[CartItem] = Field(min_length=1, max_length=50)
    request_key: str = Field(min_length=8, max_length=100)


class PickupIn(BaseModel):
    code: str | None = None


class ListingIn(BaseModel):
    title: str = Field(min_length=3, max_length=120)
    description: str = Field(min_length=3, max_length=4000)
    amount: int = Field(gt=0, le=1_000_000)
    kind: str = Field(pattern="^(sale|rental)$")


class ServiceIn(BaseModel):
    title: str = Field(min_length=3, max_length=120)
    description: str = Field(min_length=3, max_length=4000)
    amount: int = Field(gt=0, le=1_000_000)


class EventIn(BaseModel):
    title: str = Field(min_length=3, max_length=120)
    description: str = Field(min_length=3, max_length=4000)
    starts_at: int
    capacity: int = Field(gt=0, le=100_000)
    price: int = Field(ge=0, le=1_000_000)


class CodeIn(BaseModel):
    code: str = Field(min_length=10, max_length=100)


class BookingDecision(BaseModel):
    release_to_provider: bool


class PrintIn(BaseModel):
    store_id: str
    file_name: str = Field(min_length=5, max_length=120)
    pdf_base64: str = Field(min_length=8, max_length=7_000_000)
    pages: int = Field(ge=1, le=500)
    copies: int = Field(ge=1, le=20)
    color: bool = False
    duplex: bool = False
    spiral: bool = False


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


@app.get("/v1/tasks/{task_id}/recommendations")
def recommendations(task_id: str, user_id: str = Depends(current_user)):
    return call(service.bid_recommendations, user_id, task_id)


@app.post("/v1/tasks/{task_id}/bids/{bid_id}/accept")
def accept(task_id: str, bid_id: str, user_id: str = Depends(current_user)):
    return call(service.accept, user_id, task_id, bid_id)


@app.post("/v1/tasks/{task_id}/actions/{action}")
def transition(task_id: str, action: str, user_id: str = Depends(current_user)):
    return call(service.transition, user_id, task_id, action)


@app.get("/v1/tasks/{task_id}/pickup")
def pickup_credential(task_id: str, user_id: str = Depends(current_user)):
    return call(service.pickup_credential, user_id, task_id)


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


@app.post("/dev/organizations", status_code=201, include_in_schema=False)
def demo_organization(data: OrganizationIn, user_id: str = Depends(current_user)):
    return call(service.create_organization, user_id, data.name, data.type, data.store_type)


@app.get("/v1/organizations/mine")
def organizations(user_id: str = Depends(current_user)):
    return call(service.organizations, user_id)


@app.get("/v1/stores")
def stores(user_id: str = Depends(current_user)):
    return call(service.stores, user_id)


@app.get("/v1/catalog")
def catalog(store_id: str | None = None, user_id: str = Depends(current_user)):
    return call(service.catalog, user_id, store_id)


@app.post("/v1/stores/{store_id}/products", status_code=201)
def product(store_id: str, data: ProductIn, user_id: str = Depends(current_user)):
    return call(service.add_product, user_id, store_id, data.model_dump())


@app.post("/v1/orders", status_code=201)
def checkout(data: CheckoutIn, user_id: str = Depends(current_user)):
    return call(service.checkout, user_id, data.store_id, [i.model_dump() for i in data.items], data.request_key)


@app.get("/v1/orders")
def orders(store_id: str | None = None, user_id: str = Depends(current_user)):
    return call(service.orders, user_id, store_id)


@app.post("/v1/orders/{order_id}/advance")
def advance_order(order_id: str, data: PickupIn, user_id: str = Depends(current_user)):
    return call(service.advance_order, user_id, order_id, data.code)


@app.post("/v1/orders/{order_id}/cancel")
def cancel_order(order_id: str, user_id: str = Depends(current_user)):
    return call(service.cancel_order, user_id, order_id)


@app.post("/v1/print-jobs", status_code=201)
def print_request(data: PrintIn, user_id: str = Depends(current_user)):
    return call(service.submit_print_job, user_id, data.store_id, data.model_dump(exclude={"store_id"}))


@app.get("/v1/print-jobs")
def print_jobs(store_id: str | None = None, user_id: str = Depends(current_user)):
    return call(service.print_jobs, user_id, store_id)


@app.get("/v1/print-jobs/{job_id}/file")
def print_file(job_id: str, user_id: str = Depends(current_user)):
    path = call(service.print_file, user_id, job_id)
    return FileResponse(path, media_type="application/pdf", filename="print-job.pdf")


@app.post("/v1/print-jobs/{job_id}/advance")
def advance_print(job_id: str, data: PickupIn, user_id: str = Depends(current_user)):
    return call(service.advance_print, user_id, job_id, data.code)


@app.post("/v1/print-jobs/{job_id}/cancel")
def cancel_print(job_id: str, user_id: str = Depends(current_user)):
    return call(service.cancel_print, user_id, job_id)


@app.get("/v1/listings")
def listings(user_id: str = Depends(current_user)):
    return call(service.listings, user_id)


@app.post("/v1/listings", status_code=201)
def create_listing(data: ListingIn, user_id: str = Depends(current_user)):
    return call(service.create_listing, user_id, data.model_dump())


@app.post("/v1/listings/{listing_id}/reserve")
def reserve_listing(listing_id: str, user_id: str = Depends(current_user)):
    return call(service.reserve_listing, user_id, listing_id)


@app.post("/v1/listings/{listing_id}/actions/{action}")
def listing_action(listing_id: str, action: str, user_id: str = Depends(current_user)):
    return call(service.listing_action, user_id, listing_id, action)


@app.get("/v1/services")
def services(user_id: str = Depends(current_user)):
    return call(service.services, user_id)


@app.post("/v1/services", status_code=201)
def create_service(data: ServiceIn, user_id: str = Depends(current_user)):
    return call(service.create_service, user_id, data.model_dump())


@app.post("/v1/services/{service_id}/book")
def book_service(service_id: str, user_id: str = Depends(current_user)):
    return call(service.book_service, user_id, service_id)


@app.get("/v1/bookings")
def bookings(user_id: str = Depends(current_user)):
    return call(service.bookings, user_id)


@app.post("/v1/bookings/{booking_id}/actions/{action}")
def booking_action(booking_id: str, action: str, user_id: str = Depends(current_user)):
    return call(service.booking_action, user_id, booking_id, action)


@app.post("/v1/bookings/{booking_id}/resolve")
def resolve_booking(booking_id: str, data: BookingDecision, user_id: str = Depends(current_user)):
    return call(service.resolve_booking, user_id, booking_id, data.release_to_provider)


@app.get("/v1/events")
def events(user_id: str = Depends(current_user)):
    return call(service.events, user_id)


@app.post("/v1/organizations/{organization_id}/events", status_code=201)
def create_event(organization_id: str, data: EventIn, user_id: str = Depends(current_user)):
    return call(service.create_event, user_id, organization_id, data.model_dump())


@app.post("/v1/events/{event_id}/register")
def register_event(event_id: str, user_id: str = Depends(current_user)):
    return call(service.register_event, user_id, event_id)


@app.get("/v1/tickets")
def tickets(user_id: str = Depends(current_user)):
    return call(service.tickets, user_id)


@app.post("/v1/tickets/{ticket_id}/check-in")
def check_in(ticket_id: str, data: CodeIn, user_id: str = Depends(current_user)):
    return call(service.check_in, user_id, ticket_id, data.code)
