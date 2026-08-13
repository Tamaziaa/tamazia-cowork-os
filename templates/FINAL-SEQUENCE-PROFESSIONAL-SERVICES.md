# FINAL COLD SEQUENCE · Professional Services (UK law firms) · v1 2026-05-23
Ready-to-launch 4-touch sequence for the live segment (UK solicitors / law firms sourced via local search).
Reconciled with the REAL sending reality and built to clear the deliverability + credibility bar.

## THE TWO RECONCILED REALITIES (read before launch)
1. **Sender identity.** The 30 MailDeck inboxes are FEMALE personas (e.g. Reagan Caldwell, Jasmine Haverford),
   firstName.lastName@lookalike-domain. So mail CANNOT be signed "Aman Pareek" from these inboxes — the From
   name and the signature would not match, which is the single fastest way to look fake to a solicitor and to
   spam filters. RESOLUTION: send AS the persona, position her as a Tamazia strategist, and carry Aman's King's
   credential as the FIRM's anchor in the body + signature. (If you would rather Aman be the visible sender,
   the inboxes must be renamed in Google Workspace admin — we do not have that access yet; it is a MailDeck
   request, flagged separately.)
2. **The credibility wedge stays.** Every email still earns trust through: Aman Pareek (LLM, King's College
   London; business law + international arbitration), Tamazia's regulated-sector delivery, and a free,
   firm-specific Regulatory Signal Scan offered before any pitch. Booking + signature anchor: tamazia.co.uk.

## VOICE + GUARDRAILS
- Direct, peer-level, zero filler. No em dashes or hyphens as pauses. No "hope this finds you well",
  "just following up", "quick question", "circling back". No "free"/"£"/"!" in subject lines. Plain text.
- One idea per email. Short. Specific to the firm. A soft, single CTA.
- Touch 1 MUST reference the firm's audit URL (the engine hard-blocks Touch 1 if the link is missing/broken).
- Compliance footer auto-appended (GDPR legitimate-interest B2B, STOP to unsubscribe, scan disclaimer).

## TOKENS
{{first_name}} {{firm}} {{city}} {{practice_area}} {{competitor_firm}} {{monthly_search_volume}}
{{audit_url}} {{persona_name}} {{persona_first}} {{booking_url=https://tamazia.co.uk/book}}

---

## TOUCH 0 · Day 0 · the specific finding (permission, ~120 words)
**Subjects (rotate):**
1. {{firm}} and "{{practice_area}} {{city}}"
2. a specific finding about {{firm}}'s visibility
3. {{competitor_firm}} is outranking {{firm}} for {{practice_area}}

**Body:**
```
Hi {{first_name}},

A specific observation, not a pitch. For "{{practice_area}} {{city}}", {{firm}} does not appear in the
top results, but {{competitor_firm}} does, even though your team is more senior on the actual work. That
gap is roughly {{monthly_search_volume}} searches a month going to a competitor.

I work with Tamazia. We run on regulated firms only, which is why our founder is a King's College London
law graduate (Aman Pareek, business law and international arbitration) rather than a generalist agency.
It means we improve visibility without writing anything the SRA would flag.

Worth me sending the specific pages and compliance signals behind that gap, no obligation?

{{persona_name}}
Tamazia
```

---

## TOUCH 1 · Day +5 · the scan (value-first, ~110 words) [REQUIRES audit_url]
**Subjects:**
1. {{firm}}'s visibility scan
2. the pages behind the {{practice_area}} gap
3. mapped it for {{firm}}

**Body:**
```
{{first_name}},

I put the actual breakdown together for {{firm}}:
{{audit_url}}

Three things inside:
1. Where {{firm}} sits against your three nearest competitors for {{practice_area}} and related terms.
2. The handful of pages doing the damage, and the order to fix them (roughly eight weeks of work, not
   eighteen months of retainer).
3. SRA transparency and compliance signals on your site, flagged, not advised on.

It is yours to keep whether or not we ever speak. If a section is useful, I am happy to walk you through it.

{{persona_name}}
Tamazia · founded by Aman Pareek, LLM (King's College London)
```

---

## TOUCH 2 · Day +10 · one finding + the number (~85 words)
**Subjects:**
1. the one thing in {{firm}}'s scan
2. {{firm}}: the page costing you instructions
3. most material item for {{firm}}

**Body:**
```
{{first_name}},

If you only open one part of the scan for {{firm}}, make it the {{practice_area}} section. It is the
single page standing between your senior team and the instructions currently going to {{competitor_firm}}.

Scan still live: {{audit_url}}

If eight weeks feels worth a conversation, my calendar is here: {{booking_url}}. If not, I will not chase.

{{persona_name}}
Tamazia
```

---

## TOUCH 3 · Day +20 · clean close (~55 words)
**Subject:** closing {{firm}}'s file

**Body:**
```
{{first_name}},

Closing {{firm}}'s file on my side today, no follow-up after this.

The scan stays live for you: {{audit_url}}

If visibility moves up the priority list later this year, just reply to this thread and I will pick it up.

{{persona_name}}
Tamazia
```

---

## REPLY HANDLERS (persona-sent; legal threats route to Aman + Danish only)
- INTERESTED / BOOK → "Glad it was useful. Calendar: {{booking_url}}, or send two or three windows that
  suit {{firm}} this week. Our founder Aman usually joins these so you are talking to the person who
  designed the approach." (persona books; Aman joins the call = the credential pays off live.)
- PRICING → tiers from the existing library (Audit + 90-day build £4,500 setup + £4,500/mo ×3 then £3,000/mo
  retainer; strategy-only £2,500/mo; bespoke from £15,000). Send the investment section of {{audit_url}}.
- "WE HAVE AN AGENCY" → second-opinion framing: keep the scan to test their next quarter; not a replacement ask.
- NOT NOW → mark revisit; scan stays live; offer a no-pitch quarterly check-in.
- WRONG PERSON → ask for a one-line intro to whoever owns the website/marketing.
- HOSTILE / STOP → immediate suppression + apology, no follow-up.
- LEGAL THREAT → never auto-reply; surface to Aman, copy Danish (CLO).

## COMPLIANCE FOOTER (auto-appended)
```
Tamazia, [registered office], United Kingdom. Company no. [number]. ICO: ZA[number].
The Regulatory Signal Scan identifies publicly visible signals only. It is not legal advice and is not a
substitute for qualified counsel. Reply STOP to unsubscribe. We process your data under legitimate interest
(Art. 6(1)(f) GDPR) for B2B outreach. Privacy: tamazia.co.uk/privacy.
```

## HOW THIS LOADS INTO THE ENGINE
- Replace the weak auto-generated Touch-0 drafts (e.g. lead 78 "uses Google Tag Manager") with Touch 0 above.
- The compose step fills tokens per lead (firm, practice_area, competitor_firm, monthly_search_volume from
  the enrichment + SERP data already in the pipeline; audit_url from the S025 audit-page builder).
- {{persona_name}} = the MailDeck mailbox that the pool assigns to that lead (set at send time so From and
  signature always match).
- Touch 1 stays blocked by send-due until audit_url resolves 200 (existing guard) — correct.
