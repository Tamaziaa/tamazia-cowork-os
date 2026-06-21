'use strict';
// ============================================================================================================
// LLM-RESCUE — the GENERATION-FIRST worker. (LLM-QA-DESIGN.md north star, ENGINE-FUNCTION-MAP-V4.md Part C.)
// ============================================================================================================
// Qualification is the bottleneck (not sourcing/sending). MOST Tier-2 leads in priority sectors ALREADY clear the
// score floor (≥62) — they fail the deterministic `tier1Contact` requirement only because a single PUBLIC signal is
// missing: a LinkedIn URL, a named decision-maker, a clean own-domain email, or a sector. This worker FINDS that
// missing public signal, re-runs the CANONICAL deterministic gate (scoreLead/decideTier) WITH the found data, and —
// only if the gate now PASSES Tier-1 on its own — proposes a promotion. It writes ADVISORY columns only.
//
// HARD BOUNDARIES (enforced in code, never bypassed):
//   • The DETERMINISTIC gate keeps the final say. The LLM PROPOSES; promotion needs EITHER the same scoreLead()
//     re-tiering to 1 WITH the found data (auto-promote, high confidence), OR a human Accept. We re-tier with the
//     EXACT canonical scorer (not a reconstruction) so the gate can never be "relaxed" by this layer.
//   • Net Tier-1 only goes UP: rescue ADDS. This worker NEVER writes icp_tier / quality_fit / lifecycle / send
//     state, and NEVER demotes. (Fact-check lives in llm-factcheck.js and only flags for human review.)
//   • The consent/entity (PECR) gate is NEVER touched: consent_required leads are EXCLUDED from every wave.
//   • LinkedIn is found via SERP TITLES ONLY (SearXNG/Brave/DDG result url+title for `site:linkedin.com/in …`).
//     linkedin.com is NEVER fetched. This reuses the existing compliant free-serp path.
//   • £0: free models first via the llm/router (Cloudflare→Groq→Gemini free), an AGENCY-OWNED daily budget +
//     an optional per-run cost cap + llm_cost_ledger + a KILL SWITCH (env LLM_QA_ENABLED). Default OFF so a cycle
//     won't run it until enabled. Budget is exhausted -> the wave EARLY-EXITS (no wasted SERP, no misleading rows).
//   • Strict-JSON LLM output, validated; on mismatch we fall back to the deterministic finder result (never a guess).
//
// Writes (advisory): qa_found(jsonb) qa_suggested_tier qa_reason qa_confidence qa_model qa_checked_at qa_status,
//   and review_status='unreviewed' for the medium-confidence (human-review) rescues. AUTO-PROMOTE candidates are
//   marked qa_status='rescued' + review_status='auto_promote' for apply-review.js to action (it re-checks the gate).
//
// Usage:
//   LLM_QA_ENABLED=1 node scripts/run-llm-rescue.js --max 15 [--cohort NAME] [--dry] [--force] [--run-cost-cap-micro N]
//   (this lib is require()d by that thin CLI; see run-llm-rescue.js)
//   (the old --token-cap flag was phantom — never parsed, never enforced — and has been removed; the real per-run
//    ceiling is --run-cost-cap-micro / LLM_QA_RUN_COST_CAP_MICRO, on top of the agency daily budget.)
// ============================================================================================================

const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..', '..');

// --- house deps (reuse existing finders/classifiers; do NOT reinvent) ---
const lq = require(path.join(ROOT, 'src', 'lib', 'enrich', 'lead-quality.js'));          // scoreLead, decideTier
const router = require(path.join(ROOT, 'src', 'lib', 'llm', 'router.js'));                // free-first LLM + ledger + budget
const freeSerp = require(path.join(ROOT, 'src', 'lib', 'scraping', 'free-serp.js'));      // SearXNG/Brave/DDG (titles only)
const findEmail = require(path.join(ROOT, 'src', 'lib', 'sourcing', 'find-every-email.js')); // pattern + MX + SMTP
let freeVerify = null; try { freeVerify = require(path.join(ROOT, 'src', 'lib', 'enrich', 'free-verify.js')); } catch (_e) {}
let ch = null; try { ch = require(path.join(ROOT, 'src', 'lib', 'sourcing', 'companies-house.js')); } catch (_e) {}

const NEON = () => process.env.NEON_URL || process.env.NEON_CONNECTION_STRING;
function pg(sql) { return execFileSync(path.join(ROOT, 'scripts', 'psql'), [NEON(), '-tA', '-c', sql], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }).toString(); }
function pgJson(sql) { return execFileSync(path.join(ROOT, 'scripts', 'psql'), [NEON(), '-tA', '-c', sql], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }).toString(); }
const esc = (v) => (v === null || v === undefined) ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`;
const jesc = (o) => `'${JSON.stringify(o).replace(/'/g, "''")}'::jsonb`;

// KILL SWITCH — default OFF so a scheduled cycle never runs this until the founder/cron enables it explicitly.
function isEnabled() { return /^(1|true|yes|on)$/i.test(String(process.env.LLM_QA_ENABLED || '')); }

