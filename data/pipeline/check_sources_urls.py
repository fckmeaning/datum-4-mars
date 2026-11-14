"""Check all URLs referenced in data/pipeline/SOURCES.md.

Performs an HTTP HEAD request (with ranged GET fallback if HEAD is not allowed)
and prints the HTTP status code for each URL.

Usage:
    .venv\\Scripts\\python.exe data\\pipeline\\check_sources_urls.py
"""

from __future__ import annotations

import re
import sys
from pathlib import Path
from urllib.parse import urlparse

import httpx

REPO = Path(__file__).resolve().parents[2]
SOURCES_FILE = REPO / "data" / "pipeline" / "SOURCES.md"

USER_AGENT = "marsnav-checker/0.1 (NASA Space Apps 2026 DATUM-4; contact: team)"


def extract_urls(text: str) -> list[str]:
    """Extract distinct http and https URLs from text."""
    raw = re.findall(r"https?://[^\s\)\`\]\>\"\'\,\<\>]+", text)
    cleaned = []
    seen = set()
    for u in raw:
        # Strip trailing punctuation
        u = u.rstrip(".,;:)")
        if u not in seen and "." in urlparse(u).netloc:
            seen.add(u)
            cleaned.append(u)
    return cleaned


def check_url(url: str, client: httpx.Client) -> tuple[int | str, str]:
    headers = {"User-Agent": USER_AGENT}
    try:
        # Try HEAD first
        res = client.head(url, headers=headers, follow_redirects=True, timeout=10.0)
        if res.status_code in (405, 501, 403):
            # Fallback to ranged GET
            headers["Range"] = "bytes=0-1024"
            res = client.get(url, headers=headers, follow_redirects=True, timeout=10.0)
        return res.status_code, str(res.url)
    except httpx.HTTPStatusError as exc:
        return exc.response.status_code, url
    except httpx.ConnectError as exc:
        return "CONNECT_ERR", f"{url} ({exc})"
    except httpx.TimeoutException:
        return "TIMEOUT", url
    except Exception as exc:  # noqa: BLE001
        return "ERR", f"{url} ({exc})"


def main() -> None:
    if not SOURCES_FILE.is_file():
        print(f"File not found: {SOURCES_FILE}")
        sys.exit(1)

    text = SOURCES_FILE.read_text(encoding="utf-8")
    urls = extract_urls(text)
    print(f"Checking {len(urls)} distinct URLs from {SOURCES_FILE.name}:")

    with httpx.Client(verify=True) as client:
        for i, url in enumerate(urls, 1):
            status, info = check_url(url, client)
            print(f"[{i:02d}/{len(urls):02d}] {status:12} {url}")


if __name__ == "__main__":
    main()
