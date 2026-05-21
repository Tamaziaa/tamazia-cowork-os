#!/usr/bin/env python3
"""
Patch n8n W8 (Reply Handler) Classify reply Code node to embed S012 regex classifier.
Maps S012's 13-category output back to W8's legacy 5-state schema so downstream nodes
(Update lead status, Suppress if needed, Notify Aman via Slack) keep working unchanged.

Run from COWORK-OS-EXECUTION/:
  python3 scripts/patch-w8-s012.py
"""
import os
import json
import sys
import urllib.request

N8N_URL = "https://modest-magpie.pikapod.net"
W8_ID = "0KvkXXzlxdIiaRb8"

TOKEN = os.environ.get("N8N_API_KEY")
if not TOKEN:
    # Fallback to TAMAZIA-OS/.env
    here = os.path.dirname(os.path.abspath(__file__))
    candidate = os.path.normpath(os.path.join(here, "..", "..", "TAMAZIA-REBUILD", "TAMAZIA-OS", ".env"))
    if os.path.exists(candidate):
        for line in open(candidate):
            if line.startswith("N8N_API_KEY="):
                TOKEN = line.split("=", 1)[1].strip()
                break
if not TOKEN:
    print("N8N_API_KEY not set", file=sys.stderr)
    sys.exit(1)

NEW_JS = r"""
// S012 reply-intent-classifier · embedded into W8 Reply Handler.
// 13-category regex classifier with deterministic dedupe + W8 legacy mapping.
//
// Inbound payload may include:
//   { lead_id, reply_text, body, from, subject, message_id }
//   Older callers may also pass { reply_type } directly — we honour it as override.
//
// Output (single item) compatible with downstream W8 nodes:
//   { lead_id, reply_type, new_status, should_suppress, suppression_severity,
//     slack_msg, classifier_category, classifier_confidence, classifier_version,
//     escalate_to_aman, escalate_to_danish }

const RULES = [
  { cat:'UNSUBSCRIBE',         conf:0.95, ps:[/\bunsubscribe\b/i,/\bopt[- ]out\b/i,/please remove me/i,/stop email/i,/take me off/i,/remove (me )?from (your |the )?(list|mailing)/i,/\breply STOP\b/i] },
  { cat:'LEGAL_THREAT',        conf:0.92, ps:[/legal action/i,/our (lawyer|solicitor|counsel)/i,/cease and desist/i,/\bICO complaint\b/i,/breach of (GDPR|the GDPR|UK GDPR|PECR)/i,/\bsue\b/i,/injunction/i] },
  { cat:'OOO',                 conf:0.95, ps:[/^auto[- ]?reply/im,/out of (the )?office/i,/\bI am (currently )?out of office\b/i,/\bI'm (currently )?out of office\b/i,/annual leave/i,/\bon (parental|maternity|paternity) leave\b/i,/\bauto-?responder\b/i,/\bAUTO[: ]/i] },
  { cat:'HOSTILE',             conf:0.88, ps:[/fuck off/i,/piss off/i,/\bspam\b/i,/you are (a )?scam/i,/how dare you/i,/never (contact|email) me again/i,/report you to the ICO/i,/\bharass(ing|ment)\b/i] },
  { cat:'HOT_BOOK',            conf:0.9,  ps:[/book (a |the )?(call|meeting|slot|discovery)/i,/happy to (chat|talk|hop on)/i,/set up (a )?call/i,/grab (a )?(slot|time|coffee)/i,/\bschedule (a )?(call|meeting)\b/i,/send me a (link|calendly)/i,/can we (have|set up|arrange) (a )?call/i,/let'?s (jump on|hop on|set up) a/i] },
  { cat:'OBJECTION_BUDGET',    conf:0.88, ps:[/\bno budget\b/i,/tight on budget/i,/not in (the )?budget/i,/can'?t afford/i,/cannot afford/i,/too expensive/i,/\boverpriced\b/i,/\bcost prohibitive\b/i,/cost[- ]prohibitive/i,/out of (our )?(budget|price range)/i] },
  { cat:'HOT_PRICE',           conf:0.88, ps:[/how much/i,/what (does it|do you) cost/i,/\bpricing\b/i,/\bprice\b/i,/retainer (fee|cost|price|tiers)/i,/monthly (fee|cost|price|retainer)/i,/\bcost monthly\b/i,/how (much|expensive) is/i,/what'?s the budget for/i,/what is the budget for/i,/share (the )?pricing/i,/pricing details/i] },
  { cat:'REDIRECT',            conf:0.85, ps:[/please (talk|speak) to ([A-Z][a-z]+)/i,/\bcc[- ]?ing\b/i,/\bcopying (in )?([A-Z][a-z]+)/i,/([A-Z][a-z]+) handles (this|that|marketing|digital|SEO)/i,/\breach out to ([A-Z][a-z]+)/i,/\btry ([A-Z][a-z]+ [A-Z][a-z]+)/i] },
  { cat:'WARM_TIMING',         conf:0.85, ps:[/circle back/i,/\bnot (right )?now\b/i,/come back in (a few )?(weeks|months)/i,/follow up in/i,/\bQ[1-4]\b/i,/next quarter/i,/after (the )?(launch|summer|christmas|easter|year[- ]end)/i,/\btoo busy (at the moment|right now)/i] },
  { cat:'OBJECTION_INCUMBENT', conf:0.85, ps:[/already (work|working) with/i,/\bexisting agency\b/i,/current (SEO )?(agency|partner|provider)/i,/have an? (in-house|inhouse) team/i,/in[- ]?house team (manages|handles|covers|owns|runs)/i,/(in[- ]?house|inhouse) team/i,/happy with our (current|present) (provider|agency|setup)/i] },
  { cat:'OBJECTION_FIT',       conf:0.82, ps:[/not (a )?(good )?fit/i,/not relevant/i,/wrong (company|person|department)/i,/\bnot interested\b/i,/do not need/i,/don'?t need/i,/\bnot for us\b/i,/no thank you/i] },
  { cat:'WARM_INFO',           conf:0.82, ps:[/can you (share|send) (more|some) (info|details|information)/i,/more (info|information|details) please/i,/tell me more/i,/what does the (scan|audit) (include|cover)/i,/how does (this|it) work/i,/walk me through/i,/(case|reference) studies?/i] },
  { cat:'NURTURE',             conf:0.7,  ps:[/keep me (in mind|posted|in the loop)/i,/\bthanks for reaching out\b/i,/interesting/i,/noted/i] },
];

function classify(text) {
  const t = String(text || '');
  for (const r of RULES) {
    for (const p of r.ps) {
      const m = t.match(p);
      if (m) return { category: r.cat, confidence: r.conf, reasoning: 'regex: ' + m[0] };
    }
  }
  return { category: 'UNCLASSIFIED', confidence: 0, reasoning: 'no_match' };
}

const b = $input.first().json.body || $input.first().json;
const lead_id = Number(b.lead_id || 0);
const reply_text = b.reply_text || b.body_text || b.text || b.body || b.notes || '';
const explicit  = String(b.reply_type || '').toLowerCase();
const result = classify(reply_text);

// Map 13-category S012 output to W8's legacy 5-state schema.
const CAT_TO_LEGACY = {
  HOT_BOOK:'positive', HOT_PRICE:'positive', WARM_INFO:'positive', WARM_TIMING:'positive', NURTURE:'positive',
  OBJECTION_BUDGET:'objection', OBJECTION_INCUMBENT:'objection', OBJECTION_FIT:'objection', REDIRECT:'objection',
  UNSUBSCRIBE:'unsubscribe',
  HOSTILE:'objection', LEGAL_THREAT:'objection',
  OOO:'unknown',
  UNCLASSIFIED:'unknown',
};

const rt = explicit && ['positive','objection','unsubscribe','bounce','unknown'].includes(explicit)
  ? explicit
  : CAT_TO_LEGACY[result.category] || 'unknown';

const STATUS = {positive:'replied_positive', objection:'replied_objection', unsubscribe:'unsubscribed', bounce:'bounced', unknown:'replied_unknown'};
const new_status = STATUS[rt] || 'replied_unknown';
const should_suppress = ['unsubscribe','bounce'].includes(rt) || result.category === 'LEGAL_THREAT';
const ssev = rt === 'bounce' ? 'HARD_BOUNCE' : result.category === 'LEGAL_THREAT' ? 'LEGAL_THREAT' : 'UNSUBSCRIBED';
const escalate_to_aman = ['HOSTILE','LEGAL_THREAT','HOT_BOOK','HOT_PRICE'].includes(result.category);
const escalate_to_danish = result.category === 'LEGAL_THREAT';

const icons = {positive:'🔥', objection:'⚠️', unsubscribe:'🔕', bounce:'💀', unknown:'📩'};
const urgency = escalate_to_aman ? '*ACTION REQUIRED* · ' : '';
const slack_msg = `${icons[rt] || '📩'} ${urgency}*S012:* \`${result.category}\` (conf ${result.confidence.toFixed(2)}) · Lead #${lead_id} · status → \`${new_status}\`${should_suppress ? '\n• Adding to suppression list (' + ssev + ')' : ''}${escalate_to_danish ? '\n• Routed to Danish (CLO)' : ''}`;

return [{
  json: {
    lead_id,
    reply_type: rt,
    new_status,
    should_suppress,
    suppression_severity: ssev,
    slack_msg,
    classifier_category: result.category,
    classifier_confidence: result.confidence,
    classifier_version: 's012-w8-embed-v1.0.0',
    escalate_to_aman,
    escalate_to_danish,
    raw_reply_excerpt: String(reply_text).slice(0, 500),
  },
}];
"""