// ------------------------------------------------------------------------------------------------------------
// L14 — AGENCY LLM BUDGET (its OWN bucket, decoupled from the AUDIT ENGINE). The llm/router enforces a daily cap
// against scanner_budget_state, which is part of the OFF-LIMITS audit-engine `scanner_*` family — so the audit
// engine and the agency rescue layer would starve each other's LLM. We keep a SEPARATE, additive table
// `agency_llm_budget_state` (same shape: workspace_id, bucket_day, spent_usd_micro, daily_cap_usd_micro) that ONLY
// the agency layer reads/writes. We NEVER read or write the audit engine's scanner_budget_state. The table is
// self-provisioned lazily (CREATE TABLE IF NOT EXISTS) on first use — and the whole wave is OFF by default
// (LLM_QA_ENABLED), so this touches Neon only once the founder/cron enables the layer. Daily cap is env-tunable.
const AGENCY_LLM_DAILY_CAP_MICRO = Number(process.env.LLM_QA_DAILY_CAP_MICRO || 5000000); // default $5.00/day, agency-owned (raised from $0.50 — free-first routing means actual spend ~$0 on most waves)
let _agencyBudgetReady = false;
function _ensureAgencyBudget() {
  if (_agencyBudgetReady) return;
  try {
    pg(`CREATE TABLE IF NOT EXISTS agency_llm_budget_state (
        id bigserial PRIMARY KEY, workspace_id integer NOT NULL DEFAULT 1, bucket_day date NOT NULL DEFAULT CURRENT_DATE,
        spent_usd_micro integer NOT NULL DEFAULT 0, daily_cap_usd_micro integer NOT NULL DEFAULT ${Math.max(0, AGENCY_LLM_DAILY_CAP_MICRO)},
        UNIQUE (workspace_id, bucket_day))`);
    _agencyBudgetReady = true;
  } catch (_e) { /* if DDL is not permitted, remaining()=null below -> the router's own cap still applies */ }
}
// micro-USD remaining in the agency bucket today; null = unknown/uninitialised (caller treats null as "no agency cap").
function agencyBudgetRemaining() {
  _ensureAgencyBudget();
  try {
    let raw = pg(`SELECT (daily_cap_usd_micro - spent_usd_micro) FROM agency_llm_budget_state WHERE workspace_id=1 AND bucket_day=CURRENT_DATE`).trim();
    if (raw === '') { pg(`INSERT INTO agency_llm_budget_state (workspace_id, bucket_day, daily_cap_usd_micro) VALUES (1, CURRENT_DATE, ${Math.max(0, AGENCY_LLM_DAILY_CAP_MICRO)}) ON CONFLICT (workspace_id, bucket_day) DO NOTHING`); raw = String(AGENCY_LLM_DAILY_CAP_MICRO); }
    const n = Number(raw); return Number.isFinite(n) ? n : null;
  } catch (_e) { return null; }
}
function agencyBudgetBump(costMicro) {
  if (!costMicro || costMicro <= 0) return;
  _ensureAgencyBudget();
  try {
    pg(`INSERT INTO agency_llm_budget_state (workspace_id, bucket_day, spent_usd_micro, daily_cap_usd_micro)
        VALUES (1, CURRENT_DATE, ${Math.round(costMicro)}, ${Math.max(0, AGENCY_LLM_DAILY_CAP_MICRO)})
        ON CONFLICT (workspace_id, bucket_day) DO UPDATE SET spent_usd_micro = agency_llm_budget_state.spent_usd_micro + ${Math.round(costMicro)}`);
  } catch (_e) {}
}

// ------------------------------------------------------------------------------------------------------------
// WAVE COHORTS — ordered by ENGINE-FUNCTION-MAP-V4 Part-C highest yield. Each is a SQL predicate over the live
// non-Tier-1 priority-sector pool. We scope to icp_tier IN (2,3) / unscored, exclude consent_required (PECR), and
// exclude leads already rescued this run (qa_checked_at fresh) so waves don't re-burn LLM calls on the same lead.
// "Only re-run on lead change" (design guardrail): we skip leads checked within RECHECK_HOURS unless --force.
// ------------------------------------------------------------------------------------------------------------
const TIER1_MIN = lq.TIER1_MIN || 62;
// LinkedIn can live in EITHER contact_linkedin OR all_socials->linkedin (the enricher writes the latter). The
// deterministic gate's hasLinkedin reads both, so the cohort predicates must check both — otherwise we burn LLM
// calls "finding" a LinkedIn that is already present in socials (the eval surfaced exactly this). NO_LI = true when
// neither carries a linkedin.com URL.
const NO_LI = `COALESCE(contact_linkedin,'') = '' AND COALESCE(all_socials->'linkedin'->>'url', all_socials->>'linkedin', '') = ''`;
const HAS_LI = `(COALESCE(contact_linkedin,'') <> '' OR COALESCE(all_socials->'linkedin'->>'url', all_socials->>'linkedin', '') <> '')`;
const COHORT_SQL = {
  // 1. highest yield: score-cleared, has named DM + email, MISSING ONLY linkedin (~935; ~80% findable).
  missing_linkedin: `icp_tier=2 AND COALESCE(quality_score,0) >= ${TIER1_MIN}
      AND COALESCE(contact_name,'') <> '' AND COALESCE(NULLIF(contact_email,''), primary_email, '') <> ''
      AND ${NO_LI} AND COALESCE(sector_code,'') <> ''`,
  // 2. score-cleared, has email + linkedin, MISSING the named DM (~799).
  missing_dm: `icp_tier=2 AND COALESCE(quality_score,0) >= ${TIER1_MIN}
      AND COALESCE(contact_name,'') = '' AND COALESCE(NULLIF(contact_email,''), primary_email, '') <> ''
      AND ${HAS_LI} AND COALESCE(sector_code,'') <> ''`,
  // 3. score-cleared, has email, MISSING BOTH dm-name AND linkedin (~938; two finds).
  missing_both: `icp_tier=2 AND COALESCE(quality_score,0) >= ${TIER1_MIN}
      AND COALESCE(contact_name,'') = '' AND COALESCE(NULLIF(contact_email,''), primary_email, '') <> ''
      AND ${NO_LI} AND COALESCE(sector_code,'') <> ''`,
  // 4. NULL sector_code (cannot be priority) — classify, then the re-tier decides (~2,464).
  classify_sector: `(COALESCE(sector_code,'') = '') AND COALESCE(icp_tier,2) IN (2,3)`,
  // 5. score-cleared priority, NO email at all — discover a deliverable own-domain DM email (~1,510; lower hit).
  missing_email: `icp_tier=2 AND COALESCE(quality_score,0) >= ${TIER1_MIN}
      AND COALESCE(NULLIF(contact_email,''), primary_email, '') = '' AND COALESCE(sector_code,'') <> ''`,
};
const COHORT_ORDER = ['missing_linkedin', 'missing_dm', 'missing_both', 'classify_sector', 'missing_email'];

// ------------------------------------------------------------------------------------------------------------
// Helpers to read a persisted lead row (it is a to_jsonb(l) object) the way scoreLead expects.
// ------------------------------------------------------------------------------------------------------------
const asObj = (v) => { if (v && typeof v === 'object' && !Array.isArray(v)) return v; try { const p = v ? JSON.parse(v) : {}; return (p && typeof p === 'object') ? p : {}; } catch (_e) { return {}; } };
function nameParts(full) {
  const t = String(full || '').trim().replace(/\s+/g, ' ');
  if (!t) return { first: '', last: '' };
  const parts = t.split(' ');
  return { first: parts[0] || '', last: parts.length > 1 ? parts[parts.length - 1] : '' };
}
// Is a stored contact_name actually an individual PERSON (not a role/company/software/listicle string)? The eval
// surfaced junk DM names ("Open Dental", "Grand Central", "Construction Inquiries", "Pricing Plans") that, left
// unchecked, coincidentally token-matched a LinkedIn slug and drove a WRONG high-confidence auto-promote. A rescue
// that keys on a found DM↔LinkedIn match must first trust the DM is a person — else the find is meaningless. This
// is the same shape as the fact-check's person test (kept local so the rescue is self-contained). 2+ tokens, no
// role/company words, no digits, not all-caps acronym.
const _NONPERSON = /(team|office|reception|enquir|admin|support|info|sales|marketing|\bhr\b|department|secretary|public relations|customer|service|desk|clinic|practice|partners|associates|chambers|group|\bltd\b|limited|llp|plc|inc\b|company|\bco\b|central|station|dental|medical|aesthetic|construction|pricing|plans|enquiries|software|systems|solutions|management|advisory|capital|holdings|consulting|estate|agents|clinics?)/i;
function looksLikePerson(name) {
  const n = String(name || '').trim();
  if (!n) return false;
  const toks = n.split(/\s+/);
  if (toks.length < 2 || toks.length > 5) return false;        // a person is 2-5 name tokens
  if (/\d/.test(n)) return false;                               // no digits
  if (_NONPERSON.test(n)) return false;                         // role/company/software words
  if (n === n.toUpperCase() && n.length > 4) return false;      // ALL-CAPS = acronym/brand
  return true;
}
function jurisdictionOf(lead) {
  const j = String(lead.jurisdiction || lead.country || '').trim().toUpperCase();
  if (/GB|UK|UNITED KINGDOM|ENGLAND|WALES|SCOTLAND/.test(j)) return 'UK';
  if (/AE|UAE|EMIRATES|DUBAI|ABU DHABI/.test(j)) return 'UAE';
  if (/US|USA|UNITED STATES/.test(j)) return 'US';
  if (String(lead.domain || '').endsWith('.uk')) return 'UK';
  if (String(lead.domain || '').endsWith('.ae')) return 'UAE';
  return 'UK';
}

