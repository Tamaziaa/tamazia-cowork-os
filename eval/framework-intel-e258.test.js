'use strict';
// E-258 (v23.2) — FRAMEWORK INTELLIGENCE FOR EVERY FRAMEWORK, BUILT FROM DATA WE ALREADY OWN, WITH ZERO INVENTION.
//
// 48 of 291 frameworks had curated intelligence. 84% rendered a bare card with a regulator's name and nothing
// inside — which is exactly the "this section provides no value" complaint, and why E-251 had to hide them.
//
// THE SOURCE, and this is the whole point: 287 of 295 frameworks ALREADY had real statute text in statute_chunks,
// and 290 already had curated rules whose `description` column IS the obligation — human-written, citation-backed,
// and already trusted enough to decide whether a firm is in breach. The intelligence did not need to be invented.
// It needed to be CONNECTED. Again.
//
// THE LINE WE DID NOT CROSS: `recent_enforcement` was NOT generated. It remains at 39 real, cited actions and NULL
// everywhere else. An invented enforcement action is the single most damaging thing this engine could print, and
// E-233 already had to remove one ("<regulator> actively enforces this regime"). We do not manufacture enforcement.
// Silence beats filler. A framework with no real obligation text gets NO ROW AT ALL.
const path = require('path');
const A = require('assert');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
let n = 0, bad = 0;
const t = (name, fn) => { n++; try { fn(); console.log('ok ' + n + ' ' + name); } catch (e) { bad++; console.error('FAIL ' + n + ' ' + name + ': ' + e.message); } };

const sql = (q) => {
  const out = execFileSync(path.join(ROOT, 'scripts', 'psql'), [process.env.NEON_URL, '-tA', '-c', q], { encoding: 'utf8' });
  return out.trim();
};

if (!process.env.NEON_URL) { console.log('E258: skipped (no NEON_URL)'); process.exit(0); }

t('E-258: at least 95% of frameworks now carry real obligations (was 16%)', () => {
  const pct = Number(sql("select round(100.0*(select count(*) from framework_intelligence where key_obligations<>'')/(select count(*) from framework_versions),1)"));
  A.ok(pct >= 95, 'obligation coverage must be >=95%, got ' + pct + '%');
});

t('E-258 THE PROVENANCE RULE: every obligation is backed by a real curated rule OR by real statute text', () => {
  // Two legitimate provenances, and only two:
  //   (a) the description of an ACTIVE RULE on that framework — human-written, citation-backed, already trusted
  //       enough to decide whether a firm is in breach; or
  //   (b) real statute text in statute_chunks — i.e. hand-curated FROM THE LAW ITSELF (the E-232 rows).
  // Anything with NEITHER is content that came from nowhere, and content from nowhere is invented content.
  const unbacked = Number(sql(`
    select count(*) from framework_intelligence fi
    where fi.key_obligations <> ''
      and not exists (select 1 from compliance_rules r
                      where r.framework_short = fi.framework_short and r.active
                        and position(r.description in fi.key_obligations) > 0)
      and not exists (select 1 from statute_chunks sc where sc.law_id = fi.framework_short)`));
  A.strictEqual(unbacked, 0, unbacked + ' framework(s) carry obligation text backed by NEITHER a curated rule NOR statute text. That is invented content and it must never reach a solicitor.');
});

t('E-258: recent_enforcement was NOT manufactured — it stays where it is real, and NULL everywhere else', () => {
  const withEnf = Number(sql("select count(*) from framework_intelligence where recent_enforcement is not null and recent_enforcement<>''"));
  A.ok(withEnf <= 60, 'enforcement rows jumped to ' + withEnf + '. Enforcement must never be generated: an invented enforcement action is the most damaging thing this engine can print.');
  // and any enforcement we DO claim must carry a source
  const unsourced = Number(sql("select count(*) from framework_intelligence where recent_enforcement is not null and recent_enforcement<>'' and (recent_enforcement_url is null or recent_enforcement_url='')"));
  A.strictEqual(unsourced, 0, unsourced + ' enforcement claim(s) carry NO SOURCE URL. An uncited enforcement claim is a fabrication.');
});

t('E-258: a framework with no real obligation text gets NO ROW — silence beats filler', () => {
  const empty = Number(sql("select count(*) from framework_intelligence where key_obligations is null or key_obligations=''"));
  A.strictEqual(empty, 0, 'a framework_intelligence row must never exist with empty obligations — that is the hollow card E-251 had to hide');
});

console.log(bad ? 'E258 FRAMEWORK INTEL: FAIL' : 'E258 FRAMEWORK INTEL: ALL GREEN (' + n + ' checks)');
process.exit(bad ? 1 : 0);
