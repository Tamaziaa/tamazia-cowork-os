# Runbook — Mint up to ~2,000 brand audits/day at ~$0 (Oracle VM worker + Neon queue + free AI stack)

This ships the **throughput + cost** core. Code already landed in this repo:
- `scripts/enqueue-leads.js` — fills `minting_queue` from qualified, not‑yet‑minted leads (dedupe by domain).
- `scripts/mint-worker.js` — 24/7 worker; claims the queue (FOR UPDATE SKIP LOCKED), mints via `build()` at `MINT_CONCURRENCY`, binds the URL to the lead **once** (never overwrites a possibly‑sent URL), retry ≤ 3, fail‑soft.
- `schema/canonical-schema.json` — new `minting_queue` table (auto‑provisioned by `ensure-schema.js`).
- `src/lib/audit/llm.js` — global LLM rate‑limiter (`LLM_MAX_PER_MIN`, default 90) + `LLM_FREE_ONLY=1` (Groq + Gemini only).

Capacity at `MINT_CONCURRENCY=10` and ~120 s/mint (I/O‑bound) ≈ **~7,000/day**, so 2,000/day drains fast with headroom.

---

## 1. One‑time: Oracle Cloud Free ARM VM (the always‑on worker box)
1. Oracle Cloud → create an **Always Free** VM: **Ampere A1 (ARM)**, 2–4 OCPU / 12–24 GB, Ubuntu 22.04. (Always‑free; a 24/7 worker keeps it active so it's never reclaimed.)
2. SSH in, install runtime:
   ```bash
   sudo apt update && sudo apt install -y git docker.io
   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt install -y nodejs
   sudo npm i -g pm2
   git clone <your cowork-os remote> ~/cowork-os && cd ~/cowork-os && npm install --no-audit --no-fund
   ```
3. Put the `psql` binary used by the scripts on PATH (the repo ships `scripts/psql`; ensure it's executable) or `sudo apt install -y postgresql-client` and symlink.

## 2. One‑time: SearXNG (unlimited free SERP) on the same VM
```bash
docker run -d --restart unless-stopped --name searxng -p 8888:8080 \
  -e BASE_URL=http://localhost:8888/ searxng/searxng
```
Then set `SEARXNG_URL=http://localhost:8888` in the env (below). Removes the Serper bill entirely.

## 3. One‑time: `.env` on the VM (zero‑cost provider stack)
Copy `COWORK-OS-EXECUTION/.env` and set/keep ONLY the free providers:
```
NEON_URL=...                      # existing
TAMAZIA_HMAC_SECRET=...           # MUST match prod (same secret the Pages function verifies)
GROQ_API_KEY=...                  # free
GEMINI_API_KEY=...                # free (plain + grounded)
PAGESPEED_API_KEY=...             # free 25k/day
OPENPAGERANK_API_KEY=...          # free 10k/hr
SEARXNG_URL=http://localhost:8888
LLM_FREE_ONLY=1                   # drop NIM/OpenAI/DeepSeek/Perplexity
LLM_MAX_PER_MIN=90                # stay under Groq's ~100/min free ceiling across all concurrency
MINT_CONCURRENCY=10
# UNSET (leave blank) the paid/quota providers so the cascade never reaches them:
# HF_TOKEN= , BING_WEBMASTER_KEY= , SERPER_KEY= , SERPAPI_KEY= , NIM_API_KEY= , OPENAI_API_KEY=
```

## 4. Provision schema + start the pipeline
```bash
cd ~/cowork-os
node scripts/ensure-schema.js            # creates minting_queue (+ any drift)
node scripts/enqueue-leads.js 500        # fill the queue from fit leads
node scripts/mint-worker.js --once       # smoke: drain the queue once, watch the OK/FAIL log
pm2 start scripts/mint-worker.js --name tz-mint --time   # 24/7
pm2 start scripts/enqueue-leads.js --name tz-enqueue --cron "*/15 * * * *" --no-autorestart
pm2 save && pm2 startup                   # survive reboot
```
Tune `MINT_CONCURRENCY` (10 → 14) if the queue grows; watch `pm2 logs tz-mint` for Groq 429s (the limiter should prevent them).

---

## 5. Storage offload to Cloudflare R2 (do before sustained 1,000+/day — Neon free 0.5 GB ÷ 250 KB ≈ ~2,000 rows)
**Create:** R2 bucket `tamazia-audits`; an R2 **S3 API token** (Access Key + Secret); note the S3 endpoint `https://<accountid>.r2.cloudflarestorage.com`.

**Mint side** (`scripts/mint-worker.js` / `build.js`) — write the payload to R2, store only metadata in Neon. Minimal helper (uses the AWS SDK; `npm i @aws-sdk/client-s3`):
```js
// src/lib/r2.js
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const r2 = process.env.R2_ENDPOINT ? new S3Client({ region:'auto', endpoint:process.env.R2_ENDPOINT,
  credentials:{ accessKeyId:process.env.R2_ACCESS_KEY_ID, secretAccessKey:process.env.R2_SECRET_ACCESS_KEY } }) : null;
async function putAudit(slug, hash, json){ if(!r2) return false;
  await r2.send(new PutObjectCommand({ Bucket:process.env.R2_BUCKET, Key:`audits/${slug}/${hash}.json`,
    Body:JSON.stringify(json), ContentType:'application/json' })); return true; }
module.exports = { putAudit };
```
In `build.js`, after `buildPayload`, gate the Neon write on a flag:
```js
const { putAudit } = require('../../../lib/r2'); // adjust path
const stored = (process.env.AUDIT_PAYLOAD_STORE || 'neon');   // 'neon' | 'r2' | 'both'
let neonPayload = payload;
if (stored === 'r2' || stored === 'both') { await putAudit(slug, hash, payload); }
if (stored === 'r2') neonPayload = { r2: true, framework_version: payload.framework_version }; // stub
const payloadJsonE = JSON.stringify(neonPayload).replace(/'/g, "''");
```
Default `AUDIT_PAYLOAD_STORE=neon` (no behaviour change) → flip to `both`, verify, then `r2`.

**Serve side** (`tamazia-website/functions/audit/[[path]].js` + Pages): bind the bucket and read R2 when the Neon payload is a stub:
```js
// wrangler/Pages: add R2 binding AUDITS -> bucket tamazia-audits
const pj = row.payload_json && !row.payload_json.r2 ? row.payload_json
  : JSON.parse(await (await env.AUDITS.get(`audits/${slug}/${hash}.json`)).text());
```
This dual‑path serves old (Neon) and new (R2) rows; graceful 404 page if the object is missing.

---

## 6. Mystrika touch‑1 correctness — already guaranteed, two guards to add
Today: deterministic slug from the lead's company/domain + `lead_id`‑bound HMAC + live HTTP‑200 verify before push (`verify-audits.js`) + fully‑rendered `touch1_body`. The worker also sets `audit_url` **once** (never overwrites). Add to `scripts/push-to-mystrika.js` just before building each prospect:
- **domain↔slug assertion** — `SELECT domain FROM audit_pages WHERE slug || '/' || hash = <from audit_url>` must equal `leads.domain`; skip + log if not (collision guard).
- **immutable‑after‑send** — only push leads whose `audit_url` is set and unchanged since mint; once pushed, set a `pushed_at`/`in_campaign` flag and never re‑mint those (the enqueue already skips leads that have an `audit_url`).

## 7. Monitoring (n8n on Pikapod, existing)
- Cron node every 15 min → SSH/HTTP runs `enqueue-leads.js` (or rely on the pm2 cron above).
- Heartbeat: query `SELECT count(*) FILTER (WHERE status='pending'), count(*) FILTER (WHERE status='failed') FROM minting_queue` → Telegram/Slack alert if pending > 3,000 (worker behind) or failed climbing (provider/site issue).
- Keep the existing Mystrika reply‑sync workflow.

## 8. Verification (end‑to‑end)
1. `enqueue-leads.js 50` → `mint-worker.js --once` → ~50 `done`, payloads where configured, `cost-ledger.js` ≈ $0.
2. Open 5 resulting `tamazia.co.uk/audit/<slug>/<hash>` → correct brand, full audit (findings + exec summary + GEO), HMAC valid.
3. Soak: enqueue 2,000 over 24 h → queue drains, no Groq 429 storm, VM up (`pm2 status`), Neon flat once R2 is on.
4. Mystrika dry‑run (`push-to-mystrika.js --dry`) → each `audit_url` is its OWN brand; domain↔slug passes; touch‑1 body carries the live absolute URL.
5. Drills: stop SearXNG (DDG fallback still mints); blank `GROQ_API_KEY` (Gemini fallback); delete an R2 object (graceful serve error, lead held from push).
