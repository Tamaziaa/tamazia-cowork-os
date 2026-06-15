# Claude Gap Ledger — the Layer-3 safeguard rule-book

**Purpose.** This is the persistent rule-book for the Layer-3 "Claude safeguard" (see
`.github/workflows/claude-safeguard.yml` + `scripts/claude-safeguard-batch.js`). Twice a day a dedicated Claude
Code session reviews the ~50 released-but-uncleared leads nearest to send and verifies each lead's info, its
minted audit (vs the real laws / live-site errors / real competitors), and its 5 touches before setting the
`leads.claude_*` clearance flags.

When that review uncovers a **systemic engine gap** — a *class* of defect behind a failed check, not a one-off
bad lead — it is recorded here so the engine learns permanently instead of the safeguard catching the same fault
every day. Each gap gets: the **gap** (what was wrong + how it was caught), the **root cause** (the upstream
engine reason, not the symptom), the **fix** (what changed, with the PR), and the **fixture** (the test / seed /
guard that locks the fix so the gap can never silently return).

One section per gap, appended over time, newest at the bottom. A one-off lead that is simply wrong is NOT a gap —
it is handled inline by withholding that lead's clearance. Only patterns that warrant an engine change land here.

## Format / template

Copy this block for each new gap:

```
### G-NNN — <short title>   (YYYY-MM-DD, batch <run_id>)
- **Gap:** <what was wrong, and the check/leads that surfaced it>
- **Root cause:** <the upstream engine reason — the source/enrich/qualify/mint/render step at fault>
- **Fix:** <what changed> (PR #<n>, commit <sha>)
- **Fixture:** <the test / seed lead / runtime guard that now locks it>
- **Status:** open | fix-merged | verified
```

## Gaps

<!-- (none yet — the safeguard appends gaps here as it finds them) -->
