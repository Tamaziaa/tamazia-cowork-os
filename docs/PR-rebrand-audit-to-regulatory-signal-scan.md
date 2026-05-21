# PR · Rebrand "audit" → "Regulatory Signal Scan"
**Target repo**: github.com/Tamaziaa/tamazia-website (branch: `main` → branch out as `rebrand-rss`)
**Phase 1 tasks**: 1.3.1, 1.3.2, 1.3.3, 1.3.4
**Authored**: 2026-05-19 from COWORK-OS-EXECUTION

## Context
- "Regulatory Signal Scan" is the canonical customer-facing term per MASTER decision 0.6 and the disclaimer in `signatures/disclaimer.txt`.
- "audit" remains acceptable in internal/technical contexts (audit log, audit trail, audit page URL `/audit/{slug}/{hash}` kept for SEO continuity).
- Customer-facing surfaces — every email body, every subject line, every audit page heading, every site button copy — must use "Regulatory Signal Scan" or "scan" where space-constrained.

## Files to change in tamazia-website repo

### 1. Email templates (`src/templates/email/*.html`, `*.txt`)
Apply find-replace (preserve case where contextual):
| Old | New |
|---|---|
| "complimentary audit" | "complimentary Regulatory Signal Scan" |
| "free audit" | "complimentary scan" |
| "audit report" | "Regulatory Signal Scan" |
| "your audit for" | "your Regulatory Signal Scan for" |
| "audit findings" | "scan findings" |
| "the audit" | "the scan" |
| "audit will reveal" | "scan will reveal" |

Preserve "audit log", "audit trail", "audit history", "audit record".

### 2. n8n Workflow W7 (`Audit Delivery`)
Open W7 in n8n editor (`https://modest-magpie.pikapod.net/workflow/<W7-id>`):
- Subject template node: change `"Your audit for {{firm}}"` → `"Your Regulatory Signal Scan for {{firm}}"`
- Body template node: replace customer-facing "audit" tokens with "Regulatory Signal Scan"
- HTTP Request system prompts (Claude / Cloudflare AI calls): replace "Generate audit text" → "Generate Regulatory Signal Scan text"
- Save and tag workflow version with "v6 rebrand-rss" in workflow notes

### 3. TAMAZIA-OS skill files (`TAMAZIA-OS/skills/*/SKILL.md`)
| Skill | Action |
|---|---|
| `compose-body/SKILL.md` | replace customer-facing "audit" with "Regulatory Signal Scan"; keep internal terms |
| `sector-pitch/SKILL.md` | same |
| `audit-compliance-scanner/SKILL.md` | rename customer-facing copy; leave internal `audit` references |
| `generate-proposal-pdf/SKILL.md` | rename "audit PDF" → "Regulatory Signal Scan PDF" |
| `compose-subject/SKILL.md` | subject templates: same swap |

Plus update `TAMAZIA-OS/references/cold-email-footer.md`, `TAMAZIA-OS/references/sector-pitch-library.md`.

### 4. Astro micro-site pages (`src/pages/audit/` content)
Decision: KEEP URL `/audit/{slug}/{hash}` for SEO continuity. Only swap visible page copy:
- Hero heading: "Your Audit" → "Your Regulatory Signal Scan"
- Section subheads, CTAs, button labels, meta `<title>` / `<meta name="description">`
- Footer disclaimer block sources from `signatures/disclaimer.txt` (already says "Regulatory Signal Scan")

### 5. Hardcoded strings to sweep
Run from repo root:
```bash
grep -rIE "\baudit\b" src/ functions/ \
  --include="*.astro" --include="*.html" --include="*.txt" --include="*.json" --include="*.js" --include="*.ts" \
  | grep -vE "(audit_log|audit-log|audit trail|audit_history|/audit/|api/audit)"
```
Resolve every line. Internal `functions/api/audit.js` keeps filename and API path; only response-body strings and inline comments that surface to the user change.

## Verification (per task spec)
After deploy:
```bash
# 1.3.1
find src/templates/email -type f \( -name "*.html" -o -name "*.txt" \) -exec grep -lE "\baudit\b" {} \; | \
  xargs -I {} bash -c 'grep -E "audit\b" {} | grep -v "audit (log|trail|history|record)" | grep -v "Regulatory Signal Scan" && exit 1; exit 0'

# 1.3.2 (n8n)
curl -s -H "X-N8N-API-KEY: $N8N_API_KEY" "$N8N_URL/api/v1/workflows/<W7-id>" | \
  jq '.nodes | tostring' | grep -v "Regulatory Signal Scan" | grep -E '\baudit\b' && exit 1; exit 0

# 1.3.3 (skills)
find TAMAZIA-OS/skills -name "SKILL.md" -exec grep -lE "\baudit\b" {} \; | \
  xargs -I {} bash -c 'grep -E "audit\b" {} | grep -v "audit (log|trail|history)" | grep -v "Regulatory Signal Scan" && exit 1; exit 0'

# 1.3.4 (deployed page)
curl -s https://tamazia.co.uk/audit/test-firm/abc12345 | grep -q "Regulatory Signal Scan"
```

## Rollback
- Astro changes: `git revert` the rebrand commit.
- n8n W7: re-import previous workflow JSON from `backups/n8n-W7-pre-rebrand.json` (Aman exports before edit).
- Skill files: `git revert` in TAMAZIA-OS submodule / repo.

## Aman action checklist
1. Branch off main: `git checkout -b rebrand-rss`
2. Apply the find-replaces above on tamazia-website repo
3. Apply skill changes in TAMAZIA-OS folder
4. Open W7 in n8n, swap strings in nodes
5. Commit, push, open PR
6. Merge after Cloudflare Pages preview confirms the live page reads "Regulatory Signal Scan"
7. Re-run `bash scripts/verify-phase.sh 1` from COWORK-OS-EXECUTION — tasks 1.3.1–1.3.4 should flip from BLOCKED to VERIFIED automatically
