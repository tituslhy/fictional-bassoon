"""Exercise the local stack's authorization boundaries with disposable accounts.

Does not load environment files. Uses the running app at localhost:8080.
"""

import uuid

import httpx

BASE = "http://localhost:8080"


def run():
    with httpx.Client(base_url=BASE, timeout=30) as client:
        assert client.get("/health").json()["status"] == "ok"
        users = []
        for _ in range(2):
            body = {
                "email": f"smoke-{uuid.uuid4().hex}@example.com",
                "password": uuid.uuid4().hex,
                "full_name": "Local verification",
            }
            response = client.post("/api/auth/signup", json=body)
            assert response.status_code == 200, response.text
            token = response.json()["access_token"]
            assert client.post("/api/auth/login", json=body).status_code == 200
            users.append({"Authorization": f"Bearer {token}"})
        owner, other = users
        tid = str(uuid.uuid4())
        response = client.post(
            "/api/threads",
            headers=owner,
            json={"id": tid, "title": "Private smoke thread"},
        )
        assert response.status_code == 201, response.text
        assert response.json()["id"] == tid
        assert any(
            row["id"] == tid for row in client.get("/api/threads", headers=owner).json()
        )
        assert all(
            row["id"] != tid for row in client.get("/api/threads", headers=other).json()
        )
        assert (
            client.patch(
                f"/api/threads/{tid}", headers=owner, json={"title": "Renamed"}
            ).status_code
            == 200
        )
        for headers, expected in [({}, 401), (other, 404)]:
            assert (
                client.post(
                    "/api/chat",
                    headers=headers,
                    json={"thread_id": tid, "message": "unauthorized"},
                ).status_code
                == expected
            )
            assert (
                client.get(f"/api/threads/{tid}/history", headers=headers).status_code
                == expected
            )
            assert (
                client.patch(
                    f"/api/threads/{tid}", headers=headers, json={"title": "hijack"}
                ).status_code
                == expected
            )
            assert (
                client.delete(f"/api/threads/{tid}", headers=headers).status_code
                == expected
            )
        for headers in [owner, other, {}]:
            for table in ["threads", "messages"]:
                response = client.get(f"/api/db/{table}", headers=headers)
                assert response.status_code in (401, 403, 404), response.text
        payload = {
            "jsonrpc": "2.0",
            "id": "security",
            "method": "SendMessage",
            "params": {
                "message": {
                    "messageId": str(uuid.uuid4()),
                    "contextId": tid,
                    "role": "ROLE_USER",
                    "parts": [{"text": "unauthorized"}],
                }
            },
        }
        assert (
            client.post(
                "/api/a2a", headers={"A2A-Version": "1.0"}, json=payload
            ).status_code
            == 401
        )
        response = client.post(
            "/api/a2a", headers={**other, "A2A-Version": "1.0"}, json=payload
        )
        assert "error" in response.json(), response.text
        response = client.post(
            "/api/chat",
            headers=owner,
            json={"thread_id": tid, "message": "local smoke test"},
        )
        assert response.status_code == 200, response.text
        # Either a configured model completes or missing credentials produce a terminal error.
        assert (
            "event: RUN_ERROR" in response.text
            or "event: RUN_FINISHED" in response.text
        )
        terminal = (
            "RUN_ERROR (no provider credentials)"
            if "event: RUN_ERROR" in response.text
            else "RUN_FINISHED"
        )
        assert client.delete(f"/api/threads/{tid}", headers=owner).status_code == 204
        assert (
            client.get(f"/api/threads/{tid}/history", headers=owner).status_code == 404
        )
        assert (
            client.post(
                "/api/chat",
                headers=owner,
                json={"thread_id": tid, "message": "deleted"},
            ).status_code
            == 404
        )
        assert (
            client.post(
                "/api/threads", headers=other, json={"id": tid, "title": "reclaim"}
            ).status_code
            == 409
        )
        assert (
            "error"
            in client.post(
                "/api/a2a", headers={**other, "A2A-Version": "1.0"}, json=payload
            ).json()
        )
        print(
            "PASS: signup/login, owner catalog/create/rename/delete, HTTP and A2A ownership, direct database denial, deleted-thread reservation"
        )
        print("PASS: real worker/Redis terminal response:", terminal)


if __name__ == "__main__":
    run()