// Re-tier a lead with the CANONICAL deterministic gate, against the score it was ALREADY tiered on PLUS the found
// signal. We fold the found data into a COPY of the lead, derive decideTier's inputs from the PERSISTED columns via
// lq.tierInputsFromPersisted() (NOT a live re-fetch — a fresh scoreLead() re-derives total_score from the current
// page, which diverges from the stored score the lead was qualified on, so it is the wrong re-tier mechanism for
// rescue), then call the PURE lq.decideTier(). This isolates the rescue variable: it answers "does the existing
// lead, with ONLY this missing piece added, now pass the same gate?" The gate keeps the final say — we never relax
// it; we only supply the public signal it was waiting on. Returns the decideTier verdict {tier, tier_reason}.
async function retierWith(lead, found) {
  const copy = JSON.parse(JSON.stringify(lead || {}));
  // fold a found LinkedIn URL into all_socials.linkedin (tierInputsFromPersisted's hasLinkedin reads
  // socials.linkedin {url} OR contact_linkedin). Mirror onto contact_linkedin too.
  if (found && found.linkedin_url) {
    const socials = asObj(copy.all_socials); socials.linkedin = { url: found.linkedin_url }; copy.all_socials = socials;
    copy.contact_linkedin = found.linkedin_url;
  }
  // fold a found named DM (name + role) into the fields decideTier reads for namedDMRole. A found DM only counts
  // toward Tier-1 once there is a clean own-domain email for them; raising the confidence makes hasNamed true.
  if (found && found.dm_name) {
    copy.contact_name = found.dm_name; copy.decision_maker_name = found.dm_name;
    if (found.dm_role) { copy.contact_title = found.dm_role; copy.decision_maker_title = found.dm_role; }
    copy.decision_maker_confidence = Math.max(Number(copy.decision_maker_confidence || 0), 60);
    copy.contact_confidence = Math.max(Number(copy.contact_confidence || 0), 60);
  }
  if (found && found.email) {
    copy.primary_email = found.email; copy.contact_email = found.email;
    copy.decision_maker_confidence = Math.max(Number(copy.decision_maker_confidence || 0), 60);
    // a free MX/SMTP-verified found email clears catchAllUnverified; an unverified pattern guess does NOT.
    if (found.email_verified) { copy.email_verified = true; copy.deliverability = 'good'; }
  }
  if (found && found.sector_code) {
    // a confident sector classification is folded onto BOTH sector_code (primary grid lookup) and the legacy hint
    // (lead.sector, the HINT_TO_CODE fallback) so it can lift the lead into the priority gate.
    copy.sector = found.sector_code; copy.sector_code = found.sector_code;
  }
  try { const inputs = await lq.tierInputsFromPersisted(copy); return Object.assign({ inputs }, lq.decideTier(inputs)); }
  catch (e) { return { tier: 99, error: e.message }; }
}

// ------------------------------------------------------------------------------------------------------------
// LLM helpers (strict JSON via the free-first router). Each returns a validated object or null (never a guess).
// ------------------------------------------------------------------------------------------------------------
function parseStrictJson(text) {
  if (!text) return null;
  let t = String(text).trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  // grab the first {...} block if the model wrapped it in prose
  const m = t.match(/\{[\s\S]*\}/); if (m) t = m[0];
  try { return JSON.parse(t); } catch (_e) { return null; }
}
async function llmJson({ system, prompt, role = 'classify', max_tokens = 400, lead_id, costRef }) {
  const r = await router.run({ system, prompt, role, json: true, max_tokens, temperature: 0, lead_id });
  // L4: surface the router's budget-exhausted verdict (free quota + paid daily cap both gone) so the wave can stop.
  if (costRef && r && r.error === 'budget_exhausted_for_today') costRef.budgetExhausted = true;
  if (!r || !r.ok) return { ok: false, error: (r && r.error) || 'llm_unavailable', cost_usd_micro: (r && r.cost_usd_micro) || 0, model: r && (r.provider + '/' + r.model) };
  let obj = parseStrictJson(r.text);
  if (!obj) { // one retry, terser instruction
    const r2 = await router.run({ system: system + ' Return ONLY minified JSON, no prose, no code fence.', prompt, role, json: true, max_tokens, temperature: 0, lead_id });
    if (r2 && r2.ok) obj = parseStrictJson(r2.text);
    return { ok: !!obj, obj, error: obj ? null : 'json_parse_failed', cost_usd_micro: (r.cost_usd_micro || 0) + ((r2 && r2.cost_usd_micro) || 0), model: (r2 && r2.ok) ? (r2.provider + '/' + r2.model) : (r.provider + '/' + r.model) };
  }
  return { ok: true, obj, error: null, cost_usd_micro: r.cost_usd_micro || 0, model: r.provider + '/' + r.model };
}

