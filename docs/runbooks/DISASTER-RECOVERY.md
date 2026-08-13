# Tamazia Cowork OS — Disaster Recovery Runbook

**Owner:** Aman Pareek (founder) · **Phase 15.3.1 (S048)** · **Last updated:** 2026-05-23

This runbook is specific to THIS system as it actually runs today. It is not a generic template.
Read the architecture map first, then go straight to the matching scenario.

---

## System architecture (what can break)

| Component | What it is | Where it lives | Single point of failure? |
|-----------|-----------|----------------|--------------------------|
| **Engine host** | The 24/7 runner that executes `scripts/run-engine-cycle.sh` every 30 min | **GitHub Actions** (`.github/workflows/engine-cycle.yml`, cron `*/30 * * * *`) + `intel-pulse.yml` | No — GitHub runners are ephemeral; a failed run never wedges the schedule |
| **Database** | All leads, sends, drafts, invoices, actions, compliance trail | **Neon** Postgres (serverless), connection string in `NEON_URL` | Yes — primary data store |
| **Secrets** | Every API key + DB URL, base64-encoded | **GitHub Actions secret `ENV_B64`** = `base64(.env)`; local copy is `.env` on Aman's Mac | Yes — losing both copies loses all credentials |
| **DB access tool** | `scripts/psql` → `scripts/lib/psql-shim.py` (pg8000); no libpq needed | In repo | No — pure-Python, reproducible |
| **Sending relays** | Cold + transactional email | Brevo, SMTP2GO, MailerSend, Resend, MailerLite, SendGrid, Mailjet (via `src/lib/notify/relay-router.js`) + the MailDeck lookalike mailbox pool (`mailbox-pool.js`) | No — multi-relay router fails over automatically |
| **Notify relays** | Alerts | Telegram (`TELEGRAM_BOT_TOKEN`/`_CHAT_ID`), Slack (`SLACK_BOT_TOKEN`) | No — fall back to each other / email |
| **Code** | The whole engine | Git, pushed to private GitHub repo | No — distributed (local + GitHub + any clone) |
| **Inbound** | Reply ingestion | Zoho IMAP + Gmail IMAP (`*_IMAP_*` env), `scripts/zoho-imap-poll.js` | No — two mailboxes |
| **Site / DNS** | tamazia.co.uk, audit pages | Cloudflare (Pages + DNS + Registrar), `CLOUDFLARE_*` tokens | Partial — DNS is critical |

**Recovery priority order:** Secrets (`ENV_B64`/`.env`) → Database (Neon) → Engine host (GitHub) → DNS/domain → relays.
Without the secret you cannot restore anything else, so back it up first (see Scenario 9).

---

## Scenario 1: Neon DB loss (database deleted, corrupted, or unreachable)

**Trigger conditions:** Engine cycle logs `db_unavailable`; `scripts/psql "$NEON_URL" -tA -c "SELECT 1"` fails; Neon console shows the project/branch missing or suspended.

**Immediate actions (first 5 min)**
1. Confirm it is the DB and not a bad `NEON_URL`: re-decode the secret locally: `echo "$ENV_B64" | base64 -d | grep NEON_URL` and test `./scripts/psql "<url>" -tA -c "SELECT 1"`.
2. Disable sending so nothing fires against a half-restored DB: set the kill-switch — `./scripts/psql "$NEON_URL" -tA -c "INSERT INTO system_state(key,value) VALUES('paused','true') ON CONFLICT (key) DO UPDATE SET value='true'"` (if the DB is reachable), or pause the GitHub workflow (Actions tab → engine cycle → "Disable workflow").

**Recovery steps**
1. **Neon-native first (fastest):** Neon keeps automated history. In the Neon console, restore the branch to a point-in-time before the loss (Branches → Restore). This is the primary path and is usually < 15 min.
2. **If the Neon project itself is gone:** create a new Neon project, get the new connection string, and restore from the off-site backup:
   - Locate the most recent dump produced by the Phase 15.2.1 backup job (target: Cloudflare R2 `backups/neon-YYYY-MM-DD.sql.gz`). NOTE: the automated R2 backup job is FOUNDATION-pending — until it is live, the authoritative recovery is Neon's own PITR (step 1). Treat step 2 as the off-site path once S047 is operational.
   - `gunzip -c neon-YYYY-MM-DD.sql.gz | ./scripts/psql "<NEW_NEON_URL>" -f /dev/stdin` (or pipe into psql/pg_restore).
