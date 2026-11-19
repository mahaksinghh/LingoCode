import hashlib
import re
import secrets
from typing import Annotated
from uuid import uuid4

from fastapi import APIRouter, Depends, Header, HTTPException, Response
from pydantic import BaseModel, Field, field_validator

from db import connect

router = APIRouter(prefix="/api/auth")
TOKEN = r"^[0-9a-f]{64}$"


class Credentials(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=10, max_length=128)
    legacy_key: str | None = Field(default=None, pattern=TOKEN)

    @field_validator("email")
    @classmethod
    def valid_email(cls, value: str) -> str:
        email = value.strip().lower()
        if not re.fullmatch(r"[^\s@\x00]+@[^\s@\x00]+\.[^\s@\x00]+", email):
            raise ValueError("Enter a valid email address")
        return email


class Session(BaseModel):
    token: str
    email: str


def digest(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def password_hash(password: str, salt: str) -> str:
    value = hashlib.scrypt(
        password.encode(), salt=bytes.fromhex(salt), n=32768, r=8, p=1, maxmem=64 * 1024 * 1024
    )
    return f"{salt}:{value.hex()}"


def access_key(authorization: Annotated[str, Header()] = "") -> str:
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not re.fullmatch(TOKEN, token):
        raise unauthenticated()
    return digest(token)


def unauthenticated() -> HTTPException:
    return HTTPException(401, "Sign in to continue", {"WWW-Authenticate": "Bearer"})


TokenHash = Annotated[str, Depends(access_key)]


def session_account(key: TokenHash):
    with connect() as conn:
        account = conn.execute(
            "SELECT a.id, a.email FROM sessions s JOIN accounts a ON a.id = s.account_id "
            "WHERE s.token_hash = %s AND s.expires_at > now()",
            (key,),
        ).fetchone()
    if account is None:
        raise unauthenticated()
    return account


def owner_key(key: TokenHash) -> str:
    return f"account:{session_account(key)['id']}"


Owner = Annotated[str, Depends(owner_key)]


def new_session(conn, account_id, credentials: Credentials) -> Session:
    token = secrets.token_hex(32)
    conn.execute("DELETE FROM sessions WHERE expires_at <= now()")
    conn.execute(
        "INSERT INTO sessions VALUES (%s, %s, now() + interval '14 days')",
        (digest(token), account_id),
    )
    if credentials.legacy_key:
        conn.execute(
            "UPDATE projects SET owner = %s WHERE owner = %s",
            (f"account:{account_id}", digest(credentials.legacy_key)),
        )
    return Session(token=token, email=credentials.email)


@router.post("/register", status_code=201)
def register(credentials: Credentials, response: Response) -> Session:
    response.headers["Cache-Control"] = "no-store"
    account_id = uuid4()
    hashed = password_hash(credentials.password, secrets.token_hex(16))
    with connect() as conn:
        result = conn.execute(
            "INSERT INTO accounts VALUES (%s, %s, %s) ON CONFLICT (email) DO NOTHING",
            (account_id, credentials.email, hashed),
        )
        if not result.rowcount:
            raise HTTPException(409, "Account already exists")
        return new_session(conn, account_id, credentials)


@router.post("/login")
def login(credentials: Credentials, response: Response) -> Session:
    response.headers["Cache-Control"] = "no-store"
    with connect() as conn:
        account = conn.execute(
            "SELECT id, password_hash FROM accounts WHERE email = %s", (credentials.email,)
        ).fetchone()
    expected = account["password_hash"] if account else f"{'00' * 16}:{'00' * 64}"
    actual = password_hash(credentials.password, expected.split(":")[0])
    if account is None or not secrets.compare_digest(expected, actual):
        raise HTTPException(401, "Invalid email or password")
    with connect() as conn:
        return new_session(conn, account["id"], credentials)


@router.get("/me")
def me(account: Annotated[dict, Depends(session_account)]):
    return {"email": account["email"]}


@router.post("/logout", status_code=204)
def logout(key: TokenHash):
    with connect() as conn:
        conn.execute("DELETE FROM sessions WHERE token_hash = %s", (key,))
