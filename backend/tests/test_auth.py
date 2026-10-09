"""Real HTTP checks for login boundaries, campus approval and CSRF."""
import importlib.util
import json
import os
import tempfile
import time
import unittest
from types import SimpleNamespace
from unittest.mock import patch
from urllib.parse import parse_qs, urlparse


@unittest.skipUnless(all(importlib.util.find_spec(name) for name in ("fastapi", "httpx", "jwt", "cryptography")),
                     "HTTP/OIDC dependencies are installed in CI")
class OidcTests(unittest.TestCase):
    def test_login_session_csrf_admin_approval_and_logout(self):
        import httpx
        import jwt
        from cryptography.hazmat.primitives.asymmetric import rsa
        from fastapi.testclient import TestClient
        from app import auth, main
        from app.database import Database
        from app.print_jobs import PrintService

        env = {
            "KART_DEMO_MODE": "0", "KART_COOKIE_SECURE": "0",
            "KART_OIDC_ISSUER": "https://identity.example.edu",
            "KART_OIDC_AUTHORIZE_URL": "https://identity.example.edu/authorize",
            "KART_OIDC_TOKEN_URL": "https://identity.example.edu/token",
            "KART_OIDC_JWKS_URL": "https://identity.example.edu/jwks",
            "KART_OIDC_CLIENT_ID": "kart-campus", "KART_OIDC_CLIENT_SECRET": "test-secret",
            "KART_OIDC_REDIRECT_URI": "https://kart.example.edu/api/backend/auth/callback",
            "KART_CAMPUS_DOMAINS": json.dumps({"college.edu": "campus-one"}),
            "KART_BOOTSTRAP_ADMINS": "admin@college.edu",
        }
        key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        with tempfile.TemporaryDirectory() as directory, patch.dict(os.environ, env), patch.object(main, "service", PrintService(Database(directory + "/db.sqlite"))):
            with TestClient(main.app) as client:
                def login(subject, email):
                    start = client.get("/auth/start", follow_redirects=False)
                    self.assertEqual(start.status_code, 307)
                    state = parse_qs(urlparse(start.headers["location"]).query)["state"][0]
                    self.assertIn("code_challenge_method=S256", start.headers["location"])
                    with main.service.database.connect() as db:
                        nonce = db.execute("SELECT nonce FROM auth_states WHERE state_hash=?", (auth._hash(state),)).fetchone()["nonce"]
                    token = jwt.encode({"iss": env["KART_OIDC_ISSUER"], "aud": env["KART_OIDC_CLIENT_ID"],
                                        "sub": subject, "email": email, "email_verified": True, "nonce": nonce,
                                        "iat": int(time.time()), "exp": int(time.time()) + 300}, key, algorithm="RS256")
                    response = httpx.Response(200, json={"id_token": token}, request=httpx.Request("POST", env["KART_OIDC_TOKEN_URL"]))
                    with patch.object(auth.httpx, "post", return_value=response), patch.object(
                        auth.jwt, "PyJWKClient", return_value=SimpleNamespace(
                            get_signing_key_from_jwt=lambda value: SimpleNamespace(key=key.public_key()))):
                        result = client.get(f"/auth/callback?code=sample&state={state}",
                                            headers={"cookie": f"kart_oauth_state={state}"}, follow_redirects=False)
                    self.assertEqual(result.status_code, 307, result.text)
                    cookie = result.cookies.get("kart_session")
                    self.assertTrue(cookie)
                    headers = {"cookie": f"kart_session={cookie}"}
                    data = client.get("/auth/session", headers=headers)
                    self.assertEqual(data.status_code, 200, data.text)
                    return headers, data.json()

                admin_headers, admin = login("admin-sub", "admin@college.edu")
                student_headers, student = login("student-sub", "student@college.edu")
                self.assertEqual(admin["role"], "campus_admin")
                self.assertEqual(student["role"], "student")
                self.assertEqual(client.get("/v1/admin/users", headers=student_headers).status_code, 403)
                body = {"owner_id": student["id"], "name": "Approved Xerox", "type": "vendor", "store_type": "xerox"}
                self.assertEqual(client.post("/v1/admin/organizations", headers=admin_headers, json=body).status_code, 403)
                self.assertEqual(client.post("/v1/admin/organizations", headers={**student_headers,
                    "x-kart-csrf": student["csrf"]}, json=body).status_code, 403)
                approved = client.post("/v1/admin/organizations", headers={**admin_headers,
                    "x-kart-csrf": admin["csrf"]}, json=body)
                self.assertEqual(approved.status_code, 201, approved.text)
                self.assertTrue(approved.json()["store_id"])
                suspend = client.post(f"/v1/admin/users/{student['id']}/suspension", headers={**admin_headers,
                    "x-kart-csrf": admin["csrf"]}, json={"suspended": True})
                self.assertEqual(suspend.status_code, 200, suspend.text)
                self.assertEqual(client.get("/auth/session", headers=student_headers).status_code, 401)
                self.assertEqual(client.get("/v1/stores", headers=student_headers).status_code, 401)
                self.assertEqual(client.post(f"/v1/admin/users/{student['id']}/suspension", headers={**admin_headers,
                    "x-kart-csrf": admin["csrf"]}, json={"suspended": False}).status_code, 200)
                self.assertEqual(client.get("/auth/session", headers=student_headers).status_code, 401)
                self.assertEqual(client.post("/dev/organizations", headers={**admin_headers,
                    "x-kart-csrf": admin["csrf"]}, json=body).status_code, 404)
                self.assertEqual(client.post("/auth/logout", headers={**admin_headers,
                    "x-kart-csrf": admin["csrf"]}).status_code, 200)
                self.assertEqual(client.get("/auth/session", headers=admin_headers).status_code, 401)

    def test_login_state_bound_to_browser_and_single_use(self):
        from fastapi.testclient import TestClient
        from app import main
        from app.database import Database
        from app.print_jobs import PrintService
        with tempfile.TemporaryDirectory() as directory, patch.dict(os.environ, {
            "KART_DEMO_MODE": "0", "KART_OIDC_ISSUER": "https://identity.example.edu",
            "KART_OIDC_AUTHORIZE_URL": "https://identity.example.edu/authorize",
            "KART_OIDC_TOKEN_URL": "https://identity.example.edu/token",
            "KART_OIDC_JWKS_URL": "https://identity.example.edu/jwks",
            "KART_OIDC_CLIENT_ID": "kart", "KART_OIDC_CLIENT_SECRET": "secret",
            "KART_OIDC_REDIRECT_URI": "https://kart.example.edu/api/backend/auth/callback",
            "KART_CAMPUS_DOMAINS": '{"college.edu":"campus-one"}',
        }), patch.object(main, "service", PrintService(Database(directory + "/db.sqlite"))):
            with TestClient(main.app) as client:
                start = client.get("/auth/start", follow_redirects=False)
                state = parse_qs(urlparse(start.headers["location"]).query)["state"][0]
                self.assertEqual(client.get(f"/auth/callback?code=x&state={state}",
                    headers={"cookie": "kart_oauth_state=wrong"}).status_code, 400)
                with main.service.database.connect() as db:
                    self.assertIsNotNone(db.execute("SELECT 1 FROM auth_states WHERE state_hash=?", (
                        __import__("hashlib").sha256(state.encode()).hexdigest(),)).fetchone())
