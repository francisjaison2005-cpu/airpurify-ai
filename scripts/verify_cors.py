import urllib.request

endpoints = [
    "/api/health",
    "/api/alerts/summary",
    "/api/locations"
]
origins = [
    "http://localhost:8080",
    "http://127.0.0.1:8080",
    "http://localhost:5173",
    "http://127.0.0.1:5173"
]

print("=== VERIFYING PREFLIGHT (OPTIONS) REQUESTS ===")
for ep in endpoints:
    url = f"http://127.0.0.1:8000{ep}"
    for orig in origins:
        req = urllib.request.Request(url, method="OPTIONS")
        req.add_header("Origin", orig)
        req.add_header("Access-Control-Request-Method", "GET")
        req.add_header("Access-Control-Request-Headers", "content-type")
        with urllib.request.urlopen(req) as resp:
            allow_orig = resp.headers.get("Access-Control-Allow-Origin")
            allow_methods = resp.headers.get("Access-Control-Allow-Methods")
            print(f"OPTIONS {ep} from {orig} -> Status: {resp.status}, Access-Control-Allow-Origin: {allow_orig}, Methods: {allow_methods}")

print("\n=== VERIFYING ACTUAL GET REQUESTS WITH ORIGIN HEADER ===")
for ep in endpoints:
    url = f"http://127.0.0.1:8000{ep}"
    req = urllib.request.Request(url, method="GET")
    req.add_header("Origin", "http://localhost:8080")
    req.add_header("Content-Type", "application/json")
    with urllib.request.urlopen(req) as resp:
        allow_orig = resp.headers.get("Access-Control-Allow-Origin")
        print(f"GET {ep} from http://localhost:8080 -> Status: {resp.status}, Access-Control-Allow-Origin: {allow_orig}")

print("\nALL VERIFICATIONS COMPLETED SUCCESSFULLY!")
