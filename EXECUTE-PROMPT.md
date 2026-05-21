# THE PRECISION EXECUTION PROMPT
**Paste the prompt below into Cowork to execute the full Tamazia Cowork OS plan with 100% verifiable completion.**

The prompt is designed to be self-contained: Cowork (Claude) reads it, knows exactly which files to load, follows the verification mechanism mechanically, never marks a task complete without the verification command passing, never starts a phase before the previous phase gate is open.

---

## PROMPT TO PASTE (copy everything between the lines)

═══════════════════════════════════════════════════════════════════════════════

Execute the Tamazia Cowork OS plan from `~/Desktop/TAMAZIA-REBUILD/COWORK-OS-EXECUTION/` with 100% precision and verifiable completion. This is binding. Follow exactly.

## STEP 1: LOAD CONTEXT (silent, do not narrate)

Read all four foundation files in order:
1. `COWORK-OS-EXECUTION/TAMAZIA-EXECUTION-MASTER.md` (the law of execution, phase gate mechanism)
2. `COWORK-OS-EXECUTION/TAMAZIA-EXECUTION-VERIFICATION.md` (verification scripts source + 10 check types)
3. `COWORK-OS-EXECUTION/TAMAZIA-EXECUTION-SKILLS.md` (58 skill specifications)
4. `COWORK-OS-EXECUTION/TAMAZIA-EXECUTION-CONNECTORS.md` (free AI tools and MCP leverage)

Also read `COWORK-OS-EXECUTION/COWORK-OS-PURCHASES.md` (subscription decisions, Aman approvals required).

## STEP 2: DETERMINE CURRENT STATE

Identify the current phase to execute:

a. If `COWORK-OS-EXECUTION/scripts/verify-phase.sh` does NOT exist yet: current phase is 0 (system never executed before).

b. If scripts exist: run `cd COWORK-OS-EXECUTION && bash scripts/verify-phase.sh N` starting at N=0 and incrementing until first non-zero exit. That non-zero phase IS the current phase.

c. Read the current phase file: `COWORK-OS-EXECUTION/TAMAZIA-EXECUTION-PHASE-{current_phase}.md`.

Report to me: "Current phase is {N}. Previous phase {N-1} gate is {open/closed}. Starting execution."

## STEP 3: TASKCREATE THE WORK

For every task in the current phase file that is NOT already marked `[x] VERIFIED`:
- Use TaskCreate to add it to the live task widget so I can watch progress.
- Use the task's exact ID (e.g., 2.4.1) as part of the task subject.
- Set activeForm to the task's "active" verb form (e.g., "Building T&Cs draft").

## STEP 4: EXECUTE EACH TASK IN ORDER

For each task in phase order:

a. TaskUpdate this task to `in_progress`.

b. Re-read the task definition fully from the phase file. You need: description, files, owner, prerequisite, verification command, expected output, failure mode.

c. Run prerequisite checks. For each prerequisite task ID listed: execute `bash COWORK-OS-EXECUTION/scripts/verify-task.sh {prereq_id}`. ALL must return exit 0. If any fails, mark this task `[!] BLOCKED` with note "Prereq {prereq_id} failing", TaskUpdate notes the blocker, skip to next task.

d. Branch on owner:
   - If owner is "Aman": STOP. Surface a clear message to me explaining exactly what I need to do (with file paths, links, credentials needed). Mark task `[!] BLOCKED awaiting Aman`. TaskUpdate stays in_progress with the blocker note. Continue to next task.
   - If owner is "Claude": proceed to (e).
   - If owner is "Both": do your part of the work, surface clear ask for my part, mark task partial-blocked. Continue to next.

e. Execute the work using Edit, Write, Bash (mcp__workspace__bash), and other tools as the task description requires. Reference the "files" field for exact paths. Reference the "description" field for what to build/change.

f. Run the verification command exactly as written in the task's "Verification:" section. Use mcp__workspace__bash to run it. Capture exit code and stdout/stderr.

g. Branch on verification result:
   - Exit 0: TaskUpdate this task to `completed`. Update the phase file: change `Status: [ ] TODO` (or whatever current state) to `Status: [x] VERIFIED`. Commit phase file change.
   - Non-zero: Do NOT mark completed. Update phase file: change Status to `Status: [!] BLOCKED` followed by a single-line note of the actual error output (first 200 chars). TaskUpdate keeps the task in_progress with blocker. Continue to next task (do not retry endlessly).

h. NEVER mark a task complete based on your own assessment. The verification command is the only authority. If verification fails, the task is blocked, full stop.

## STEP 5: AFTER ALL TASKS ATTEMPTED IN THIS PHASE

Run the phase exit gate: `bash COWORK-OS-EXECUTION/scripts/verify-phase.sh {current_phase}`.

If exit 0: phase complete. Report to me:
```
Phase {N} COMPLETE. All {count} tasks verified.
Phase {N+1} now unlocked.
Awaiting your "continue" or "execute phase {N+1}" to proceed.
```

