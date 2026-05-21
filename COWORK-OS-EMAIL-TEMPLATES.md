# TAMAZIA COWORK OS · EMAIL TEMPLATE LIBRARY
**Updated 2026-05-17 · All cold outreach body templates, ranked variants per sector**

## STRUCTURE

This file holds every email body template the system sends. Each template has:
- Sector
- Touch number (0, 1, 2, 3, 4)
- Variant (A/B/C for A/B testing)
- Word count
- Approach type (permission / value-first / curiosity / breakup)
- Subject line options (3)
- Body
- Sender alias type recommendation
- Pre-flight checks (forbidden phrases, compliance disclaimer, signature)

The compose-body skill (S4) reads from this file and substitutes personalisation tokens.

---

## TEMPLATE A · SWITCHING-AGENCIES CHALLENGE (cross-sector, your new request)

This is the new template responding to your "ask current agency for compliance + SEO report and compare" directive.

### A.V1 · Value-first challenge (recommended default, 175 words)

**Subjects:**
1. Quick comparison test for {{Firm}}
2. Side-by-side: {{Firm}} vs your current agency
3. {{First name}}, a 2-minute test for {{Firm}}

**Body:**
```
Hi {{First name}},

A short test, no pitch attached.

Most agencies servicing {{sector}} firms send quarterly reports that look impressive but skip the things regulators actually care about. We built a scan that doesn't.

Two options if you're curious where {{Firm}} stands today:

One. Ask your current agency for their last compliance and SEO report on {{domain}}. Read it. Note what's measured and, more importantly, what isn't.

Two. We'll send you ours on {{domain}}, same scope, side-by-side ready. Free. Yours to keep regardless of next steps.

If our scan finds gaps theirs didn't, the question answers itself. If theirs is stronger, no harm done and you've validated your agency.

For firms who decide to switch after the comparison, full onboarding migration is included. Audits, briefs, accounts, tracking, all handled by us, zero internal time from your team.

Reply with a 'yes' and the scan lands in your inbox within 48 hours.

Aman Pareek
International Business Lawyer
Founder, Tamazia
```

**Sector fit:** Legal, FS, Real Estate, Professional Services (relationship-driven sectors that respect peer challenges)

**Forbidden phrase check:** No em dashes. No "Hope this finds you well". No "I'd love to". No URL shorteners. No attachments mentioned.

**Compliance footer auto-appended.**

---

### A.V2 · Shorter for already-warm leads (95 words)

**Subjects:**
1. Side-by-side test, {{Firm}} vs your agency
2. 90-second comparison for {{Firm}}
3. {{First name}}: test your agency at zero cost

**Body:**
```
{{First name}},

We do something most agencies won't: send the scan first, let the work speak.

Take 90 seconds: pull your agency's last report on {{domain}}. Then let me send you ours, same domain, same scope. Compare. Decide.

If you switch, onboarding migration is on us. If you don't, you've stress-tested your incumbent at zero cost.

Reply 'send it' and yours arrives in 48 hours.

Aman Pareek
International Business Lawyer
Founder, Tamazia
```

**Sector fit:** Any sector with prior warm signal (open + click history, LinkedIn engagement, mutual connection intro)

---

### A.V3 · Partner-grade status framing (145 words)

**Subjects:**
1. A challenge for whoever runs {{Firm}}'s SEO
2. {{First name}}: the only way to know your agency is good
3. Test your incumbent at zero cost, {{Firm}}

**Body:**
```
{{First name}},

Most firms at your level have an agency they trust. Few have ever audited the audit.

What I'd offer:

Compare. Ask your incumbent for their most recent compliance and SEO report on {{domain}}. We'll send you ours on the same domain, same scope, free. Side by side.

If ours surfaces material gaps theirs missed, you've identified a blind spot worth fixing. If theirs is the stronger document, you've validated a partnership. Either result is useful intelligence.

For firms who switch, full onboarding is included so the transition is invisible internally.

This is the only way to know what level of work is actually possible for {{Firm}}.

Reply 'compare' and the scan is yours within 48 hours.

Aman Pareek
International Business Lawyer
Founder, Tamazia
```

