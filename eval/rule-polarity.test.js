'use strict';
/**
 * RULE POLARITY — a prohibited claim may never be stored as a required disclosure.
 *
 * THE BUG (live until v25.12). Five rules kept a list of PROHIBITED MARKETING CLAIMS in the
 * REQUIRED-DISCLOSURE field. must_appear and trigger_then_check breach when that pattern is ABSENT, and an
 * element_checklist breaches when the element is not found. So the engine ran as a REVERSE detector:
 *
 *   MED_CLAIMS       P1  "No misleading treatment claims"  required: pain-free|guaranteed|miracle|permanent cure
 *        -> every clinic breached its state medical board for NOT advertising a miracle cure.
 *        -> it triggers on any page containing "clinic|dental|treatment|surgery": the whole healthcare vertical.
 *   DHA_CLAIMS       P2  "No exaggerated medical claims"   required: guaranteed|painless|best clinic|no risk
 *   ATTY_MISLEADING  P3  "No false or misleading claims"   required: no win no fee|guarantee|best lawyer|#1
 *   US_ABA_MODEL_RULES   element "No guarantee of outcome" whose pattern MATCHES the guarantee
 *
 *        -> a firm advertising "THE BEST LAW FIRM - GUARANTEED RESULTS" PASSED ABA Rule 7.1.
 *        -> a firm that said nothing of the kind FAILED it.
 *
 * The engine already had the right rule_type ('prohibit'): prose-only, testimonial-skipping, every-page, with
 * the offending SENTENCE as evidence. These five simply used the wrong one.
 *
 * RULE: if a pattern describes something the firm MUST NOT SAY, its rule_type is 'prohibit'. Full stop.
 *
 * Skips when NEON_URL is absent — a missing DB must never be reported as a clean catalogue.
 */
const A = require('assert');
// A SKIP IS A CONFIDENT ZERO (CodeRabbit, and it is the third time this lesson has been taught in one session).
// In CI the database is ALWAYS present. If NEON_URL is missing THERE, this gate did not run — and a gate that did
// not run is not a gate that passed. It FAILS. Locally, a developer without a DB gets a loud skip, not a silent one.
const N = process.env.NEON_URL || process.env.DATABASE_URL;
if (!N) {
  if (process.env.CI) {
    console.error('FAIL - NEON_URL is absent in CI. This gate did not run, so it did not pass. A missing DB is not a green build.');
    process.exit(1);
  }
  console.log('ok - SKIPPED LOCALLY (no NEON_URL). This gate did NOT run. It is NOT evidence of a healthy catalogue.');
  process.exit(0);
}

const q = async (sql) => {
  // CodeRabbit (#341): a bare fetch() with no timeout and no status check can HANG or return an HTML error page,
  // and the gate then dies with a parse error instead of a verdict. A gate that crashes is a gate that did not
  // run. Timeout + explicit status handling, so a broken DB is reported AS a failure, never as noise.
  const u = new URL(N);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), Number(process.env.NEON_TIMEOUT_MS || 20000));
  let res;
  try {
    res = await fetch(`https://${u.hostname}/sql`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Neon-Connection-String': N },
      body: JSON.stringify({ query: sql }),
      signal: ctrl.signal,
    });
  } catch (e) {
    throw new Error('Neon request failed (' + (e.name === 'AbortError' ? 'timed out' : e.message) + '). The gate did NOT run.');
  } finally { clearTimeout(timer); }
  if (!res.ok) throw new Error('Neon returned HTTP ' + res.status + ' ' + res.statusText + '. The gate did NOT run.');
  const j = await res.json();
  if (j.message) throw new Error(j.message);
  return j.rows || [];
};

// A CLAIM a regulator PROHIBITS — anchored, so a legitimate disclaimer ("no guarantee of a similar outcome")
// and a real scheme name ("Energy Price Guarantee") are correctly NOT caught.
const PROHIBITED_CLAIM = [
  /\bguarantee[ds]?\s+(?:a\s+)?(?:results?|outcomes?|cure|success|win|verdict|settlement)/i,
  /\bpainless\b|\bpain[-\s]?free\b|\bmiracle\b/i,
  /\bbest\s+(?:lawyer|attorney|clinic|doctor|dentist|surgeon|dermatologist|law\s*firm|litigator)/i,
  // NOT listed: "no win no fee". It is a LAWFUL conditional-fee arrangement (UK CFA) and a lawful
  // contingency fee (US). UK_SRA_COC/TR.1 legitimately REQUIRES it as a pricing disclosure under the SRA
  // Transparency Rules. It sat in the broken rules' token lists and I nearly carried it into the fix —
  // which would have turned a false negative into a false positive. Inheriting a bad token list is a bug.
  /100\s*%\s*(?:safe|effective|success|win)/i,
  /\balways\s+win\b|\bnever\s+lose\b/i,
  /\brisk[-\s]free\b|\bzero\s+risk\b/i,
  /\bpermanent\s+(?:cure|results?)\b/i,
];

