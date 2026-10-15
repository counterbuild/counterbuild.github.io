"""Download the latest hero and item data from deadlock-api.com and rebuild site/data.js.

Run from the project root after a Deadlock patch:  python tools/update_data.py
"""
import os, subprocess, sys, urllib.request

API = "https://api.deadlock-api.com/v1/assets"
os.makedirs("data", exist_ok=True)
for name in ("heroes", "items"):
    req = urllib.request.Request(f"{API}/{name}", headers={"User-Agent": "counterbuild"})
    with urllib.request.urlopen(req, timeout=120) as r, open(f"data/{name}.json", "wb") as f:
        f.write(r.read())
    print("downloaded", name)
subprocess.run([sys.executable, "tools/pack.py"], check=True)