3. Re-apply migrations to be safe (all are idempotent `CREATE TABLE IF NOT EXISTS`): run every file in `migrations/` in date order against the restored DB.
4. Update `NEON_URL` in `.env`, re-encode `ENV_B64` (Scenario 9), and update the GitHub secret.
5. Lift the kill-switch: set `system_state.paused='false'`, re-enable the workflow, trigger one manual run (`workflow_dispatch`), watch `logs/engine-cycle.log`.

**Data-loss bound:** with Neon PITR, near-zero. With only the off-site dump, ≤ 24h (daily backup) or ≤ 7 days worst case before restore-test cadence is live.
**Estimated recovery time:** 15–60 min.
**Communication:** Telegram alert to Aman; no client comms unless an invoice/onboarding deadline is affected.
**Postmortem:** record cause, data-loss window, and whether S047 off-site backup was used, in `reports/dr-drills/`.

---

## Scenario 2: GitHub Actions engine host loss (workflows disabled, repo unrunnable, Actions outage)

**Trigger conditions:** No new lines in `logs/engine-cycle.log` for > 90 min; GitHub Actions shows the workflow disabled, the repo suspended, or a platform incident.

**Immediate actions**
1. Check https://www.githubstatus.com — if it is a GitHub-wide outage, the engine is self-healing: the next scheduled tick runs clean once Actions recovers. No action needed beyond monitoring.
2. If the repo/account is the problem, the engine can run ANYWHERE — it only needs Node 20 + the `.env`.

