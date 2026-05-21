# TAMAZIA COWORK OS · EXECUTION FOLDER
**Single-folder home for the full execution plan. Self-contained. Everything Cowork needs.**

## WHAT THIS FOLDER IS

Every file required to execute the Tamazia Cowork OS plan with 100% precision and verifiable completion. Open this folder in Cowork, paste the master prompt below, and the system runs phase-by-phase until done.

## STRUCTURE

```
COWORK-OS-EXECUTION/
├── README.md                              (this file)
├── EXECUTE-PROMPT.md                      (the precision prompt to paste into Cowork)
│
├── Foundation files (read these first):
│   ├── TAMAZIA-EXECUTION-MASTER.md        (law of execution, phase gate mechanism)
│   ├── TAMAZIA-EXECUTION-VERIFICATION.md  (scripts source code, 10 check types)
│   ├── TAMAZIA-EXECUTION-SKILLS.md        (58 skills specification)
│   └── TAMAZIA-EXECUTION-CONNECTORS.md    (MCPs, plugins, free AI tools)
│
├── Phase files (executed in sequence, gate-enforced):
│   ├── TAMAZIA-EXECUTION-PHASE-0.md       (Pre-flight approvals, 15 tasks)
│   ├── TAMAZIA-EXECUTION-PHASE-1.md       (Infrastructure triage, 20 tasks)
│   ├── TAMAZIA-EXECUTION-PHASE-2.md       (Compliance + legal foundation, 28 tasks)
│   ├── TAMAZIA-EXECUTION-PHASE-3.md       (Compose body + classifier, 30 tasks)
│   ├── TAMAZIA-EXECUTION-PHASE-4.md       (Warmup v6 + alias health, 24 tasks)
│   ├── TAMAZIA-EXECUTION-PHASE-5.md       (Audit micro-site luxury, 35 tasks)
│   ├── TAMAZIA-EXECUTION-PHASE-6.md       (50-pointer personalisation + LLM, 26 tasks)
│   ├── TAMAZIA-EXECUTION-PHASE-7.md       (Lead sourcing 50-API engine, 32 tasks)
│   ├── TAMAZIA-EXECUTION-PHASE-8.md       (Ad intelligence scrapers, 18 tasks)
│   ├── TAMAZIA-EXECUTION-PHASE-9.md       (LinkedIn + Instagram + Cal.com, 25 tasks)
│   ├── TAMAZIA-EXECUTION-PHASE-10.md      (Sector intelligence + 500-title matrix, 22 tasks)
│   ├── TAMAZIA-EXECUTION-PHASE-11.md      (Chief of Staff + notifications, 20 tasks)
│   ├── TAMAZIA-EXECUTION-PHASE-12.md      (Deploy bulletproofing, 18 tasks)
│   ├── TAMAZIA-EXECUTION-PHASE-13.md      (Continuous improvement, 12 tasks)
│   ├── TAMAZIA-EXECUTION-PHASE-14.md      (Post-signature lifecycle, NEW, 28 tasks)
│   └── TAMAZIA-EXECUTION-PHASE-15.md      (Operations resilience, NEW, 22 tasks)
│
├── Reference files:
│   ├── COWORK-OS-PURCHASES.md             (subscription decisions)
│   └── COWORK-OS-EMAIL-TEMPLATES.md       (every email body)
│
├── Working folders (Cowork populates during execution):
│   ├── scripts/                           (bash scripts: verify-task.sh, verify-phase.sh, etc.)
│   │   └── lib/                           (checks.sh, colors.sh, log.sh)
│   ├── verification-logs/                 (every check's pass/fail logged with timestamp)
│   ├── confirmations/                     (Aman action receipts: decisions, approvals)
│   ├── policies/                          (PI insurance, ICO, EU rep documents)
│   │   └── contracts/                     (signed client contracts)
│   ├── signatures/                        (aman.txt sender block, disclaimer.txt)
│   ├── drafts/                            (T&Cs drafts, Privacy drafts)
│   │   └── case-studies/                  (case study drafts pre-approval)
│   ├── backups/                           (DB dumps, n8n exports, pre-phase snapshots)
│   ├── reports/                           (weekly/monthly/quarterly reports)
│   │   └── dr-drills/                     (disaster recovery drill logs)
│   ├── templates/                         (contract DOCX, email HTML)
│   ├── docs/                              (runbooks, strategy docs)
│   │   └── runbooks/                      (disaster-recovery.md, etc.)
│   ├── src/                               (code: lib, data, components)
│   ├── migrations/                        (SQL migrations applied to Neon)
│   └── tests/                             (test specs, performance budgets)
│
└── archive-v1/                            (superseded v1 docs kept for context)
    ├── COWORK-OS-MASTER-PLAN.md
    └── COWORK-OS-TRACKER.md
```

## TOTALS

- **15 phases** (gate-enforced sequence)
- **377 atomic tasks** (each ≤30 min, machine-checkable verification)
- **58 skills** (7 existing + 51 new)
- **21 n8n workflows** (W1-W19 + W1b + W1c)
- **50 free APIs** (sourcing + ad intelligence + monitoring)
- **Spend**: £40-60/month recurring + £440/year annual

## EXECUTION RULE (the 100% precision mechanism)

1. Tasks tick only when `bash scripts/verify-task.sh {id}` returns exit 0
2. Phase N locked until `bash scripts/verify-phase.sh {N-1}` returns exit 0
3. Nightly regression re-verifies every completed task, flips to BLOCKED if breaks
4. Manual override requires reason + 7-day re-check
5. No HTML hosting needed: Cowork's native TaskCreate/TaskUpdate is the live tracker

## HOW TO USE

1. Open this folder in Cowork.
2. Paste the prompt from `EXECUTE-PROMPT.md` (next file in this folder).
3. Cowork starts at Phase 0, walks the entire plan with verification per task.
4. Watch the TaskList widget tick as work completes.
5. Resolve any Aman-required actions when prompted.

End of README.
