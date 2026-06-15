# Email-verification route-around (Hetzner) + GitHub Actions diagnosis

**Date:** 2026-06-15 · **Owner:** INFRA · **Status:** built, deployed, proven; ONE founder action pending (Hetzner :25 unblock).

The email-verification bottleneck has one root cause: a real RCPT-TO probe needs **outbound TCP/25**, and the place the engine runs (GitHub-hosted Actions) blocks it permanently. This sets up the probe on a box we control instead.

---

## 1. Why GitHub Actions "has so many issues" (measured, not guessed)

Both `Tamaziaa/tamazia-cowork-os` and `Tamaziaa/tamazia-website` are **PUBLIC** repos. Public repos get **UNLIMITED free Actions minutes** on standard runners — so a *minutes cap is NOT the problem*. (`Tamaziaa` is a personal account, not an org; user-level billing endpoints 404, consistent with the unlimited-public-minutes model.)

The real problem is the **per-job timeout**, measured on `engine-cycle` (workflow id 280634967), last 100 runs:

| conclusion | count | % |
|---|---|---|
| success | 42 | 42% |
| **cancelled (killed)** | **40** | **40%** |
| failure | 18 | 18% |

- **Every "cancelled" run died at ~25.3–25.7 min** — exactly `timeout-minutes: 25` in `engine-cycle.yml`. These are the rows the audit saw as "killed". GitHub force-cancels the job at the wall, truncating the cycle mid-step (verify, qualify, export get cut off).
- Cycle duration: **min 0.1 / avg 15.5 / max 39.5 min**. The cycle frequently *wants* 25–40 min but is capped at 25, and it's scheduled **every 30 min** (`*/30`), so a long cycle nearly collides with the next tick.
- `concurrency: { group: engine-cycle, cancel-in-progress: false }` means overlapping ticks **queue** rather than cancel — adding latency, not killing — so concurrency isn't the killer; the **25-min wall is**.
- Other workflows show stress too (last-30 sample): `scrapers` success 8 / failure 4 / cancelled 3; `mystrika` success 21 / **failure 9** (the gated push step); `backlog-burst` failure 2 / success 2. `engine-cycle` burns ~**647 wall-min per 30-run sample** (~21.6 min/run) — the heaviest consumer by far.

**Verdict:** the issues are **per-job timeouts + a heavy continuous cycle that doesn't fit the 25-min box**, NOT a minutes cap. See §4 for what a plan upgrade does and doesn't fix.

---

## 2. Port 25 reality (the actual bottleneck)