**Sector fit:** Senior partners, founders, principals across all sectors. Lead must have title flagged as PARTNER_GRADE.

---

## TEMPLATE B · HOSPITALITY VALUE-FIRST (touch 0)

### B.V1 · OTA commission angle (165 words)

**Subjects:**
1. {{Hotel}} OTA commission question
2. Your direct booking page noticed
3. {{First name}}: where {{Hotel}}'s commissions are leaking

**Body:**
```
Hi {{First name}},

Your last 90 days of OTA commission cost {{Hotel}} approximately £{{ota_cost_calc}}, based on {{rooms}} rooms at {{adr}} ADR and {{occupancy}}% occupancy. Most of that is recoverable.

Direct bookings on your site lose to Booking.com because:
- Page load: {{page_load_s}}s vs Booking.com 0.9s
- Best-rate guarantee not visible above fold
- Cart abandonment recovery missing

A scan I built for {{Hotel}} specifically, no template, is here:
tamazia.co.uk/audit/{{slug}}/{{hash}}

Inside: every page mapped against the 14 booking conversion factors regulators in the EU now require under DMA, plus a £-value estimate per fix.

If the audit is useful, my team handles the implementation in 30 days, you pay only for what we ship. If not, scan stays yours, no obligation.

180-day link, no password.

Aman Pareek
International Business Lawyer
Founder, Tamazia
```

**Personalisation tokens required:** ota_cost_calc, rooms, adr, occupancy, page_load_s, slug, hash

---

## TEMPLATE C · LAW FIRM PERMISSION FRAMING (touch 0)

### C.V1 · Practice area ranking gap (155 words)

**Subjects:**
1. {{Firm}} ranking for {{practice_area}}
2. Quick note about {{Firm}}'s search visibility
3. {{First name}}: a specific finding about {{Firm}}'s SEO

**Body:**
```
Hi {{First name}},

A specific observation about {{Firm}}: you don't rank top-3 for "{{practice_area}} {{city}}" but {{competitor_firm}} does, despite your team being more senior on the actual subject matter.

This is fixable in approximately 8 weeks of structured work, not 18 months. The opportunity is roughly {{monthly_search_volume}} searches/month at your fee tier.

I built a scan that maps the exact pages that need work and the regulatory compliance gaps SRA would flag:
tamazia.co.uk/audit/{{slug}}/{{hash}}

Three things in there:
1. Practice area visibility map vs your 3 nearest competitors
2. SRA Code of Conduct signals on your site (no advice, signals only)
3. Authority-building 90-day plan, prioritised

If useful, happy to walk through it. If not, scan stays yours, link works for 180 days.

Aman Pareek
International Business Lawyer
Founder, Tamazia
```

---

## TEMPLATE D · CLINIC HEALTHCARE (touch 0, 160 words)

### D.V1 · CQC inspection cross-reference

**Subjects:**
1. {{Clinic}} CQC inspection observation
2. Your CQC report and what your site doesn't address
3. {{First name}}: bridging {{Clinic}}'s CQC narrative

**Body:**
```
Hi {{First name}},

Your CQC inspection in {{inspection_date}} flagged {{cqc_finding}}. {{Clinic}}'s website doesn't address it currently. Prospective patients researching {{practice_area}} clinics typically find the CQC note before they find your reassurance, because it ranks higher.

This is normal. It's also fixable in two weeks of structured content work, which moves your reassurance above the inspection note in organic results.

I built a scan for {{Clinic}} that maps:
- All CQC-relevant content gaps on your site
- 8 specific pages that need to exist
- A 90-day publishing plan, sequenced by impact
- Compliance signal review against MHRA + GDC/GMC/NMC + CQC

Link: tamazia.co.uk/audit/{{slug}}/{{hash}}

Scan is free, link lives 180 days, no pitch attached. If useful, you know where to find me.

Aman Pareek
International Business Lawyer
Founder, Tamazia
```