(async () => {
  let bad = 0;
  const t = async (name, fn) => { try { await fn(); console.log('ok ' + name); } catch (e) { bad++; console.error('FAIL ' + name + ': ' + e.message); } };

  const rules = await q(`select framework_short, rule_id, rule_type, severity,
    coalesce(regex_pattern,'') regex_pattern, coalesce(regex_elements::text,'') regex_elements, coalesce(check_style,'') check_style
    from compliance_rules where active`);

  await t('the catalogue is reachable (a gate that reads nothing proves nothing)', async () => {
    A.ok(rules.length > 500, 'expected the full catalogue, got ' + rules.length + ' rules');
  });

  await t('no REQUIRED-DISCLOSURE pattern contains a claim the regulator PROHIBITS', async () => {
    const inverted = [];
    for (const r of rules) {
      if (r.rule_type === 'prohibit') continue;             // prohibit rules are SUPPOSED to hold these
      const pats = [];
      if (r.regex_pattern) pats.push(['regex_pattern', r.regex_pattern]);
      if (r.regex_elements) {
        let els = []; try { els = JSON.parse(r.regex_elements) || []; } catch (_e) { els = []; }
        for (const e of els) if (e && e.pattern) pats.push(['element "' + e.label + '"', e.pattern]);
      }
      for (const [where, pat] of pats) {
        for (const bad2 of PROHIBITED_CLAIM) {
          const m = pat.match(bad2);
          if (m) { inverted.push(`${r.framework_short}/${r.rule_id} [${r.severity}, ${r.rule_type}] — ${where} requires the firm to SAY "${m[0]}"`); break; }
        }
      }
    }
    A.deepStrictEqual(inverted, [],
      inverted.length + ' rule(s) breach a firm for FAILING TO MAKE a claim its regulator PROHIBITS:\n  ' +
      inverted.join('\n  ') +
      "\n\nA firm that DOES make the claim passes; one that does not, fails. The polarity is inverted." +
      "\nSet rule_type='prohibit' — that branch already exists and gives line-level evidence.");
  });

  // A prohibit rule with no pattern can NEVER FIRE. Six were sitting in the catalogue inert, including three
  // P0s: UK_BOTOX_FILLERS_U18 (a criminal offence), UK_HMR_2012 POM public advertising, US_FTC_FAKE_REVIEWS.
  // They are NOT deleted — the law genuinely binds the client and must stay in the binding-obligation map.
  // They must instead DECLARE themselves unassessed IN THE CATALOGUE (check_style='unassessed_no_pattern'),
  // which is the only source of truth. An allowlist in this file would be theatre; a declaration is queryable.
  // Writing their patterns needs calibration against a real clinic/letting-agent corpus first: a P0 pattern
  // for "botox offered to under-18s" fires on a clinic that says "we do NOT treat under-18s". Same polarity
  // trap. A regex never run against real phrasing is a guess with a P0 on it.
  await t("every 'prohibit' rule either carries a pattern or DECLARES itself unassessed", async () => {
    const silent = rules
      .filter((r) => r.rule_type === 'prohibit' && !r.regex_pattern.trim() && r.check_style !== 'unassessed_no_pattern')
      .map((r) => r.framework_short + '/' + r.rule_id + ' [' + r.severity + ']');
    A.deepStrictEqual(silent, [],
      'These prohibit rules have NO pattern, so they can never fire, and they do not say so:\n  ' + silent.join('\n  ') +
      "\nSet check_style='unassessed_no_pattern' (honest) or give them a calibrated pattern (better).");
  });

  if (bad) { console.error('\n' + bad + ' polarity failure(s)'); process.exit(1); }
  console.log('\nrule-polarity: all green');
})();
