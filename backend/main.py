from datetime import datetime, timezone
from hashlib import sha256
from pathlib import Path
from typing import Any
from uuid import uuid4

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.docs import get_redoc_html, get_swagger_ui_html
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
import json


DATA_FILE = Path(__file__).with_name("taskflow_data.json")
OPENAPI_URL = "/openapi.json"

app = FastAPI(
    title="TaskFlow API",
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:5173", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get(OPENAPI_URL, include_in_schema=False)
def openapi_schema() -> JSONResponse:
    return JSONResponse(app.openapi())


@app.get("/docs", include_in_schema=False)
def swagger_docs():
    return get_swagger_ui_html(openapi_url=OPENAPI_URL, title="TaskFlow API - Swagger UI")


@app.get("/redoc", include_in_schema=False)
def redoc_docs():
    return get_redoc_html(openapi_url=OPENAPI_URL, title="TaskFlow API - ReDoc")


class RegisterPayload(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    email: str = Field(pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    password: str = Field(min_length=6, max_length=120)


class LoginPayload(BaseModel):
    email: str = Field(pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    password: str = Field(min_length=6, max_length=120)


class TaskPayload(BaseModel):
    title: str = Field(min_length=1, max_length=160)
    notes: str = ""
    due_at: str | None = None
    priority: str = "Medium"
    category: str = "Personal"
    completed: bool = False


class ReorderPayload(BaseModel):
    task_ids: list[str]


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def load_db() -> dict[str, Any]:
    if not DATA_FILE.exists():
        return {"users": [], "tokens": {}, "tasks": {}}
    return json.loads(DATA_FILE.read_text(encoding="utf-8"))


def save_db(db: dict[str, Any]) -> None:
    DATA_FILE.write_text(json.dumps(db, indent=2), encoding="utf-8")


def hash_password(password: str) -> str:
    return sha256(password.encode("utf-8")).hexdigest()


def public_user(user: dict[str, Any]) -> dict[str, str]:
    return {"id": user["id"], "name": user["name"], "email": user["email"]}


def get_current_user(authorization: str | None = Header(default=None)) -> dict[str, Any]:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Login required")
    token = authorization.removeprefix("Bearer ").strip()
    db = load_db()
    user_id = db["tokens"].get(token)
    user = next((item for item in db["users"] if item["id"] == user_id), None)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid session")
    return user


def get_user_tasks(db: dict[str, Any], user_id: str) -> list[dict[str, Any]]:
    return sorted(db["tasks"].setdefault(user_id, []), key=lambda task: task["order"])


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/auth/register")
def register(payload: RegisterPayload) -> dict[str, Any]:
    db = load_db()
    if any(user["email"].lower() == payload.email.lower() for user in db["users"]):
        raise HTTPException(status_code=409, detail="An account with this email already exists")
    user = {
        "id": str(uuid4()),
        "name": payload.name.strip(),
        "email": payload.email.lower(),
        "password_hash": hash_password(payload.password),
        "created_at": now_iso(),
    }
    token = str(uuid4())
    db["users"].append(user)
    db["tokens"][token] = user["id"]
    db["tasks"][user["id"]] = []
    save_db(db)
    return {"token": token, "user": public_user(user)}


@app.post("/auth/login")
def login(payload: LoginPayload) -> dict[str, Any]:
    db = load_db()
    user = next((item for item in db["users"] if item["email"].lower() == payload.email.lower()), None)
    if not user or user["password_hash"] != hash_password(payload.password):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = str(uuid4())
    db["tokens"][token] = user["id"]
    save_db(db)
    return {"token": token, "user": public_user(user)}


@app.get("/tasks")
def list_tasks(user: dict[str, Any] = Depends(get_current_user)) -> list[dict[str, Any]]:
    db = load_db()
    return get_user_tasks(db, user["id"])


@app.post("/tasks")
def create_task(payload: TaskPayload, user: dict[str, Any] = Depends(get_current_user)) -> dict[str, Any]:
    db = load_db()
    tasks = get_user_tasks(db, user["id"])
    task = {
        **payload.model_dump(),
        "id": str(uuid4()),
        "order": len(tasks),
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    tasks.append(task)
    db["tasks"][user["id"]] = tasks
    save_db(db)
    return task


@app.put("/tasks/{task_id}")
def update_task(task_id: str, payload: TaskPayload, user: dict[str, Any] = Depends(get_current_user)) -> dict[str, Any]:
    db = load_db()
    tasks = get_user_tasks(db, user["id"])
    for task in tasks:
      if task["id"] == task_id:
          task.update(payload.model_dump())
          task["updated_at"] = now_iso()
          save_db(db)
          return task
    raise HTTPException(status_code=404, detail="Task not found")


@app.delete("/tasks/{task_id}")
def delete_task(task_id: str, user: dict[str, Any] = Depends(get_current_user)) -> dict[str, bool]:
    db = load_db()
    tasks = get_user_tasks(db, user["id"])
    next_tasks = [task for task in tasks if task["id"] != task_id]
    if len(next_tasks) == len(tasks):
        raise HTTPException(status_code=404, detail="Task not found")
    for index, task in enumerate(next_tasks):
        task["order"] = index
    db["tasks"][user["id"]] = next_tasks
    save_db(db)
    return {"ok": True}


@app.post("/tasks/reorder")
def reorder_tasks(payload: ReorderPayload, user: dict[str, Any] = Depends(get_current_user)) -> list[dict[str, Any]]:
    db = load_db()
    tasks = get_user_tasks(db, user["id"])
    order = {task_id: index for index, task_id in enumerate(payload.task_ids)}
    for task in tasks:
        task["order"] = order.get(task["id"], task["order"])
    db["tasks"][user["id"]] = sorted(tasks, key=lambda task: task["order"])
    save_db(db)
    return db["tasks"][user["id"]]