If non-zero: phase incomplete. Report to me:
```
Phase {N} INCOMPLETE. {X} of {total} tasks verified.
Blocking tasks:
  - Task {id}: {reason} — needs {Aman action / Claude rework / etc.}
  - Task {id}: {reason}
  ...
Resolution options:
  1. Aman handles: {list of Aman-required items}
  2. Claude retries: {list of items where retry might help}
  3. Manual override (with reason): `bash COWORK-OS-EXECUTION/scripts/override-task.sh {id} "reason"`
```

## STEP 6: PERSIST STATE

After every task attempt (regardless of pass/fail):
- Commit the modified `TAMAZIA-EXECUTION-PHASE-{N}.md` file to local git
- If TELEGRAM_BOT_TOKEN is set in environment: notify status changes per the routing rules in Phase 11

## ENFORCEMENT RULES (non-negotiable)

L1: Tasks tick only when verification command returns exit 0. No exceptions. Not based on your judgment, not based on plausibility, not based on "obviously done". The bash command is the authority.

L2: Phase N tasks do not start until `bash scripts/verify-phase.sh {N-1}` returns exit 0. Enforce this at start. If gate closed, report blockers, stop.

L3: If a task requires Aman action (owner=Aman or Both with Aman part), stop and clearly state what's needed. Do not invent the Aman response. Do not mark as complete because you "think" Aman would approve. Wait for explicit confirmation in chat.

L4: Forbidden phrases (em dashes used as pause, "Hope this finds you well", "I'd love to", "Touching base", "Circling back", "Just following up", "Quick question", "Synergy", "Game-changer", "Revolutionary", "Click here", "free" in subject, "guarantee" in subject, "$"/"£" in subject, "!!", ALL CAPS, emoji in subject, URL shorteners) are blocked at the compose layer. Phase 1 task 1.4.4 builds the checker. Until then, manually enforce.

L5: Compliance disclaimer ("Generated using framework version {v} reviewed by Aman Pareek, International Business Lawyer, {date}. Not legal advice.") appears on every email, audit page, and PDF. Phase 2 task 2.5.3 enforces. Until then, manually include.

L6: Sender identity is permanent: "Aman Pareek, International Business Lawyer, Founder Tamazia" on signed comms. Alias-level sends sign off as alias first name only. Both are correct in their context.

L7: Reply terminates sequence. Any reply intent except OOO marks `leads.replied = TRUE` and stops automated follow-up. Hard-enforced at W4 and W2 guards.

L8: Spend is locked behind Aman approval in COWORK-OS-PURCHASES.md. Do not assume approval. Do not buy. Do not configure paid services without explicit tick.

L9: All AI calls route through the free LLM stack (Cloudflare Workers AI primary, Groq fast classification, Gemini Flash overflow, Claude Haiku reserved for HOSTILE/LEGAL_THREAT/contracts). Do not invoke paid LLM for routine work.

L10: Local-first tracking. Master truth is files in `COWORK-OS-EXECUTION/` folder + Cowork's TaskList widget. No external dashboards, no hosted artifacts, no SaaS trackers.

## REPORTING TONE

Direct, peer-level, no preamble, no filler. Lead with status, then details. Use plain text, not lists, unless listing genuine multi-item content. No em dashes. No "Great question!" or "I'll be happy to". Aman is a specialist; speak at his level.

## START NOW

Begin with Step 1. Do not ask for confirmation. Do not summarise this prompt back to me. Move.

═══════════════════════════════════════════════════════════════════════════════

## WHEN TO USE WHICH PROMPT

**For first execution of any phase**: use the master prompt above. It auto-detects current state and starts at the right phase.

**To resume after pause**: same prompt. It re-reads state from files + TaskList and picks up where it left off.

**To force execute a specific phase**: replace Step 2 with: "Current phase is {N}. Skip state detection. Read PHASE-{N}.md directly."

**To verify only without executing**: replace Step 4 onward with: "Run `bash scripts/verify-phase.sh {N}` for every phase 0-15. Report exit code per phase. Do not execute any task work. Just verify and report."

**To override a specific task**: not via prompt. Use `bash COWORK-OS-EXECUTION/scripts/override-task.sh {task-id} "reason"` directly (after Phase 1 builds the script).

## WHAT NOT TO DO

Do not:
- Paste a shorter prompt thinking Cowork will figure it out. The enforcement rules need to be explicit every time.
- Run multiple phases in parallel. The gate mechanism is sequential by design.
- Manually mark tasks complete in the MD files. Only `bash scripts/verify-task.sh` can do that, because only the verification check gates it.
- Skip the reading-foundation step. The law of execution is in MASTER, the check library is in VERIFICATION, the skills are in SKILLS, the leverage is in CONNECTORS. All four are required context.

## VERIFY YOUR EXECUTION IS WORKING

After the prompt runs:
1. Check `COWORK-OS-EXECUTION/scripts/` was populated with the bash scripts (Phase 1 task 1.1.1).
2. Check `COWORK-OS-EXECUTION/verification-logs/` has timestamped logs.
3. Check the relevant phase file has checkboxes flipped to `[x] VERIFIED` for completed tasks.
4. Check Cowork TaskList widget shows the same task statuses.
5. If all four checks pass, the system is working as designed.

End of EXECUTE-PROMPT.md.
