#!/usr/bin/env python3
"""
Tamazia crawl-render microservice — the guaranteed JS-SPA render path for the audit crawler.

The Node crawler (compliance.js gatherCorpus) calls this ONLY for pages that came back as a near-empty client-rendered
shell, via the CRAWL_RENDER_URL env var. It executes the page in a real headless browser (Playwright/Chromium via
crawl4ai) and returns the fully-rendered HTML + extracted text, so EVERY word on a pure-JS site is captured.

    GET /render?url=https://example.com/page   ->   {"url":..., "html":..., "text":..., "ok":true, "ms":1234}
    GET /healthz                               ->   {"ok":true}

Run locally:   uvicorn app:app --host 0.0.0.0 --port 8080
Then point the engine at it:   export CRAWL_RENDER_URL="http://127.0.0.1:8080/render"

Notes
- Strictly a renderer of PUBLIC pages the crawler already chose to fetch. No auth, no cookies, no CAPTCHAs.
- Concurrency is bounded (RENDER_CONCURRENCY) so one box can serve the 2-3k audits/day cadence.
- Returns ok:false with a reason on failure; the caller falls back to the free Jina reader, never blocking a mint.
"""
import asyncio
import os
import time
from urllib.parse import urlparse

from fastapi import FastAPI, Query
from fastapi.responses import JSONResponse

try:
    # crawl4ai wraps Playwright with sensible content extraction; falls back to raw Playwright if unavailable.
    from crawl4ai import AsyncWebCrawler  # type: ignore
    _HAVE_CRAWL4AI = True
except Exception:  # pragma: no cover - import-time capability probe
    _HAVE_CRAWL4AI = False
    from playwright.async_api import async_playwright  # type: ignore

app = FastAPI(title="tamazia-crawl-render", version="1.0")

_CONCURRENCY = int(os.environ.get("RENDER_CONCURRENCY", "4"))
_TIMEOUT_MS = int(os.environ.get("RENDER_TIMEOUT_MS", "25000"))
_sem = asyncio.Semaphore(_CONCURRENCY)
_UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
       "(KHTML, like Gecko) Chrome/124.0 Safari/537.36 TamaziaAuditBot/1.0")


def _valid(url: str) -> bool:
    try:
        u = urlparse(url)
        return u.scheme in ("http", "https") and bool(u.netloc)
    except Exception:
        return False


async def _render_crawl4ai(url: str):
    async with AsyncWebCrawler(verbose=False) as crawler:
        res = await crawler.arun(url=url, page_timeout=_TIMEOUT_MS, user_agent=_UA, bypass_cache=True)
        html = getattr(res, "html", "") or ""
        text = getattr(res, "markdown", None) or getattr(res, "cleaned_html", None) or ""
        if not text and html:
            text = html
        return html, text


async def _render_playwright(url: str):
    from playwright.async_api import async_playwright  # local import keeps crawl4ai path import-light
    async with async_playwright() as p:
        browser = await p.chromium.launch(args=["--no-sandbox", "--disable-dev-shm-usage"])
        try:
            page = await browser.new_page(user_agent=_UA)
            await page.goto(url, wait_until="networkidle", timeout=_TIMEOUT_MS)
            html = await page.content()
            text = await page.evaluate("() => document.body ? document.body.innerText : ''")
            return html, text
        finally:
            await browser.close()


@app.get("/healthz")
async def healthz():
    return {"ok": True, "engine": "crawl4ai" if _HAVE_CRAWL4AI else "playwright"}


@app.get("/render")
async def render(url: str = Query(..., description="absolute http(s) URL to render")):
    if not _valid(url):
        return JSONResponse({"ok": False, "reason": "invalid_url", "url": url}, status_code=400)
    t0 = time.time()
    async with _sem:
        try:
            if _HAVE_CRAWL4AI:
                html, text = await _render_crawl4ai(url)
            else:
                html, text = await _render_playwright(url)
        except Exception as e:  # graceful — caller falls back to the free reader
            return JSONResponse({"ok": False, "reason": str(e)[:200], "url": url}, status_code=200)
    return {
        "ok": bool(text and len(text) > 80),
        "url": url,
        "html": html,
        "text": text,
        "ms": int((time.time() - t0) * 1000),
    }
