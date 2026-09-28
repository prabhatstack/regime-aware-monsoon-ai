"""
Authentication and User Management Module.
Supports user registration, login, role-based access, and pre-seeded demo accounts.
"""

import os
import json
import hashlib
import secrets
from typing import Optional, Dict, Any, List
from pydantic import BaseModel, EmailStr
from fastapi import APIRouter, HTTPException, Depends, Header
from src.config import USERS_FILE

auth_router = APIRouter(prefix="/api/auth", tags=["Authentication"])

SESSIONS: Dict[str, Dict[str, Any]] = {}

class UserRegister(BaseModel):
    name: str
    email: str
    password: str
    role: Optional[str] = "Forecaster"  # Forecaster, Disaster Management, Researcher

class UserLogin(BaseModel):
    email: str
    password: str

def _hash_password(password: str, salt: str) -> str:
    return hashlib.sha256((password + salt).encode('utf-8')).hexdigest()

def _load_users() -> Dict[str, Dict[str, Any]]:
    if not os.path.exists(USERS_FILE):
        os.makedirs(os.path.dirname(USERS_FILE), exist_ok=True)
        # Pre-seed demo users
        initial_users = {
            "forecaster@imd.gov.in": {
                "id": "usr_imd_01",
                "name": "Dr. R. K. Jenamani",
                "email": "forecaster@imd.gov.in",
                "role": "IMD Lead Meteorologist",
                "salt": "demo_salt_1",
                "password_hash": _hash_password("imd2026", "demo_salt_1"),
                "organization": "India Meteorological Department (IMD)"
            },
            "disaster.mgmt@jharkhand.gov.in": {
                "id": "usr_dm_02",
                "name": "S. K. Soren, IAS",
                "email": "disaster.mgmt@jharkhand.gov.in",
                "role": "District Disaster Authority",
                "salt": "demo_salt_2",
                "password_hash": _hash_password("disaster2026", "demo_salt_2"),
                "organization": "Jharkhand State Disaster Management Authority"
            }
        }
        with open(USERS_FILE, "w") as f:
            json.dump(initial_users, f, indent=2)
        return initial_users

    with open(USERS_FILE, "r") as f:
        return json.load(f)

def _save_users(users: Dict[str, Dict[str, Any]]):
    os.makedirs(os.path.dirname(USERS_FILE), exist_ok=True)
    with open(USERS_FILE, "w") as f:
        json.dump(users, f, indent=2)

@auth_router.post("/register")
def register(user_data: UserRegister):
    users = _load_users()
    email = user_data.email.strip().lower()

    if email in users:
        raise HTTPException(status_code=400, detail="User with this email already exists.")

    salt = secrets.token_hex(8)
    user_id = f"usr_{secrets.token_hex(4)}"

    new_user = {
        "id": user_id,
        "name": user_data.name.strip(),
        "email": email,
        "role": user_data.role or "Forecaster",
        "salt": salt,
        "password_hash": _hash_password(user_data.password, salt),
        "organization": "Operational Weather & Climate Center"
    }

    users[email] = new_user
    _save_users(users)

    # Create session token
    token = f"token_{secrets.token_hex(16)}"
    user_payload = {
        "id": new_user["id"],
        "name": new_user["name"],
        "email": new_user["email"],
        "role": new_user["role"],
        "organization": new_user["organization"]
    }
    SESSIONS[token] = user_payload

    return {
        "message": "Registration successful",
        "token": token,
        "user": user_payload
    }

@auth_router.post("/login")
def login(credentials: UserLogin):
    users = _load_users()
    email = credentials.email.strip().lower()

    user = users.get(email)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid email or password.")

    hashed_attempt = _hash_password(credentials.password, user["salt"])
    if hashed_attempt != user["password_hash"]:
        raise HTTPException(status_code=401, detail="Invalid email or password.")

    token = f"token_{secrets.token_hex(16)}"
    user_payload = {
        "id": user["id"],
        "name": user["name"],
        "email": user["email"],
        "role": user["role"],
        "organization": user.get("organization", "Meteorological Center")
    }
    SESSIONS[token] = user_payload

    return {
        "message": "Login successful",
        "token": token,
        "user": user_payload
    }

@auth_router.get("/me")
def get_current_user(authorization: Optional[str] = Header(None)):
    if not authorization:
        raise HTTPException(status_code=401, detail="No authorization token provided.")

    token = authorization.replace("Bearer ", "").strip()
    user = SESSIONS.get(token)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid or expired session token.")

    return {"user": user}

@auth_router.post("/logout")
def logout(authorization: Optional[str] = Header(None)):
    if authorization:
        token = authorization.replace("Bearer ", "").strip()
        SESSIONS.pop(token, None)
    return {"message": "Logged out successfully"}
