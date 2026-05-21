# PHASE 12 · DEPLOY BULLETPROOFING + REGRESSION GUARDIAN
**Owner: Claude. Effort: 4 working days. Spend: £0.**

Make the deploy pipeline so robust it never breaks production. Pre-commit hooks, visual regression in CI, canary deployment, synthetic monitoring, automatic rollback. Nightly regression catches breakage in previously-verified tasks.

## PHASE PREREQUISITE
```bash
bash scripts/verify-phase.sh 11
```

## PHASE EXIT GATE
```bash
bash scripts/verify-phase.sh 12
```

---

### Task 12.1.1: Pre-commit hooks

Files: .husky/pre-commit, .lintstagedrc.json
Owner: Claude
Prerequisite: Phase 11 complete
Estimated time: 30 minutes

Verification:
```
# Try to commit broken file
echo "broken syntax {{" > /tmp/test.js
cp /tmp/test.js src/test-broken.js
git add src/test-broken.js
git commit -m "test" 2>&1 | grep -q "lint" || exit 1
rm src/test-broken.js
git reset HEAD
```

Expected output:
Broken commit blocked.

Description:
Install husky + lint-staged. Hooks:
- ESLint on .js/.ts files
- Astro check on .astro files
- Secret scanner (TruffleHog or Gitleaks) on all changes
- License compliance (license-checker)
- Markdown lint on .md files

Any failure = commit blocked with clear error message.

Failure mode: Hook performance slow. Resolution: Lint-staged only checks changed files, not whole repo.

Status: [ ] TODO

---

### Task 12.1.2: CI pre-build checks

Files: .github/workflows/ci-prebuild.yml
Owner: Claude
Prerequisite: 12.1.1
Estimated time: 30 minutes

Verification:
```
# Check workflow file exists and includes audit step
test -f .github/workflows/ci-prebuild.yml && \
grep -q "npm audit" .github/workflows/ci-prebuild.yml
```

Expected output:
Workflow includes security audit.

Description:
GitHub Actions workflow on every PR:
1. `npm ci` (clean install)
2. `npm audit --audit-level high` (block on high/critical)
3. Dependency snapshot vs main
4. Run unit tests where they exist
5. Astro build check

Block merge if any fails. Status check on PR.

Status: [ ] TODO

---

### Task 12.2.1: Visual regression testing

Files: tests/visual-regression/, .github/workflows/visual-diff.yml
Owner: Claude
Prerequisite: 12.1.2
Estimated time: 60 minutes

Verification:
```
test -d tests/visual-regression && \
ls tests/visual-regression/baselines/*.png | head -1
```

Expected output:
Baselines exist.

Description:
Playwright captures screenshots of 10 key pages:
- Homepage
- Audit example page
- Pricing
- Contact
- About
- Privacy
- Terms
- Sectors landing
- Case studies
- Blog index

Baseline stored in Cloudflare R2. On every PR: re-capture, diff vs baseline using pixelmatch library. >5% diff above fold: comment on PR with diff image, block merge until override tag added.

Failure mode: Animations cause false-positive diffs. Resolution: Disable animations in test mode via prefers-reduced-motion.

Status: [ ] TODO

---

### Task 12.2.2: Smoke test after deploy

Files: .github/workflows/post-deploy-smoke.yml
Owner: Claude
Prerequisite: 12.2.1
Estimated time: 30 minutes

Verification:
```
test -f .github/workflows/post-deploy-smoke.yml
```

Expected output:
Workflow exists.

Description:
After Cloudflare Pages deploy completes:
1. Curl key routes (/, /sectors, /pricing, /audit/{test-slug}/{hash}, /api/audit, /privacy, /terms)
2. Each: status 200, response time <2s, content match expected
3. Run Lighthouse on key pages
4. Assert LCP <1.5s, CLS <0.05

If any fails: trigger rollback workflow.

Failure mode: Cloudflare propagation delay causes smoke test failure. Resolution: Retry 3 times with 30s delay before declaring failed.

Status: [ ] TODO

---

### Task 12.3.1: Canary deployment

Files: src/middleware/canary.ts, wrangler.toml updates
Owner: Claude
Prerequisite: 12.2.2
Estimated time: 60 minutes

Verification:
```
test -f src/middleware/canary.ts && \
grep -q "X-Canary-Bucket" src/middleware/canary.ts
```

Expected output:
Canary middleware exists with bucket header logic.

Description:
Cloudflare Pages Functions middleware:
1. On every request, hash User-Agent + IP into bucket (0-99)
2. If bucket < 10 AND new deploy in canary state: serve new version
3. Otherwise: serve previous stable version
4. Header `X-Canary-Bucket` set so we can track

After deploy: 10% traffic to canary for 2 minutes. Monitor:
- 5xx rate
- Response time p95
- JS errors via client-side beacon

If issues: auto-rollback. Otherwise: promote to 100%.