---

## TEMPLATE E · PERSONAL BRAND (touch 0, 150 words)

### E.V1 · AI search citation gap

**Subjects:**
1. {{First name}}: ChatGPT can't cite you
2. Your name in AI search results
3. {{First name}}: a specific gap in your visibility

**Body:**
```
Hi {{First name}},

ChatGPT cannot cite you. Perplexity cannot find you. Claude has no entry for "{{First name}} {{Last name}} {{specialism}}".

The {{n_competitors}} other people in your specialism who do get cited are getting the referrals you should be getting. This is the most under-priced shift in personal brand visibility in 2026.

I built a scan that maps:
- Your current AI citation status across 4 platforms
- Specific content gaps preventing citation
- Knowledge panel eligibility
- 90-day plan to fix, prioritised

Link: tamazia.co.uk/audit/{{slug}}/{{hash}}

If useful, you know where to find me. Scan is free, no follow-up unless you reply.

Aman Pareek
International Business Lawyer
Founder, Tamazia
```

---

## TEMPLATE F · FOLLOW-UP TOUCHES (any sector)

### F.T1 · Touch 1 reminder (any sector, 60 words)

**Subject:** Re: {{original_subject}}

**Body:**
```
{{First name}},

Quick check on the {{sector}} scan I sent over for {{Firm}}.

If the link didn't open, here it is again: tamazia.co.uk/audit/{{slug}}/{{hash}}

If the timing is off, just say "not now" and I'll close it cleanly.

Aman
```

---

### F.T2 · Touch 2 value drop (any sector, 75 words)

**Subjects:**
1. One specific finding from {{Firm}}'s scan
2. {{First name}}: the most material item in your scan
3. {{Firm}}: the £ value of one fix

**Body:**
```
{{First name}},

If you only read one section of {{Firm}}'s scan, it should be {{top_finding_section}}. Estimated value: £{{fix_value}}/year recovered with the work outlined.

Full scan still here: tamazia.co.uk/audit/{{slug}}/{{hash}}

If 90 days is too long to wait for the result, my team starts in two weeks. If not, no follow-up after this.

Aman
```

---

### F.T3 · Touch 3 breakup (any sector, 55 words)

**Subject:** Closing your file at Tamazia

**Body:**
```
{{First name}},

Closing {{Firm}}'s file at Tamazia today.

Scan stays live at tamazia.co.uk/audit/{{slug}}/{{hash}} for the full 180 days. No follow-up from here.

If timing shifts later this year, the door is open.

Aman
```

---

## TEMPLATE G · POST-REPLY RESPONSES (by intent category)

### G.HOT_BOOK · Calendar offered

```
{{First name}},

Great. My calendar:
{{calendly_url}}

If preferred, send 3 windows that work for {{Firm}} this week and I'll confirm.

Anything in particular you want me to prepare for the call?

Aman
```

---

### G.HOT_PRICE · Pricing asked

```
{{First name}},

Three tiers depending on scope:

- Audit + 90-day implementation: £4,500 setup + £4,500/month for 3 months, then £3,000/month retainer
- Strategy-only engagement: £2,500/month for 6 months
- Bespoke project (defined scope): from £15,000 per engagement

Full pricing breakdown including what's included is on the audit page: tamazia.co.uk/audit/{{slug}}/{{hash}}#investment

Happy to walk through which fits {{Firm}}'s situation: {{calendly_url}}

Aman
```

---

### G.OBJECTION_INCUMBENT · "We have an agency"

```
{{First name}},

Understood. Most {{sector}} firms at your level do.

The offer wasn't to replace them, it was to give you a second-opinion document you can use to test their work or steer their next quarter. Worth keeping in the drawer.

If your agency is delivering, the scan validates them. If they're not, you have ammunition for the next review meeting.

Either way, the scan link works for 180 days: tamazia.co.uk/audit/{{slug}}/{{hash}}

If at any point that changes, my line is open.

Aman
```

