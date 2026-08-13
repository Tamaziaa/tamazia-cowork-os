# PlusVibe 7-step sequence — paste-in templates (your exact copy, native merge tags)
Build this ONCE in PlusVibe (campaign → Sequences). Our export feeds the merge variables per lead, so
every recipient gets the exact, personalised copy with clean formatting. Spacing per step shown.
Merge tags used: {{first_name}} {{company_name}} {{audit_finding}} {{audit_url}} {{sector}} {{sender_persona}}
(first_name/company_name are standard PlusVibe fields; audit_finding/audit_url/sender_persona are CUSTOM
columns from our CSV — PlusVibe auto-creates a merge tag for every CSV column on import.)

SETUP (one time):
- Campaign → Settings: connect all 30 MailDeck inboxes; turn rotation ON; "stop sequence on reply" ON
  (PlusVibe default) so a reply auto-cancels that lead's remaining touches.
- Campaign → Schedule: business hours, your timezone, ~20-30 sends/inbox/day cap.
- Warm up all 30 inboxes ~15 days BEFORE cold (PlusVibe warmup ON).
- Sender match: import includes sender_email per lead; map the campaign to send each lead from its
  sender_email (PlusVibe "sending account" assignment) so the From matches {{sender_persona}}.

---
STEP 1 · Wait 0 days · Subject: {{company_name}} in our 2026 {{sector}} list
hi {{first_name}},

i was pulling together our “Best UK {{sector}} 2026” piece on Tamazia (tamazia.co.uk) and {{company_name}}
kept coming up, so i wanted to include you.

while researching i took a quick look at your site and noticed {{audit_finding}}. nothing urgent, just the
kind of thing that quietly loses enquiries.

the feature comes with a complimentary compliance and SEO audit (normally £1,500) and a backlink from the
piece. worth me sending it over, or not a priority right now?

{{sender_persona}}

---
STEP 2 · Wait 3 days · Subject: re: {{company_name}} in our 2026 list
{{first_name}},

the audit on {{company_name}} is ready: {{audit_url}}

each item names the regulator or the ranking gap behind it, with a 12-week fix. it is yours to keep whether
or not we ever speak. happy to walk you through any of it.

thanks,
{{sender_persona}}

---
STEP 3 · Wait 4 days · Subject: re: {{company_name}} in our 2026 list
{{first_name}},

one more thing the audit flags: competitors are being surfaced ahead of {{company_name}} in AI answers
(ChatGPT, Google’s AI overviews) for your core terms. roughly 60% of searches now end without a click, so
where you sit inside those answers matters more than the blue links did. it is fixable: {{audit_url}}

thanks,
{{sender_persona}}

---
STEP 4 · Wait 5 days · Subject: re: {{company_name}} in our 2026 list
{{first_name}},

quick context on why the feature is worth a look: the piece sits on a DA-87 domain and tends to get cited by
Google, ChatGPT and Perplexity within ~90 days. the backlink alone usually outperforms a paid placement.
{{company_name}} is still on the shortlist and i am happy to hold the spot.

thanks,
{{sender_persona}}

---
STEP 5 · Wait 7 days · Subject: re: {{company_name}} in our 2026 list
{{first_name}},

shifting angle, because most agencies miss this: {{audit_finding}} sits in regulator territory, not just SEO.
our founder, Aman Pareek, read law at King’s College London before moving into search, so we write to that
standard rather than bolting compliance on afterwards. the audit shows where {{company_name}} stands: {{audit_url}}

thanks,
{{sender_persona}}

---
STEP 6 · Wait 9 days · Subject: re: {{company_name}} in our 2026 list
{{first_name}},

to make this easy: no cost and no commitment. i will send the full audit and hold the feature spot; you
decide what, if anything, to do next. just reply “send it” and it is with you the same day.

thanks,
{{sender_persona}}

---
STEP 7 · Wait 12 days · Subject: re: {{company_name}} in our 2026 list
{{first_name}},

i will assume the timing is not right and i will stop here, no more follow-ups. the audit on {{company_name}}
stays live for you either way: {{audit_url}}. if visibility or the compliance side ever moves up the list,
just reply to this thread.

thanks,
{{sender_persona}}

---
FOOTER (append to every step, in PlusVibe's signature/footer setting):
—
Tamazia · tamazia.co.uk
Founder: Aman Pareek, LLM in International Business Law, King’s College London
£110M+ generated for clients · 840% organic traffic growth · 882% peak client revenue growth · 200+ laws reviewed per campaign
C1 Barking Wharf Square, London IG11 7ZQ, United Kingdom
Not relevant? Reply “stop” and I’ll close the file.
