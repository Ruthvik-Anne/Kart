"""OIDC authorization-code login and opaque, revocable browser sessions.

The issuer, endpoints, audience and campus email domains are operator-controlled.
No token claim is trusted until its signature and issuer/audience/nonce are checked.
"""
import base64
import hashlib
import hmac
import json
import os
import secrets
import time
from functools import lru_cache
from urllib.parse import urlencode, urlparse
from uuid import uuid4

import httpx
import jwt
from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse, RedirectResponse


SESSION_COOKIE = "kart_session"
STATE_COOKIE = "kart_oauth_state"
SESSION_SECONDS = 8 * 3600


def _hash(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def _b64(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode()


def _config() -> dict:
    names = ("KART_OIDC_ISSUER", "KART_OIDC_AUTHORIZE_URL", "KART_OIDC_TOKEN_URL",
             "KART_OIDC_JWKS_URL", "KART_OIDC_CLIENT_ID", "KART_OIDC_CLIENT_SECRET",
             "KART_OIDC_REDIRECT_URI", "KART_CAMPUS_DOMAINS")
    config = {name: os.getenv(name, "") for name in names}
    if not all(config.values()):
        raise HTTPException(503, "Campus identity provider is not configured")
    for name in ("KART_OIDC_ISSUER", "KART_OIDC_AUTHORIZE_URL", "KART_OIDC_TOKEN_URL",
                 "KART_OIDC_JWKS_URL", "KART_OIDC_REDIRECT_URI"):
        if urlparse(config[name]).scheme != "https" or not urlparse(config[name]).netloc:
            raise HTTPException(503, "OIDC URLs require HTTPS")
    try:
        domains = json.loads(config["KART_CAMPUS_DOMAINS"])
        if not isinstance(domains, dict) or not domains or any(
            not isinstance(k, str) or k != k.lower() or not isinstance(v, str) or not v
            for k, v in domains.items()
        ):
            raise ValueError("Invalid campus domains")
    except (ValueError, TypeError):
        raise HTTPException(503, "Invalid campus domain configuration") from None
    config["domains"] = domains
    return config


def _secure() -> bool:
    return os.getenv("KART_COOKIE_SECURE", "1") != "0"


@lru_cache(maxsize=8)
def _jwks(url: str):
    return jwt.PyJWKClient(url, timeout=5, lifespan=300)


def start(database):
    config = _config()
    state, nonce, verifier = secrets.token_urlsafe(32), secrets.token_urlsafe(32), secrets.token_urlsafe(48)
    challenge = _b64(hashlib.sha256(verifier.encode()).digest())
    now = int(time.time())
    with database.transaction() as db:
        db.execute("DELETE FROM auth_states WHERE expires_at<?", (now,))
        db.execute("INSERT INTO auth_states VALUES (?,?,?,?)", (_hash(state), verifier, nonce, now + 600))
    url = config["KART_OIDC_AUTHORIZE_URL"] + "?" + urlencode({
        "response_type": "code", "client_id": config["KART_OIDC_CLIENT_ID"],
        "redirect_uri": config["KART_OIDC_REDIRECT_URI"], "scope": "openid email profile",
        "state": state, "nonce": nonce, "code_challenge": challenge, "code_challenge_method": "S256",
    })
    response = RedirectResponse(url)
    response.set_cookie(STATE_COOKIE, state, max_age=600, httponly=True, secure=_secure(),
                        samesite="lax", path="/api/backend/auth")
    return response


def callback(database, request: Request, code: str, state: str):
    config = _config()
    cookie_state = request.cookies.get(STATE_COOKIE, "")
    if not state or not hmac.compare_digest(state, cookie_state):
        raise HTTPException(400, "Invalid login state")
    with database.transaction() as db:
        row = db.execute("SELECT * FROM auth_states WHERE state_hash=?", (_hash(state),)).fetchone()
        db.execute("DELETE FROM auth_states WHERE state_hash=?", (_hash(state),))
    if not row or row["expires_at"] <= time.time():
        raise HTTPException(400, "Login state expired")
    try:
        token_response = httpx.post(config["KART_OIDC_TOKEN_URL"], data={
            "grant_type": "authorization_code", "code": code,
            "redirect_uri": config["KART_OIDC_REDIRECT_URI"],
            "client_id": config["KART_OIDC_CLIENT_ID"],
            "client_secret": config["KART_OIDC_CLIENT_SECRET"],
            "code_verifier": row["verifier"],
        }, timeout=5)
        token_response.raise_for_status()
        id_token = token_response.json()["id_token"]
        key = _jwks(config["KART_OIDC_JWKS_URL"]).get_signing_key_from_jwt(id_token)
        claims = jwt.decode(id_token, key.key, algorithms=["RS256"],
                            audience=config["KART_OIDC_CLIENT_ID"], issuer=config["KART_OIDC_ISSUER"],
                            options={"require": ["exp", "iat", "iss", "sub", "aud"]})
    except (httpx.HTTPError, KeyError, ValueError, jwt.PyJWTError) as exc:
        raise HTTPException(401, "Identity verification failed") from exc
    if not hmac.compare_digest(str(claims.get("nonce", "")), row["nonce"]):
        raise HTTPException(401, "Identity nonce mismatch")
    audiences = claims.get("aud")
    if isinstance(audiences, list) and len(audiences) > 1 and claims.get("azp") != config["KART_OIDC_CLIENT_ID"]:
        raise HTTPException(401, "Invalid authorized party")
    email = claims.get("email", "")
    if claims.get("email_verified") is not True or not isinstance(email, str):
        raise HTTPException(403, "Verified campus email required")
    email = email.strip().lower()
    domain = email.rpartition("@")[2]
    campus_id = config["domains"].get(domain)
    if not campus_id or email.count("@") != 1:
        raise HTTPException(403, "Campus is not enabled")
    subject = claims["sub"]
    if not isinstance(subject, str) or not subject:
        raise HTTPException(401, "Invalid subject")
    name = str(claims.get("name") or email.split("@")[0])[:80]
    admin_emails = {value.strip().lower() for value in os.getenv("KART_BOOTSTRAP_ADMINS", "").split(",") if value.strip()}
    now, token, csrf = int(time.time()), secrets.token_urlsafe(48), secrets.token_urlsafe(32)
    with database.transaction() as db:
        identity = db.execute("SELECT user_id FROM external_identities WHERE issuer=? AND subject=?",
                              (config["KART_OIDC_ISSUER"], subject)).fetchone()
        if identity:
            user_id = identity["user_id"]
            user = db.execute("SELECT campus_id,verified FROM users WHERE id=?", (user_id,)).fetchone()
            if not user or user["campus_id"] != campus_id or not user["verified"]:
                raise HTTPException(403, "Account is disabled or moved to another campus")
            db.execute("UPDATE external_identities SET email=? WHERE issuer=? AND subject=?",
                       (email, config["KART_OIDC_ISSUER"], subject))
        else:
            user_id = str(uuid4())
            db.execute("INSERT OR IGNORE INTO campuses VALUES (?,?)", (campus_id, campus_id))
            db.execute("INSERT INTO users VALUES (?,?,?,?,?)", (
                user_id, campus_id, name, "campus_admin" if email in admin_emails else "student", 1))
            db.execute("INSERT INTO external_identities VALUES (?,?,?,?)",
                       (config["KART_OIDC_ISSUER"], subject, user_id, email))
        db.execute("DELETE FROM sessions WHERE expires_at<?", (now,))
        db.execute("INSERT INTO sessions VALUES (?,?,?,?,?)", (_hash(token), user_id, csrf, now + SESSION_SECONDS, now))
    response = RedirectResponse("/live")
    response.delete_cookie(STATE_COOKIE, path="/api/backend/auth")
    response.set_cookie(SESSION_COOKIE, token, max_age=SESSION_SECONDS, httponly=True,
                        secure=_secure(), samesite="lax", path="/api/backend")
    return response


def session(database, request: Request):
    token = request.cookies.get(SESSION_COOKIE, "")
    if not token:
        raise HTTPException(401, "Sign in required")
    with database.connect() as db:
        row = db.execute("""SELECT s.*,u.name,u.campus_id,u.role FROM sessions s
            JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?
            AND u.verified=1""", (_hash(token), int(time.time()))).fetchone()
        if not row:
            raise HTTPException(401, "Session expired")
        return dict(row)


def logout(database, request: Request):
    token = request.cookies.get(SESSION_COOKIE, "")
    if token:
        with database.transaction() as db:
            db.execute("DELETE FROM sessions WHERE token_hash=?", (_hash(token),))
    response = JSONResponse({"ok": True})
    response.delete_cookie(SESSION_COOKIE, path="/api/backend")
    return response