req = urllib.request.Request(
    f"{N8N_URL}/api/v1/workflows/{W8_ID}",
    headers={"X-N8N-API-KEY": TOKEN, "Accept": "application/json"},
)
with urllib.request.urlopen(req, timeout=30) as r:
    w = json.load(r)

found = False
for node in w["nodes"]:
    if "Classify" in node.get("name", ""):
        node.setdefault("parameters", {})["jsCode"] = NEW_JS
        found = True
        break

if not found:
    print("No Classify node found in W8", file=sys.stderr)
    sys.exit(2)

# n8n's PUT requires a subset of keys — strip the read-only ones.
payload = {k: w[k] for k in ("name", "nodes", "connections", "settings") if k in w}
# Strip readonly fields that some n8n versions reject
payload.setdefault("settings", {})

data = json.dumps(payload).encode()
req2 = urllib.request.Request(
    f"{N8N_URL}/api/v1/workflows/{W8_ID}",
    data=data,
    headers={"X-N8N-API-KEY": TOKEN, "Content-Type": "application/json"},
    method="PUT",
)
try:
    with urllib.request.urlopen(req2, timeout=30) as r:
        body = r.read().decode()
        print("PUT W8 ok, status", r.status)
except urllib.error.HTTPError as e:
    print("PUT W8 failed:", e.code, e.read().decode()[:400])
    sys.exit(3)
