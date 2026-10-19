import pytest


def test_cors_preflight_for_frontend_origins(client):
    origins = [
        "http://localhost:8080",
        "http://127.0.0.1:8080",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]
    endpoints = ["/api/health", "/api/alerts/summary", "/api/locations"]

    for ep in endpoints:
        for orig in origins:
            res = client.options(
                ep,
                headers={
                    "Origin": orig,
                    "Access-Control-Request-Method": "GET",
                    "Access-Control-Request-Headers": "content-type",
                },
            )
            assert res.status_code == 200, f"Failed preflight {ep} from {orig}"
            assert res.headers.get("access-control-allow-origin") == orig
            assert "GET" in res.headers.get("access-control-allow-methods", "")
            assert "content-type" in res.headers.get("access-control-allow-headers", "").lower()


def test_cors_disallowed_origin(client):
    res = client.options(
        "/api/health",
        headers={
            "Origin": "http://malicious-site.com",
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "content-type",
        },
    )
    assert res.status_code == 400
    assert "access-control-allow-origin" not in res.headers
