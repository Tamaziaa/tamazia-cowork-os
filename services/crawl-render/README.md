# crawl-render — guaranteed JS-SPA render path for the Tamazia audit crawler

The Node crawler (`src/skills/S008-personalisation-engine/scanners/compliance.js` → `gatherCorpus`) is static-fast for
~90% of pages. For the JS-SPA tail — pages that return a near-empty client-rendered shell — it calls this microservice
to render the page in real Chromium (crawl4ai/Playwright) so **every word on every page is captured (100% coverage)**.

It is **optional**: if `CRAWL_RENDER_URL` is unset, the crawler falls back to the free public Jina reader, which already
rescues most shells. Standing this service up upgrades that tail from "best-effort" to "guaranteed".

## Endpoint
```
GET /render?url=<absolute http(s) url>   ->   { ok, url, html, text, ms }
GET /healthz                             ->   { ok, engine }
```
Only renders PUBLIC pages the crawler already selected. No auth, no cookies, no CAPTCHA solving (prohibited).

## Run

### Docker (recommended)
```bash
docker build -t tamazia-crawl-render services/crawl-render
docker run -d --name crawl-render -p 8080:8080 --shm-size=1g tamazia-crawl-render
```

### Local
```bash
pip install -r services/crawl-render/requirements.txt
python -m playwright install --with-deps chromium
uvicorn app:app --host 0.0.0.0 --port 8080   # from services/crawl-render/
```

## Wire into the engine
Set the env var the engine reads (same `.env` the mint worker sources):
```bash
export CRAWL_RENDER_URL="http://127.0.0.1:8080/render"   # or the VM's internal address
```
That's it — `gatherCorpus` will route shell pages through `/render` automatically.

## Tuning
- `RENDER_CONCURRENCY` (default 4) — parallel browser contexts; raise on a bigger box for the 2–3k audits/day cadence.
- `RENDER_TIMEOUT_MS` (default 25000) — per-page hard ceiling.

## Cost
£0 software (crawl4ai + Playwright are open-source). Runs on the existing free VM. The crawler only calls it for the
small shell tail, so render volume stays low.