Failure mode: Canary state stuck. Resolution: 30-minute timeout, force promote or rollback.

Status: [ ] TODO

---

### Task 12.3.2: Auto-rollback on error spike

Files: scripts/auto-rollback.sh
Owner: Claude
Prerequisite: 12.3.1
Estimated time: 30 minutes

Verification:
```
test -x scripts/auto-rollback.sh
```

Expected output:
Script executable.

Description:
Monitor canary for 2 minutes. If:
- 5xx rate > 1% (vs baseline)
- Response time p95 > 3s (vs 1.5s baseline)
- JS errors > 10/min from beacon

Trigger rollback:
1. Cloudflare Pages API: switch traffic 100% to previous deploy
2. Slack #tamazia-deploys: "Auto-rollback triggered. {Reason}"
3. Telegram P0: "Production rolled back."
4. Log to deploy_rollbacks table for postmortem

Failure mode: Rollback API fails. Resolution: Manual playbook in docs, Aman + Claude both notified.

Status: [ ] TODO

---

### Task 12.4.1: Synthetic monitoring

Files: scripts/uptime-monitors-setup.sh
Owner: Claude
Prerequisite: 12.2.2
Estimated time: 30 minutes

Verification:
```
# UptimeRobot API check
curl -s -X POST "https://api.uptimerobot.com/v2/getMonitors" \
  -d "api_key=$UPTIMEROBOT_KEY" | jq -e '.monitors | length >= 5'
```

Expected output:
At least 5 monitors active.

Description:
UptimeRobot free tier: 50 monitors, 5-min check intervals.
Configure monitors for:
- tamazia.co.uk (homepage)
- tamazia.co.uk/audit (example route)
- tamazia.co.uk/api/audit (audit endpoint)
- modest-magpie.pikapod.net (n8n)
- Each n8n workflow webhook
- ZeptoMail inbound

Alerts: Telegram on 2 consecutive fails. Status page at status.tamazia.co.uk (optional).

Failure mode: UptimeRobot rate limits API. Resolution: Manual setup via UI for first 50, automate updates only.

Status: [ ] TODO

---

### Task 12.4.2: Nightly regression script

Files: scripts/nightly-regression.sh (already created Phase 1), n8n cron
Owner: Claude
Prerequisite: 12.4.1
Estimated time: 30 minutes

Verification:
```
# Trigger nightly regression manually
bash scripts/nightly-regression.sh
# Verify no regressions OR regressions logged correctly
test -f verification-logs/regression-$(date +%Y%m%d)*.log
```

Expected output:
Regression log created.

Description:
Already created in Phase 1 (scripts/nightly-regression.sh from VERIFICATION.md). Now scheduled:

n8n cron 03:00 UK daily:
- For each completed task across all phase files (status='x' VERIFIED)
- Run its verification command
- If now fails: flip to [!] REGRESSED in MD, log, alert
- Commit MD changes to git, push (triggers deploy)
- Slack/Telegram summary

This is the regression guardian. Catches breakage that happens after a task was marked complete.

Failure mode: Long-running tasks (50+ tasks × 30s each = 25+ min). Resolution: Parallelise where possible, optimise long checks.

Status: [ ] TODO

---

### Task 12.5.1: Deploy log

Files: migrations/2026-05-25-deploy-log.sql
Owner: Claude
Prerequisite: 12.4.2
Estimated time: 20 minutes

Verification:
```
psql "$NEON_URL" -tA -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_name='deploys'" | grep -q "^1$"
```

Expected output:
Table exists.

Description:
Schema:
```sql
CREATE TABLE deploys (
  id SERIAL PRIMARY KEY,
  sha VARCHAR(40) NOT NULL,
  branch VARCHAR(100) NOT NULL,
  deployed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deployed_by VARCHAR(100) NOT NULL,
  duration_seconds INTEGER,
  status VARCHAR(20) NOT NULL,
  result VARCHAR(20),
  rollback_target_sha VARCHAR(40),
  notes TEXT
);
```

Every deploy logged via GitHub Actions step. Queryable history.

Status: [ ] TODO

---

### Task 12.6.1: Phase 12 sign-off

Files: confirmations/phase-12-complete.txt
Owner: Both
Prerequisite: All 12.x.x tasks
Estimated time: 5 minutes

Verification:
```
bash scripts/verify-phase.sh 12
```

Status: [ ] TODO

---

## PHASE 12 EXIT GATE

```bash
bash scripts/verify-phase.sh 12
```

Returns exit 0 only when:
- Pre-commit hooks operational (lint, secrets, license)
- CI pre-build (npm audit, dependency scan)
- Visual regression testing across 10 pages
- Smoke test after deploy
- Canary deployment with 10% rollout
- Auto-rollback on error spike
- Synthetic monitoring (UptimeRobot 5+ monitors)
- Nightly regression script scheduled
- Deploy log capturing every deploy

Phase 13 locked until this passes.

End of Phase 12.