---

### G.OBJECTION_BUDGET · "Not the right time"

```
{{First name}},

Understood. The scan is free regardless, so the value sits with you whenever you're ready.

Link works for 180 days: tamazia.co.uk/audit/{{slug}}/{{hash}}

If you'd like a quarterly check-in (no pitch, just updated data), reply 'yes' and I'll add you to a single check-in cadence. Otherwise, no follow-up.

Aman
```

---

### G.WARM_TIMING · "Not now, maybe later"

```
{{First name}},

Marking {{First name}}'s file as 'revisit {{return_month}}' on my side.

The scan stays live for 180 days: tamazia.co.uk/audit/{{slug}}/{{hash}}

If anything moves earlier, just reply to this thread.

Aman
```

---

### G.WRONG_PERSON · Redirect

```
{{First name}},

Thanks for flagging. Would you mind a one-line intro to whoever owns {{topic}} at {{Firm}}? I'll take it from there.

If easier, share the name and I'll reach out directly.

Aman
```

---

### G.HOSTILE · Apology and removal

```
{{First name}},

You're removed from all Tamazia outreach effective immediately. No follow-up.

Apologies for the interruption.

Aman
```

---

### G.LEGAL_THREAT · Escalation (Aman responds personally only)

This category never auto-responds. Surfaced to Aman immediately + Danish copied.

Template suggested for Aman:
```
{{First name}},

I take this seriously. I'd like to understand what specifically you're flagging. Could you share the message that triggered the concern?

You're suppressed from all future outreach effective now while we review.

Aman Pareek
International Business Lawyer
Founder, Tamazia
```

---

## COMPLIANCE FOOTER (auto-appended to all)

```
---
Aman Pareek, International Business Lawyer, Founder Tamazia.
Tamazia, [Registered office address], United Kingdom.
Company number: [number]. ICO Registration: ZA[number].
{{eu_rep_line_if_eu_recipient}}

Regulatory Signal Scan is powered by Tamazia. Frameworks are trained on publicly available regulatory sources by AI and reviewed by Aman Pareek, International Business Lawyer, [latest review date]. This scan identifies publicly visible signals only. It is not legal advice and is not a substitute for review by qualified counsel in your jurisdiction.

Reply STOP to unsubscribe. We process your data under legitimate interest (Article 6(1)(f) GDPR) for B2B outreach. Privacy policy: tamazia.co.uk/privacy.
```

---

## FORBIDDEN PHRASES (enforced by compose-body skill)

NEVER appears in any template:
- Em dashes (— or –) used as pause
- "Hope this finds you well"
- "Just following up"
- "Touching base"
- "Circling back"
- "I'd love to..."
- "I'd like to..."
- "Quick question"
- "Quick chat"
- "Synergy"
- "Game-changer"
- "Revolutionary"
- "Free" in subject line
- "Guarantee" in subject line
- "$" or "£" in subject line
- "!!" or "!!!"
- ALL CAPS in subject
- Emoji in subject
- "Click here"
- URL shorteners (bit.ly, ow.ly, etc.)

---

## VARIANT TRACKING

Each variant has an ID logged in `template_variants` table. Every send logs which variant was used. Weekly cron retires bottom-quartile reply-rate variants and replaces with new candidates.

After 100 sends per sector × variant, statistical significance threshold reached, winner declared.

After 500 sends per sector, variant pool stabilises with proven winners. New variants tested as 10% allocation against winners.

---

## ADDING A NEW TEMPLATE

To add a new sector or variant:

1. Add to this file under appropriate section
2. Add row to `template_variants` table with id, sector, touch, variant_letter, approach_type, word_count
3. Test 20 sends via test inbox seedlist
4. Verify mail-tester score ≥9/10 with personalisation tokens filled
5. Activate in production after Aman review