**GitHub-hosted runners run on Azure VMs, and Azure blocks outbound TCP/25 platform-wide** — by design, on every runner, and it is **not configurable by GitHub plan tier**. Free, Team, and Enterprise hosted runners all block :25 identically. (Microsoft Azure docs; GitHub community discussion #31144.) The only GitHub-side way to get :25 is a **self-hosted runner** on a box you control.

This is why `free-verify.js` already degrades on Actions: with no :25 it can only do Hunter + MX heuristics (status `unknown`/`mx_only`), never a real RCPT verdict. The engine-cycle's `verify-contacts.js` step runs **without** `SMTP_PROBE=1` on Actions for exactly this reason.

**Live test from the Hetzner box (195.201.23.17), 2026-06-15:**
```
nc -zv -w5 gmail-smtp-in.l.google.com 25   -> timed out
nc -zv -w5 aspmx.l.google.com 25           -> timed out
mx.zoho.com:25 / proton:25 / outlook MX:25 -> all timed out
raw-IP 104.16.132.229:443 (Cloudflare)     -> CONNECTED   (egress is fine)
raw-IP 74.125.206.26:25 (Google MX)        -> NO CONNECT
UFW: Default outgoing = ALLOW (local firewall is NOT the cause)
```
**Conclusion:** Hetzner **also blocks outbound :25 by default** (provider-side, not the box). This is Hetzner's documented anti-abuse policy: outbound 25/465 are blocked on new servers and lifted only via a support request, typically after the first paid invoice (~1 month of account age) with a clean reputation. 443 to a raw IP connects fine, so the box's egress is healthy — only :25 is filtered upstream.

**Proof the verification *technique* itself works** (run from a host that does allow :25, SEND-SAFE — HELO→MAIL FROM→RCPT TO→**QUIT**, no DATA, no mail sent):
```
support@github.com                 -> 250 Recipient OK ; catch-all probe 250 -> risky (catch-all)   [correct]
noreply-zzz-...@microsoft.com      -> 550 Recipient address rejected         -> INVALID            [correct]
billing@stripe.com (Google WS)     -> 250 ; catch-all probe 250              -> risky (catch-all)   [correct]
```
The `550` on a nonexistent microsoft.com address is the high-value signal GitHub Actions can *never* produce. Catch-all domains are correctly down-ranked to `risky`, not falsely `valid` — identical behaviour to `free-verify.js`.

---

## 3. What is deployed on Hetzner (£0)

**Box:** 195.201.23.17 · **app dir:** `/opt/tamazia-verify` · existing Docker stacks (Metabase :3000, Uptime Kuma :3001, SearXNG :8888) **untouched**, no inbound firewall change.

- **`ops/infra/hetzner-verify.js`** — standalone SEND-safe verifier. Vendors `free-verify.js`'s `smtpOnce/smtpVerify/mxHosts` **verbatim** so verdicts match the engine. Connects to Neon directly (`pg` driver, with a pg8000-python fallback). Vocabulary: `valid|risky|invalid|unknown`.
  - **Candidate gate:** `contact_email` has `@` **AND** `verify_status ∈ {NULL,'',pending,unknown}` **AND** not SMTP-checked in the last `RECHECK_DAYS` (30). It deliberately **never touches** the source-workflow flags `approved`/`verified`.
  - **Writes (additive only):** `smtp_verdict` (the unambiguous SMTP truth), `smtp_checked_at`, `contact_confidence` (0–100); and fills `verify_status` *only when it was NULL/''/pending/unknown* (never clobbers `approved`/`verified`). Two additive columns `smtp_verdict`, `smtp_checked_at` were added to `leads` (idempotent `ADD COLUMN IF NOT EXISTS`).
  - **Rate-limited:** per-domain serialisation + `PER_DOMAIN_DELAY_MS` (1500) so we never tarpit one MX. **Capped** per run (`--limit`, default 150). **Idempotent** (the `smtp_checked_at` cooldown means re-runs skip recently-checked rows — proven: eligible-count → 0 after a run).
- **`ops/infra/setup.sh`** — idempotent provisioner: installs Node 20 + pg8000, writes `/opt/tamazia-verify/.env` (NEON_URL + optional HUNTER_KEY), the `run-verify.sh` wrapper, and the cron. Safe to re-run.
- **`run-verify.sh` + cron** — `*/15 * * * *`, capped 150/run (~14.4k/day headroom, far above the 100/day governor). The wrapper has a **:25 preflight**: while Hetzner blocks :25 it logs a skip and **no-ops with zero DB churn**, then self-activates the instant :25 opens.

**Proof captured (2026-06-15):**
- Dry run of 5 on the box: reads DB, resolves MX, attempts probe → all `unknown/smtp_no_response` (graceful degradation under the :25 block — no crash, nothing sent).
- Real run of 2 (ids 11959, 6411): `smtp_verdict='unknown'` + `smtp_checked_at` written, `verify_status` preserved, `contact_confidence` intact. Re-eligibility check returned **0** (idempotent). Test rows were then re-queued (`smtp_checked_at→NULL`) so they get a real verdict once :25 is open.
- **Backlog waiting for the SMTP layer: 3,090 leads** (`pending`/`unknown` with a domain email).

### Run it / inspect it
```bash
ssh -i ~/.ssh/oracle_a1 root@195.201.23.17
/opt/tamazia-verify/run-verify.sh 5        # one capped run (no-ops until :25 open)
tail -f /opt/tamazia-verify/logs/verify.log
crontab -l                                  # the */15 schedule
```

---

## 4. GitHub plan recommendation (£-aware)

**What Team (~$4/user/mo) / Enterprise buys:** more *included* minutes (irrelevant — public repos are already unlimited), **larger runners** (more CPU/RAM), **longer max job time on larger runners**, and **higher concurrency**. The standard hosted-runner per-job hard ceiling is 6h regardless of tier; the engine's self-imposed `timeout-minutes: 25` is the actual killer here.

**What NO tier fixes:** outbound **port 25** — it stays blocked on every GitHub-hosted tier (Azure policy). An upgrade will *not* enable SMTP verification. Full stop.

**Recommendation (do, in order):**
1. **£0 — fix the timeout, not the plan.** The 40% kill rate is self-inflicted by `timeout-minutes: 25` on a cycle that averages 15.5 and peaks 39.5 min. Either (a) raise `engine-cycle` `timeout-minutes` to ~50 (public repo = free minutes, so this costs nothing), or (b) split the monolithic cycle into smaller workflows so each fits comfortably. *(ENG owns `engine-cycle.yml` — flag this to them; do not edit it from INFRA.)*
2. **£0 — move SMTP verification off Actions entirely** → the Hetzner cron in §3. This is the only path to real RCPT verdicts and it's already built.
3. **£0 — optionally register the Hetzner box as a GitHub self-hosted runner** for the heavy *continuous* jobs (engine-cycle, scrapers). A self-hosted runner has **no 25-min/6h cap and no Azure :25 block**, so it solves the timeout *and* could run verification inline. Cost: the box already exists. **Founder action:** generate a self-hosted-runner registration token (repo → Settings → Actions → Runners → New self-hosted runner) and hand it over.
4. **Upgrade GitHub only if** you later make repos private *and* hit the free-minutes cap — i.e. only if minutes become the binding constraint. Today they are not. **Net: keep GitHub on the free tier; spend £0.**

---

## FOUNDER ACTIONS (the only things blocking full accuracy)

1. **(REQUIRED) Unblock outbound TCP/25 on Hetzner.** In the Hetzner Cloud Console / Robot, open a support request: *"Please unblock outbound port 25 on server 195.201.23.17 for transactional email verification."* Usually granted after the first paid invoice. The cron self-activates the moment it opens — no further action. *(Confirm with: `ssh … 'nc -zv -w5 gmail-smtp-in.l.google.com 25'`.)*
2. **(OPTIONAL, recommended) Self-hosted runner token** (§4 step 3) if you want to also move the heavy continuous Actions jobs to the box and kill the 25-min timeout failures.
3. **(ENG, not INFRA)** Raise `engine-cycle.yml` `timeout-minutes` 25→~50 or split the cycle (§4 step 1).