// Decode HTML entities + strip a trailing listicle/marketing tail from a company string so the SERP query is clean
// (the eval surfaced '&amp;' breaking the query, and listicle titles like 'Best Dental Clinic in Dubai' returning
// nothing). Keeps the leading brandable tokens; never fabricates.
function cleanCompanyForQuery(company) {
  let c = String(company || '')
    .replace(/&amp;/gi, '&').replace(/&#0?38;/g, '&').replace(/&quot;/gi, '"').replace(/&#0?39;|&apos;/gi, "'").replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ').trim();
  // drop a leading SEO prefix ('Home - ', 'Welcome to ') and a trailing pipe/dash tagline.
  c = c.replace(/^(home|welcome to|home page|homepage)\s*[-|:–]\s*/i, '').split(/\s*[|]\s*/)[0].trim();
  return c;
}
// Build a human-readable label from a linkedin /in/ or /company/ URL slug when the SERP gives no title (Apify's
// Google parser returns title-less rows). 'charles-burns-30883825' -> 'charles burns'. Lets the LLM + the
// deterministic surname check still work off the URL — we read the URL the SERP already returned, never fetch it.
function labelFromLinkedinUrl(url) {
  const m = String(url || '').match(/linkedin\.com\/(?:in|company)\/([^\/?#]+)/i);
  if (!m) return '';
  return decodeURIComponent(m[1]).replace(/-?\d+[a-z0-9]*$/i, '').replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
}

// LINKEDIN via SERP TITLES + URL SLUGS ONLY. The LLM forms the query + DISAMBIGUATES which result is the right
// person; linkedin.com is NEVER fetched. We hand the model the SERP result list (title OR url-slug label + url) and
// ask it to pick the single best linkedin.com/in or /company URL for THIS firm + person, with a confidence.
async function findLinkedinViaSerp({ company, dm_name, dm_role, domain, jurisdiction }, costRef) {
  const { first, last } = nameParts(dm_name);
  const coClean = cleanCompanyForQuery(company);
  // query forms the existing compliant finder uses: site-restricted to linkedin.com profiles/company pages.
  const q = dm_name
    ? `site:linkedin.com/in ${dm_name} ${coClean || ''} ${dm_role || ''}`.trim()
    : `site:linkedin.com/company ${coClean || ''} ${(domain || '').replace(/^www\./, '')}`.trim();
  let serp = null;
  try { serp = await freeSerp.search(q, jurisdiction || 'UK', 12); } catch (_e) {}
  const organic = (serp && serp.organic) || [];
  // keep only linkedin.com result URLs (titles + url-slug labels read, page never fetched). When a row has no
  // title (Apify Google parser), synthesise a label from the URL slug so disambiguation still has signal.
  const liResults = organic.filter(r => /(^|\.)linkedin\.com\/(in|company)\//i.test(String(r.url || ''))).slice(0, 8)
    .map(r => { const title = r.title || ''; return { title: title || labelFromLinkedinUrl(r.url), url: r.url, _fromSlug: !title }; });
  if (!liResults.length) return { found: false, reason: 'no_linkedin_serp_result', provider: serp && serp.provider };

  // DETERMINISTIC name-match per result FIRST (robust to the title-less Apify Google rows the eval surfaced: it
  // returns URLs only, so the URL SLUG carries the signal). Mirrors the existing compliant linkedin-finder scoring:
  // surname (whole-word/slug) is the strongest signal, then first name, then a company token. We read the title +
  // the URL slug the SERP already returned — linkedin.com is never fetched. A high deterministic score (clear
  // surname+first match) is trustworthy on its own; an ambiguous one is handed to the LLM to disambiguate.
  // PERSON GUARD: a /in/ rescue is only meaningful if the stored DM is actually a person. If it is not (junk like
  // "Open Dental" / "Grand Central"), a slug token-match is coincidental — never treat it as a confident find. We
  // still let the LLM look (it may find the company page), but the deterministic surname fast-path is disabled and
  // any result is capped to human-review confidence. This is the eval's key correctness fix.
  const dmIsPerson = !!dm_name && looksLikePerson(dm_name);
  const tok = (s) => String(s || '').toLowerCase();
  const inText = (hay, needle) => needle && needle.length >= 3 && new RegExp('(?:^|[^a-z0-9])' + needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?:[^a-z0-9]|$)', 'i').test(hay);
  const coTokens = cleanCompanyForQuery(company).toLowerCase().split(/\s+/).filter(w => w.length >= 4 && !/^(the|and|ltd|llp|clinic|dental|group|practice|associates|partners|aesthetics?|estate|agents?|company|limited)$/.test(w));
  // jurisdiction TLD on the linkedin host (uk./au./zw./www.) — a mismatch (e.g. zw. for a UK firm) is a doubt signal.
  const jcc = ({ UK: 'uk', US: 'us', UAE: 'ae' })[jurisdiction || 'UK'] || '';
  const scored = liResults.map((r) => {
    const hay = tok(r.title + ' ' + r.url);
    const hasLast = dmIsPerson && inText(hay, tok(last));
    let s = 0;
    if (dmIsPerson) { if (hasLast) s += 55; if (inText(hay, tok(first))) s += 30; }
    if (coTokens.some(c => hay.includes(c))) s += 20;
    if (/linkedin\.com\/in\//i.test(r.url)) s += 5;
    // jurisdiction penalty: a foreign-TLD linkedin host (other than the neutral www./global) for a UK/UAE firm.
    const hostCc = (String(r.url).match(/https?:\/\/([a-z]{2})\.linkedin\.com/i) || [, ''])[1].toLowerCase();
    if (jcc && hostCc && hostCc !== jcc && hostCc !== 'www') s -= 20;
    return { ...r, _score: s, _hasLast: hasLast };
  }).sort((a, b) => b._score - a._score);
  const top = scored[0];
  const secondScore = scored[1] ? scored[1]._score : 0;

  // STRONG deterministic match: requires the DM be a PERSON, the SURNAME specifically present (a company-token or
  // first-name-only match is NOT enough), and a clear lead over the runner-up. Trust it WITHOUT an LLM call.
  if (dmIsPerson && top._hasLast && top._score >= 85 && top._score - secondScore >= 25) {
    return { found: true, linkedin_url: top.url, confidence: Math.min(90, top._score), model: 'serp_slug_match', reason: 'deterministic surname match in result (person verified, jurisdiction ok)', provider: serp && serp.provider };
  }

  // Otherwise LLM disambiguation (cheap classify) over the scored candidates. Strict JSON. The prompt FORCES a low
  // score on a weak match (the eval showed an 8B model otherwise returns 80 while its own reasoning notes a
  // mismatch). A deterministic sanity cap backstops the model's calibration below.
  const sys = 'You match a UK/UAE business to its correct LinkedIn URL using ONLY the supplied result labels and URLs (a label may be derived from the URL slug, e.g. "charles-burns-123" -> "charles burns"). You never invent a URL. Be STRICT: if the person\'s surname does not clearly appear in the chosen label or URL, the match is weak -> LOW confidence (<50). Return strict JSON only.';
  const prompt = `Company: ${company || '(unknown)'}\nWebsite: ${domain || '(unknown)'}\nPerson: ${dm_name || '(company page wanted)'}${dm_role ? ' — ' + dm_role : ''}\n\nResults (label | url):\n${scored.map((r, i) => `${i + 1}. ${r.title || '(slug)'} | ${r.url}`).join('\n')}\n\nPick the ONE result that is genuinely this ${dm_name ? 'person (surname must match)' : "company's official page"}. If none clearly matches, choose 0. HIGH (>=75) only on a clear surname match; LOW (<50) if uncertain.\nReturn JSON: {"index": <1-based or 0>, "confidence": <0-100>, "why": "<short>"}`;
  const r = await llmJson({ system: sys, prompt, role: 'classify', max_tokens: 200, costRef });
  if (costRef) costRef.cost += (r.cost_usd_micro || 0);
  if (!r.ok || !r.obj) {
    // LLM unavailable -> fall back to the deterministic top ONLY if the DM is a person AND the surname matched.
    // Capped below the auto-promote bar so a no-LLM result can only ever reach human review.
    if (dmIsPerson && top._hasLast && top._score >= 55) return { found: true, linkedin_url: top.url, confidence: Math.min(50, top._score), model: r.model || 'serp_slug_match', reason: 'deterministic surname match (no LLM)', provider: serp && serp.provider };
    return { found: false, reason: 'no_confident_match_no_llm', model: r.model, provider: serp && serp.provider };
  }
  const idx = Number(r.obj.index || 0);
  if (!idx || idx < 1 || idx > scored.length) return { found: false, reason: 'llm_no_match', model: r.model, provider: serp && serp.provider };
  const chosen = scored[idx - 1];
  let conf = Math.max(0, Math.min(100, Number(r.obj.confidence || 0)));
  // DETERMINISTIC SANITY CAPS (backstop the model's calibration):
  //  - non-person DM (junk contact_name): the find cannot be trusted as a DM↔LinkedIn match -> cap to human review.
  //  - /in/ pick must contain the surname in its label/URL; else cap below the trust band.
  //  - foreign-jurisdiction host (e.g. zw. for a UK firm): a real doubt — cap to human review even if the name matches.
  const ct = tok(chosen.title + ' ' + chosen.url);
  const chosenHostCc = (String(chosen.url).match(/https?:\/\/([a-z]{2})\.linkedin\.com/i) || [, ''])[1].toLowerCase();
  const foreignHost = !!(jcc && chosenHostCc && chosenHostCc !== jcc && chosenHostCc !== 'www');
  if (!dmIsPerson) conf = Math.min(conf, 40);
  if (dmIsPerson) { const ls = tok(last); if (ls && ls.length >= 3 && !ct.includes(ls)) conf = Math.min(conf, 45); }
  if (chosen._score < 55) conf = Math.min(conf, 45);                              // weak deterministic support -> human review
  if (foreignHost) conf = Math.min(conf, 45);                                     // jurisdiction mismatch -> human review
  if (dmIsPerson && chosen._hasLast && !foreignHost && chosen._score >= 85) conf = Math.max(conf, Math.min(90, chosen._score)); // strong signal lifts a timid model
  return { found: true, linkedin_url: chosen.url, confidence: conf, model: r.model, reason: (r.obj.why || 'serp slug/title match') + (foreignHost ? ' [foreign-TLD, review]' : ''), provider: serp && serp.provider };
}

// NAMED DECISION-MAKER via the existing right-person sources: Companies-House officers (reg-number path only — the
// compliant, no-cross-bind way) when we have a CH number, else SERP titles disambiguated by the LLM. We map the
// found principal/owner/partner to the lead's existing email.
async function findNamedDM({ company, domain, ch_number, jurisdiction }, costRef) {
  // 1) Companies House officers (only via an EXACT reg number — never name-search; that cross-bind path is removed).
  if (ch_number && ch && ch.getOfficers) {
    let officers = [];
    try { officers = await ch.getOfficers(ch_number); } catch (_e) {}
    const active = (officers || []).filter(o => o && o.name && /(director|partner|llp member|secretary|owner|founder|principal)/i.test(o.role || 'director'));
    if (active.length) {
      // prefer a single clear principal; if several, let the LLM pick the most senior public officer.
      if (active.length === 1) return { found: true, dm_name: active[0].name, dm_role: active[0].role || 'Director', confidence: 80, model: 'companies_house', reason: 'ch_reg_officer' };
      const sys = 'You pick the most senior public decision-maker (owner/founder/managing/director) of a firm from its Companies House officer list. Return strict JSON only.';
      const prompt = `Company: ${company}\nOfficers (name | role):\n${active.slice(0, 12).map((o, i) => `${i + 1}. ${o.name} | ${o.role || 'Director'}`).join('\n')}\nReturn JSON: {"index": <1-based>, "confidence": <0-100>}`;
      const r = await llmJson({ system: sys, prompt, role: 'classify', max_tokens: 120, costRef });
      if (costRef) costRef.cost += (r.cost_usd_micro || 0);
      const idx = r.ok && r.obj ? Number(r.obj.index || 1) : 1;
      const pick = active[(idx >= 1 && idx <= active.length) ? idx - 1 : 0];
      return { found: true, dm_name: pick.name, dm_role: pick.role || 'Director', confidence: r.ok ? Math.min(85, Number(r.obj.confidence || 70)) : 70, model: r.model || 'companies_house', reason: 'ch_reg_officer_llm_pick' };
    }
  }
  // 2) SERP-title fallback: find the principal/owner named on the firm's own site / press, disambiguated by the LLM.
  let serp = null;
  try { serp = await freeSerp.search(`${company || ''} ${(domain || '').replace(/^www\./, '')} founder OR owner OR principal OR "managing director"`.trim(), jurisdiction || 'UK', 10); } catch (_e) {}
  const organic = (serp && serp.organic || []).slice(0, 8).map(r => ({ title: r.title || '', url: r.url, domain: r.domain }));
  if (!organic.length) return { found: false, reason: 'no_dm_signal' };
  const sys = 'You extract the named senior decision-maker (owner/founder/principal/managing partner/director) of a specific firm from search-result titles. Use ONLY the titles; never invent a name. Return strict JSON only.';
  const prompt = `Company: ${company}\nWebsite: ${domain}\nSearch results (title | url):\n${organic.map((r, i) => `${i + 1}. ${r.title} | ${r.url}`).join('\n')}\nIf a clearly-named decision-maker of THIS firm appears, return it. Else none.\nReturn JSON: {"name": "<full name or empty>", "role": "<role or empty>", "confidence": <0-100>}`;
  const r = await llmJson({ system: sys, prompt, role: 'extract', max_tokens: 160, costRef });
  if (costRef) costRef.cost += (r.cost_usd_micro || 0);
  if (!r.ok || !r.obj || !String(r.obj.name || '').trim()) return { found: false, reason: 'llm_no_dm', model: r.model };
  const nm = String(r.obj.name).trim();
  // sanity: a real person name is 2+ tokens, not the company name, not a role word only.
  if (nm.split(/\s+/).length < 2 || (company && nm.toLowerCase() === String(company).toLowerCase())) return { found: false, reason: 'dm_not_personlike', model: r.model };
  return { found: true, dm_name: nm, dm_role: String(r.obj.role || '').trim(), confidence: Math.min(70, Number(r.obj.confidence || 50)), model: r.model, reason: 'serp_title_dm' };
}

// DELIVERABLE DM EMAIL via find-every-email (12 patterns + MX) + free verify. Pattern+MX only when SMTP is blocked
// (Actions/most corporate hosts) — that still yields a deliverable-shaped own-domain address (the gate's clean-email
// path accepts MX-live own-domain without SMTP). We never fabricate: no name + no domain -> nothing.
async function findEmailFor({ dm_name, domain }) {
  const { first, last } = nameParts(dm_name);
  if ((!first && !last) || !domain) return { found: false, reason: 'need_name_and_domain' };
  let res = null;
  try { res = await findEmail.find({ first, last, domain, probe: !!process.env.LLM_QA_SMTP_PROBE }); } catch (_e) {}
  const best = res && res.candidates && res.candidates[0];
  if (!best) return { found: false, reason: 'no_email_pattern' };
  const conf = Math.round((best.confidence || best.confidence_prior || 0) * 100);
  // optional free MX/SMTP verify of the top candidate
  let verified = false;
  if (freeVerify && best.email) { try { const v = await freeVerify.verifyEmail(best.email, { allowUnknown: true }); verified = !!(v && (v.deliverable || v.status === 'valid')); } catch (_e) {} }
  // L2 FIX: a pattern-GUESSED, UNVERIFIED email must never reach the auto-promote confidence bar. find-every-email's
  // top pattern carries confidence_prior up to 1.0 (=> conf up to 100); with SMTP blocked (the default in Actions —
  // LLM_QA_SMTP_PROBE unset) email_verified stays false, so without this cap a clean-shaped guess at a non-catch-all
  // MX-live regulated+established firm could flip tier1Contact and auto-promote a guessed address into the cold path.
  // Cap unverified confidence BELOW AUTO_PROMOTE_MIN_CONF so a guess can only ever reach human review (>=40), never
  // auto-promote. A real MX/SMTP-verified hit (verified=true) is unaffected and still floors at 80.
  const UNVERIFIED_CONF_CAP = Math.max(0, AUTO_PROMOTE_MIN_CONF - 1);   // e.g. 74 when the bar is 75
  const confidence = verified ? Math.max(conf, 80) : Math.min(conf, UNVERIFIED_CONF_CAP);
  return { found: conf >= 40, email: best.email, email_verified: verified, confidence, reason: verified ? 'pattern_mx_verified' : 'pattern_only_unverified_capped', model: 'find-every-email' };
}

// SECTOR CLASSIFY via the LLM over name + any website_intel text. Strict JSON to one of the canonical priority codes.
const PRIORITY_CODES = ['LS', 'HC', 'FS', 'RE', 'PS', 'EC', 'HS', 'AU', 'ED', 'BW']; // legal, healthcare, financial, real-estate, professional, ecommerce, hospitality, automotive, education, beauty-wellness
async function classifySector({ company, domain, website_intel }, costRef) {
  const sys = 'You classify a UK/UAE business into ONE sector code, or "NONE" if it is not in the priority list. Codes: LS=legal/law, HC=healthcare/dental/medical, FS=financial/accounting/insurance, RE=real-estate/property, PS=professional-services/consulting, EC=ecommerce/retail, HS=hospitality/restaurants, AU=automotive, ED=education, BW=beauty/wellness/aesthetics. Use only the supplied text. Return strict JSON only.';
  const text = String(website_intel || '').slice(0, 1200);
  const prompt = `Company: ${company || ''}\nWebsite: ${domain || ''}\nSite text: ${text || '(none)'}\nReturn JSON: {"code": "<one of LS,HC,FS,RE,PS,EC,HS,AU,ED,BW,NONE>", "confidence": <0-100>}`;
  const r = await llmJson({ system: sys, prompt, role: 'classify', max_tokens: 80, costRef });
  if (costRef) costRef.cost += (r.cost_usd_micro || 0);
  if (!r.ok || !r.obj) return { found: false, reason: 'llm_unavailable', model: r.model };
  const code = String(r.obj.code || '').toUpperCase().trim();
  if (!PRIORITY_CODES.includes(code)) return { found: false, reason: 'not_priority_or_none', model: r.model, code };
  return { found: true, sector_code: code, confidence: Math.min(90, Number(r.obj.confidence || 50)), model: r.model, reason: 'llm_sector_classify' };
}

// ------------------------------------------------------------------------------------------------------------
// PER-LEAD RESCUE — determine what's missing, find it, re-tier with the canonical gate, decide auto/human/explain.
// ------------------------------------------------------------------------------------------------------------
const AUTO_PROMOTE_MIN_CONF = Number(process.env.LLM_QA_AUTO_CONF || 75);  // ≥ this AND gate re-passes Tier-1 -> auto
const HUMAN_REVIEW_MIN_CONF = Number(process.env.LLM_QA_REVIEW_CONF || 40); // ≥ this (but below auto, or gate not re-passing) -> human
// L5: a lead that keeps NOT flipping is re-tried a bounded number of times (qa_found.tries), then parked from the
// wave even before it lands 'explained'. Stops never-findable leads re-burning SERP/LLM every recheck window.
const RESCUE_MAX_TRIES = Number(process.env.LLM_QA_MAX_TRIES || 3);

async function rescueLead(lead, cohort) {
  const costRef = { cost: 0 };
  const company = lead.company || lead.legal_name || '';
  const domain = String(lead.domain || '').toLowerCase().replace(/^www\./, '');
  const jurisdiction = jurisdictionOf(lead);
  const ch_number = lead.company_number || lead.reg_number || (asObj(lead.firmographics).company_number) || null;
  const found = {};
  const missing = [];
  let model = null;

  // BASELINE: what does the canonical gate say right now? (no found data) — confirms the real missing pieces.
  const base = await retierWith(lead, {});
  const haveDM = !!String(lead.contact_name || lead.decision_maker_name || '').trim();
  const haveEmail = !!String(lead.contact_email || lead.primary_email || '').trim();
  const _liSocial = asObj(lead.all_socials).linkedin;
  const haveLi = !!String(lead.contact_linkedin || '').trim() || !!(_liSocial && (_liSocial.url || _liSocial));
  const haveSector = !!String(lead.sector_code || '').trim();

  // 0) sector classify first if missing (it gates everything else — an unclassified lead can never be priority).
  if (!haveSector) {
    const s = await classifySector({ company, domain, website_intel: lead.website_intel }, costRef);
    if (s.found) { found.sector_code = s.sector_code; found.sector_confidence = s.confidence; model = s.model; }
    else missing.push('sector');
  }
  // 1) named DM if missing.
  if (!haveDM) {
    const d = await findNamedDM({ company, domain, ch_number, jurisdiction }, costRef);
    if (d.found) { found.dm_name = d.dm_name; found.dm_role = d.dm_role; found.dm_confidence = d.confidence; model = d.model || model; }
    else missing.push('decision_maker');
  }
  // 2) email if missing (use the found or existing DM name).
  if (!haveEmail) {
    const dmName = found.dm_name || lead.contact_name || lead.decision_maker_name || '';
    const e = await findEmailFor({ dm_name: dmName, domain });
    if (e.found) { found.email = e.email; found.email_verified = e.email_verified; found.email_confidence = e.confidence; model = e.model || model; }
    else missing.push('email');
  }
  // 3) linkedin if missing (the single biggest, cheapest win).
  if (!haveLi) {
    const li = await findLinkedinViaSerp({ company, dm_name: found.dm_name || lead.contact_name, dm_role: found.dm_role || lead.contact_title, domain, jurisdiction }, costRef);
    if (li.found) { found.linkedin_url = li.linkedin_url; found.linkedin_confidence = li.confidence; model = li.model || model; }
    else missing.push('linkedin');
  }

  // RE-TIER with the canonical gate using everything found. The gate keeps the final say.
  const after = await retierWith(lead, found);
  const flippedTo1 = after && after.tier === 1 && base.tier !== 1;

  // overall confidence = the MIN confidence of the pieces that actually mattered for the flip (a chain is as strong
  // as its weakest found link). If nothing was found, confidence is 0.
  const confs = [found.linkedin_confidence, found.dm_confidence, found.email_confidence, found.sector_confidence].filter(c => typeof c === 'number');
  const confidence = confs.length ? Math.min(...confs) : 0;

  // Build the one-line reason: what was found / what is still missing.
  const foundBits = [];
  if (found.linkedin_url) foundBits.push('LinkedIn');
  if (found.dm_name) foundBits.push(`DM ${found.dm_name}${found.dm_role ? ' (' + found.dm_role + ')' : ''}`);
  if (found.email) foundBits.push(`email ${found.email}${found.email_verified ? ' (verified)' : ''}`);
  if (found.sector_code) foundBits.push(`sector ${found.sector_code}`);
  let reason;
  let qa_status, review_status = null, suggested_tier = base.tier;
  if ((base && base.error) || (after && after.error)) {
    // L12: a re-tier THREW (e.g. emailGate DNS timeout) — retierWith returns {tier:99,error}. Do NOT fold this into
    // 'explained' (which means "definitively can't be lifted" and is parked from re-processing). Surface a DISTINCT,
    // NON-terminal status so the next wave RETRIES it; never auto-promote/route-to-human on an errored re-tier.
    qa_status = 'retier_error'; suggested_tier = base && base.tier && base.tier !== 99 ? base.tier : null;
    reason = `Re-tier error (transient): ${(after && after.error) || (base && base.error)}. Will retry next wave.`;
  } else if (flippedTo1 && Object.keys(found).length) {
    suggested_tier = 1;
    reason = `Found ${foundBits.join(', ')} → deterministic gate re-passes Tier-1.`;
    if (confidence >= AUTO_PROMOTE_MIN_CONF) { qa_status = 'rescued'; review_status = 'auto_promote'; reason += ' High confidence: auto-promote (gate-verified).'; }
    else { qa_status = 'rescued'; review_status = 'unreviewed'; reason += ` Confidence ${confidence} — human review.`; }
  } else if (Object.keys(found).length && after && after.tier === 2 && base.tier === 3) {
    // partial lift (e.g. classified into a priority sector but still missing a contact) — surface, human review.
    suggested_tier = 2; qa_status = 'rescued'; review_status = 'unreviewed';
    reason = `Found ${foundBits.join(', ')}; now Tier-2 (still missing ${missing.join(', ') || 'a Tier-1 contact'}).`;
  } else {
    // EXPLAIN: nothing flipped — say why it is not Tier-1 + the ONE thing that would change it.
    qa_status = 'explained';
    const needed = missing[0] || (after && after.tier_reason) || 'a Tier-1 contact';
    reason = foundBits.length
      ? `Found ${foundBits.join(', ')} but still not Tier-1 (need ${missing.join(', ') || needed}).`
      : `Not Tier-1: missing ${missing.join(', ') || needed}. Add it and it qualifies.`;
  }

  return {
    lead_id: lead.id, lead_ref: lead.lead_ref, company, cohort,
    base_tier: base.tier, after_tier: after && after.tier, flippedTo1,
    found, missing, confidence, model: model || 'deterministic', reason,
    qa_status, review_status, suggested_tier, cost_usd_micro: costRef.cost,
    budget_exhausted: !!costRef.budgetExhausted,   // L4: router reported free quota + paid daily cap both gone
  };
}

// ------------------------------------------------------------------------------------------------------------
// WRITE the advisory columns for one rescued lead. NEVER touches icp_tier / quality_fit / lifecycle / send state.
// Idempotent. dry=true prints what it WOULD write (used for the eval when the classifier blocks writes).
// ------------------------------------------------------------------------------------------------------------
function writeRescue(res, { dry = false } = {}) {
  // L5: fold a bumped `tries` counter INTO the new qa_found jsonb (reads the prior count off the existing row), so a
  // lead that keeps not flipping increments tries and is parked by the wave's terminalGuard after RESCUE_MAX_TRIES.
  const foundWithTries = `jsonb_set(${jesc(res.found)}, '{tries}', (COALESCE((qa_found->>'tries')::int,0)+1)::text::jsonb, true)`;
  const sets = [
    `qa_found = ${foundWithTries}`,
    `qa_suggested_tier = ${res.suggested_tier == null ? 'NULL' : Number(res.suggested_tier)}`,
    `qa_reason = ${esc(res.reason)}`,
    `qa_confidence = ${res.confidence == null ? 'NULL' : Math.round(res.confidence)}`,
    `qa_model = ${esc(res.model)}`,
    `qa_status = ${esc(res.qa_status)}`,
    `qa_checked_at = NOW()`,
  ];
  // only set review_status when we actually want a human (or auto) action — never clobber an existing human verdict.
  if (res.review_status) sets.push(`review_status = COALESCE(NULLIF(review_status,''), ${esc(res.review_status)})`);
  const sql = `UPDATE leads SET ${sets.join(', ')} WHERE id = ${Number(res.lead_id)}`;
  if (dry) { return { sql, wrote: false }; }
  pg(sql);
  return { sql, wrote: true };
}

// L7: the widest, lowest-yield cohort (classify_sector ~2,464 eligible) gets a per-run SUB-BUDGET so a run that
// doesn't fill `remaining` on the higher-yield cohorts can't pour the entire remainder into sector-classify (the
// lowest-conversion work, re-burnt every recheck window). Tunable via env. 0 -> uncapped.
// Raised 25 -> 60 alongside the 100->250 per-run cap: sector-classify is the CHEAPEST call (one classify,
// max_tokens 80) AND the gate that unlocks every downstream cohort (a NULL-sector lead can never be priority),
// so a modestly larger slice drains the ~2.4k unclassified pool faster while still leaving the bulk of a
// 250-lead run for the higher-yield contact-find cohorts. Still bounded; the cost cap is the hard guard.
const CLASSIFY_SECTOR_SUBCAP = Number(process.env.LLM_QA_CLASSIFY_CAP || 60);

// ------------------------------------------------------------------------------------------------------------
// RUN A WAVE. Cost-capped: per-run lead cap (max) + an optional per-run COST cap (runCostCapMicro) + the agency LLM
// DAILY budget (its own bucket, decoupled from the audit engine — see agencyBudgetRemaining/Bump). Free-first.
// Default OFF (LLM_QA_ENABLED). Early-exits the moment a budget is exhausted so a blown budget never burns SERP
// quota or writes misleading `explained` rows on the rest of the wave (L4). The phantom `--token-cap` flag (never
// parsed / never accepted) was REMOVED; the real per-run ceiling is runCostCapMicro (env LLM_QA_RUN_COST_CAP_MICRO).
// ------------------------------------------------------------------------------------------------------------
async function runWave({ max = 15, cohort = null, dry = false, force = false, recheckHours = 168, runCostCapMicro = 0 } = {}) {
  if (!isEnabled()) {
    return { ok: false, skipped: true, reason: 'LLM_QA_ENABLED is off (kill switch). Set LLM_QA_ENABLED=1 to run.', processed: 0 };
  }
  if (!NEON()) return { ok: false, error: 'no NEON_URL', processed: 0 };
  const cohorts = cohort ? [cohort] : COHORT_ORDER;
  const results = [];
  let remaining = Math.max(1, Number(max) || 15);
  let totalCost = 0;
  let budgetExhausted = false;
  // per-run cost ceiling (micro-USD). CLI/env override; 0 = no per-run cap (the daily agency budget still applies).
  const RUN_COST_CAP = Math.max(0, Number(runCostCapMicro || process.env.LLM_QA_RUN_COST_CAP_MICRO || 0));

  for (const cname of cohorts) {
    if (remaining <= 0 || budgetExhausted) break;
    const pred = COHORT_SQL[cname]; if (!pred) continue;
    // L7: cap how many of the remaining slots the lowest-yield classify_sector cohort may consume this run.
    const cohortLimit = (cname === 'classify_sector' && CLASSIFY_SECTOR_SUBCAP > 0) ? Math.min(remaining, CLASSIFY_SECTOR_SUBCAP) : remaining;
    // exclude PECR consent_required (hard gate), suppressed/dnc, and recently-checked leads (only re-run on change).
    const freshGuard = force ? '' : `AND (qa_checked_at IS NULL OR qa_checked_at < NOW() - INTERVAL '${Math.max(1, recheckHours)} hours')`;
    // L5: TERMINAL STATE. A lead written qa_status='explained' genuinely cannot be lifted with current data; the
    // cohort predicates key on tier/score/contact/sector only, so without this it was re-pulled + re-spent every
    // recheck window forever. Exclude 'explained' (parked until its underlying data changes). 'retier_error' is a
    // TRANSIENT failure and is deliberately NOT excluded (it must retry). A small per-lead tries counter
    // (qa_found->>'tries') caps repeated no-flip churn even before a lead lands 'explained'.
    const terminalGuard = force ? '' : `AND COALESCE(qa_status,'') NOT IN ('explained')
        AND COALESCE((qa_found->>'tries')::int, 0) < ${Math.max(1, RESCUE_MAX_TRIES)}`;
    const sql = `SELECT to_jsonb(l) FROM leads l
      WHERE (${pred})
        AND COALESCE(consent_required, FALSE) = FALSE
        AND COALESCE(status,'') NOT IN ('suppressed','dnc','bounced','duplicate')
        AND COALESCE(domain,'') <> ''
        ${freshGuard}
        ${terminalGuard}
      ORDER BY COALESCE(quality_score,0) DESC NULLS LAST, id DESC
      LIMIT ${cohortLimit}`;
    let raw;
    try { raw = pgJson(sql); } catch (e) { results.push({ cohort: cname, error: e.message }); continue; }
    // L12: parse rows PER-ROW. A single malformed to_jsonb line (NUL byte / a row whose JSON psql truncates at the
    // 256MB buffer) used to throw inside the .map() — OUTSIDE the per-lead try — aborting the WHOLE cohort and losing
    // the rest of that batch. Parse each row in its own try; skip + log a bad row and keep processing the cohort.
    const rows = [];
    for (const s of raw.split('\n')) { if (!s) continue; try { rows.push(JSON.parse(s)); } catch (e) { results.push({ cohort: cname, error: 'malformed_row: ' + e.message }); } }
    if (!rows.length) continue;
    for (const lead of rows) {
      if (remaining <= 0) break;
      // L4/L14: BUDGET KILL — check the agency LLM budget (its OWN bucket, decoupled from the audit engine) BEFORE
      // spending. If the daily agency cap is blown, or this run's cost cap is hit, stop the wave: no more SERP/LLM
      // work, no misleading `explained` writes on the rest. Free quota is tried first inside the router regardless.
      const budgetLeft = dry ? null : agencyBudgetRemaining();
      if ((budgetLeft !== null && budgetLeft <= 0) || (RUN_COST_CAP > 0 && totalCost >= RUN_COST_CAP)) { budgetExhausted = true; results.push({ cohort: cname, budget_exhausted: true }); break; }
      try {
        const res = await rescueLead(lead, cname);
        totalCost += res.cost_usd_micro || 0;
        if (!dry) agencyBudgetBump(res.cost_usd_micro || 0);
        // surface a router-level budget exhaustion (free quota + paid cap both gone) so we stop the wave (L4).
        if (res && res.budget_exhausted) budgetExhausted = true;
        const w = writeRescue(res, { dry });
        results.push({ ...res, _sql: dry ? w.sql : undefined });
        remaining--;
      } catch (e) { results.push({ lead_id: lead.id, cohort: cname, error: e.message }); remaining--; }
    }
  }
  return { ok: true, processed: results.length, total_cost_usd_micro: totalCost, dry, results };
}

module.exports = {
  runWave, rescueLead, retierWith, writeRescue,
  findLinkedinViaSerp, findNamedDM, findEmailFor, classifySector,
  isEnabled, COHORT_SQL, COHORT_ORDER, nameParts, jurisdictionOf, parseStrictJson,
};