**Recovery steps (run from any machine: Aman's Mac, a fresh VM, or a new GitHub repo)**
1. `git clone` the repo (local copy, or any existing clone, or push a backup clone to a new private repo).
2. Materialise secrets: `echo "$ENV_B64" | base64 -d > .env` (or copy the local `.env`).
3. `pip install pg8000 --break-system-packages --target=/tmp/pylibs` then `export PYTHONPATH=/tmp/pylibs`.
4. Run a cycle by hand to confirm: `set -a; source .env; set +a; bash scripts/run-engine-cycle.sh`.
5. To restore 24/7 automation on a NEW host: re-create the GitHub Actions workflow (`.github/workflows/engine-cycle.yml` is in the repo) on the new repo and add the `ENV_B64` secret; OR schedule `run-engine-cycle.sh` via cron/launchd on a VM (the `scripts/launchd/` plists already exist).

**Estimated recovery time:** 30–60 min to a working manual cycle; 60–90 min to restored automation.
**Communication:** Telegram alert; the failure-alert step in the workflow already pings Telegram on `failure()`.
**Postmortem:** if it was an account/billing issue, document the fix and add a second host (cron VM) as standing redundancy.

---

## Scenario 3: Secret / credential compromise (`ENV_B64` or any API key leaked)

**Trigger conditions:** Suspected leak of `.env`/`ENV_B64`; unexpected API usage spikes; a key found in logs, a public commit, or a screenshot.

**Immediate actions (treat as P0)**
1. Pause sending: kill-switch `system_state.paused='true'` and disable both GitHub workflows.
2. Rotate the exposed credential(s) at the provider IMMEDIATELY (Brevo/SMTP2GO/Resend/Hunter/Cloudflare/Anthropic/Telegram/Slack/Neon). The S046 api-key-rotator skill logs rotations to `api_key_rotations`; do them manually if the rotator is not yet live for that service.
3. If `ENV_B64` itself leaked: rotate EVERY key (assume all compromised), regenerate the Neon connection string, and re-issue all Cloudflare tokens.

**Recovery steps**
1. Update `.env` with all new keys.
2. Re-encode and replace the secret (Scenario 9), and update GitHub Actions secret `ENV_B64`.
3. Revoke old keys after a 24h dual-key grace window (per S046 design) so in-flight jobs don't break.
4. Log the incident and each rotation in `api_key_rotations` (service, fingerprints, reason).
5. Lift the kill-switch and run one manual cycle.

**Estimated recovery time:** 1–3 hours depending on how many services need re-OAuth (Slack requires re-auth).
**Communication:** Telegram P0; if client data was in scope, follow Scenario 8 (GDPR).

---

## Scenario 4: Domain hijack / DNS theft (tamazia.co.uk)

**Trigger conditions:** Mail bouncing on the primary domain; MX/SPF/DKIM records changed unexpectedly; loss of access to the Cloudflare account.

**Immediate actions**
1. Lock the Cloudflare account via 2FA recovery; contact Cloudflare Registrar support with Tamazia incorporation documents as proof of identity.
2. Pause all outbound sending (kill-switch) so nothing sends from a compromised domain.

**Recovery steps**
1. Recover the domain via the registrar; restore the correct DNS zone (MX, SPF, DKIM, DMARC) from the records documented in `docs/DNS-FIX-ZOHO-AND-SMTP2GO.md` and the Cloudflare config in `cloudflare/`.
2. Until the primary recovers, the multi-domain backup sender (S050, Phase 15.5.1) can serve mail from a warmed backup domain alias — note: actual backup-domain provisioning is deferred (≈£10/yr) until needed, so this is a manual step today.
3. Re-verify deliverability (DKIM/SPF/DMARC pass) before resuming sending; lift kill-switch.

**Estimated recovery time:** 24–72 hours (registrar-bound).
**Communication:** Telegram P0; proactive note to active clients if inbound client mail was disrupted.

---

## Scenario 5: Primary sending relay suspended (e.g. Brevo / Resend account suspended)

**Trigger conditions:** Relay returns auth/suspension errors; deliverability drops; provider emails about complaint-rate or spam suspicion.

**Immediate actions**
1. Pause new outreach (kill-switch) to stop the pattern that triggered it.
2. The relay router (`relay-router.js`) supports Brevo, SMTP2GO, MailerSend, Resend, MailerLite, SendGrid, Mailjet — switch the primary cold rail to a healthy relay by setting the relay env / `COLD_RAIL` and re-running.

**Recovery steps**
1. Switch primary sending to SMTP2GO + MailerSend (or any healthy relay in the router).
2. Contact the suspended provider's support with documentation of legitimate, consented B2B outreach.
3. Investigate root cause: a bad template variant, an alias, or a recipient list — check `outreach_drafts` blocked rows (`blocked_spam_lint`, `blocked_duplicate_content`) and the 7-day bounce rate (the scheduler already auto-pauses at ≥8%).
4. Resume sending on the healthy relay; restore the suspended relay to the pool once reinstated.

**Estimated recovery time:** minutes to switch relays; days for reinstatement.
**Communication:** Telegram alert; no client comms required.

---

## Scenario 6: Notification channel outage (Slack / Telegram down)

**Trigger conditions:** Alerts stop arriving; `scripts/notify-telegram.sh` / `notify-slack.sh` fail.

**Immediate actions**
1. The two channels back each other up — if Telegram is down, Slack still works and vice versa.
2. If both are down, fall back to email notifications via a healthy relay (Resend/Brevo).

**Recovery steps**
1. Continue all operations — notifications are observability, not a hard dependency; the engine keeps running.
2. Queue any approvals in the `aman_actions` table (S048 action queue) so nothing is lost while channels are down — Aman drains the queue (`node src/skills/S048-action-queue/scripts/action-queue.js list`) when channels return.
3. Resume normal channels once restored.

**Estimated recovery time:** N/A — degrade gracefully; no recovery clock.
**Communication:** none needed.

---

## Scenario 7: PI insurance claim (professional-indemnity exposure on a delivered audit/scan)

**Trigger conditions:** A client/third party alleges harm from a delivered audit, scan, or compliance statement.

**Immediate actions**
1. Notify the insurer immediately, within the policy notification window (usually 24h).
2. Halt scans/audits for the implicated sector (pause the relevant queues / kill-switch).

**Recovery steps**
1. Preserve evidence: export the full audit trail for the affected lead(s) via S049 (`audit_trail_exports`) — every send, decision, framework version used, and sender identity at time of action.
2. Document the timeline, communications, and framework versions used.
3. Escalate to a specialist solicitor; do not communicate with the claimant outside counsel.

**Estimated recovery time:** claim-dependent (weeks).
**Communication:** counsel-directed only.

---

## Scenario 8: GDPR enforcement action / regulator (ICO) request

**Trigger conditions:** ICO contact, a subject access request (SAR), or an enforcement notice.

**Immediate actions**
1. Engage the Article 27 representative (Phase 2.2.1) if the request concerns EU data subjects.
2. Acknowledge within statutory deadlines (SAR: 1 month).

**Recovery steps**
1. Provide the regulator with the audit trail via S049 audit-trail export (`audit_trail_exports`): every action on the lead, every decision logged, every consent/unsubscribe event, framework versions, and sender identity — with a cryptographic signature for immutability.
2. If ordered, suspend processing for the affected records (kill-switch + status flags).
3. Document remediation steps and timelines.

**Estimated recovery time:** request-dependent.
**Communication:** regulator + counsel only.

---

## Scenario 9: Loss of the secret bundle (`ENV_B64` / `.env`) — the meta-disaster

**Trigger conditions:** GitHub secret deleted AND the local `.env` lost (e.g. Mac dies with no backup).

**Why this is the worst case:** without the secret you cannot reach Neon, the relays, Cloudflare, or any provider — every other recovery depends on it.

**Prevention (do this NOW, not after a disaster)**
1. Keep `.env` in at least TWO places off the engine host: a password manager / encrypted vault entry AND an encrypted offline copy. The repo `.gitignore` excludes `.env` (it must NEVER be committed).
2. Periodically refresh the off-host copy after any key rotation.

**Recovery (if it is truly lost)**
1. Reconstruct from the provider dashboards: log into each service (Neon, Brevo, SMTP2GO, MailerSend, Resend, Hunter, Cloudflare, Anthropic, Groq, Gemini, Telegram, Slack, Zoho, Gmail) and regenerate/copy each key. `docs/API-KEYS-REGISTRY.md` and `SECRET-KEYS.md` list which services exist.
2. Rebuild `.env` from `.env.example` (key names) plus the regenerated values.
3. Re-encode: `base64 -i .env | tr -d '\n' > env_b64.txt`, paste into GitHub secret `ENV_B64`.
4. Verify: `echo "$ENV_B64" | base64 -d | diff - .env` should be empty.

**Estimated recovery time:** 2–4 hours of manual re-issuing.
**Communication:** Telegram once restored.

---

## Quarterly DR drill (Phase 15.3.2)

Run one scenario as a live drill each quarter and record the result in `reports/dr-drills/YYYY-Qn.md`
and the `dr_drills` table (scenario, target vs actual minutes, gaps, pass/fail):

- **Q1:** Neon restore drill (restore to an ephemeral branch, verify `SELECT count(*)` parity, drop it).
- **Q2:** Engine-host migration drill (clone repo on a fresh machine, run one cycle by hand).
- **Q3:** Notification fallback drill (simulate Telegram down, confirm Slack/email + action-queue capture).
- **Q4:** Full simulated incident (pick a random scenario from this runbook).

Each drill produces: time taken vs target, gaps identified, and any updates this runbook needs.

---

## Postmortem template (use for every real incident)

```
# Incident: <short title> — <date>
Severity: P0 / P1 / P2
Detected: <how + when>
Scenario(s): <which runbook scenario(s) applied>
Timeline:
  - HH:MM  detection
  - HH:MM  immediate action taken
  - HH:MM  recovery start
  - HH:MM  service restored
Data loss: <window / none>
Root cause: <what actually happened>
What worked: <…>
What didn't: <…>
Runbook updates: <changes made to THIS file>
Follow-ups: <owners + dates>
```
