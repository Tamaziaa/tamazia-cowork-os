'use strict';
// WHY "WE HAVE SO MANY LLM API KEYS" AND IT STILL FAILED.
//
// TWO faults, compounding:
//
// 1. THE KEYS NEVER REACHED THE MINT. GROQ_API_KEY and GEMINI_API_KEY both answer HTTP 200 on the current keys -
//    verified live. But neither was a GitHub secret, and the mint only sees what is in its env. So the router asked
//    Groq (no key), then NIM (no key), then Gemini (no key), and landed on the ONE provider that happened to be
//    configured. Five providers "tried", one available. Exactly the same defect as CH_API_KEY: the key existed, was
//    valid, and was invisible to the code that needed it.
//
// 2. THE ESCALATION LADDER WAS INVERTED. On a hard case the gate escalates to a "premium" chain - and that chain led
//    with GEMINI, whose free tier is about 1,000 REQUESTS A DAY. Every hard case burned the scarcest quota in the
//    stack. Once exhausted, the gate failed; a failed gate means no llm_verify on the payload; and the database
//    correctly threw the whole audit away as a stub. That is how a rate limit becomes a lost compliance report.
//
// Stronger is not the same as scarcer. The ladder now escalates CAPABILITY while spending the CHEAPEST SUFFICIENT
// quota first, and keeps Gemini as the reserve.
const A = require('assert');
const fs = require('fs');
const path = require('path');
let n = 0, bad = 0;
const t = (name, fn) => { n++; try { fn(); console.log('ok ' + n + ' ' + name); } catch (e) { bad++; console.error('FAIL ' + n + ' ' + name + ': ' + e.message); } };

const gateSrc = fs.readFileSync(path.join(__dirname, '..', 'src/lib/llm/gate.js'), 'utf8');
const premium = gateSrc.slice(gateSrc.indexOf('const _defaultPremium'), gateSrc.indexOf('for (let attempt'));

t('the escalation chain does NOT lead with the scarcest provider', () => {
  const iGroq = premium.indexOf("'groq'");
  const iGem = premium.indexOf("'gemini'");
  A.ok(iGroq !== -1 && iGem !== -1, 'both providers must be in the ladder');
  A.ok(iGroq < iGem, 'Gemini (~1,000 requests/day) must NOT be the opening move; it is the reserve');
});
t('Qwen is the LAST resort, not the first', () => {
  const iQwen = premium.indexOf("'qwen'");
  if (iQwen === -1) return;   // no key, correctly absent
  A.ok(iQwen > premium.indexOf("'groq'"), 'Qwen must come after the free high-quota providers');
  A.ok(iQwen > premium.indexOf("'gemini'"), 'Qwen is the last resort');
});
t('Cloudflare is in the ladder (an independent quota, so an exhausted Groq does not block the engine)', () => {
  A.ok(/cloudflare/.test(premium), 'Cloudflare was missing from the escalation chain entirely');
});

// ---- the keys must actually REACH the mint ----
const wf = fs.readFileSync(path.join(__dirname, '..', '.github/workflows/mint-now.yml'), 'utf8');
t('every provider the router can call has its key wired into the mint', () => {
  for (const k of ['GROQ_API_KEY', 'GEMINI_API_KEY', 'NIM_API_KEY', 'CLOUDFLARE_API_TOKEN']) {
    A.ok(wf.includes(k), k + ' is NOT in mint-now.yml: the router will ask for it, get nothing, and fall through');
  }
});
t('the router and the gate agree that Groq and Cloudflare are the cheap first line', () => {
  const routerSrc = fs.readFileSync(path.join(__dirname, '..', 'src/lib/llm/router.js'), 'utf8');
  A.ok(/_CF_FREE/.test(routerSrc) && /_GROQ_FREE/.test(routerSrc));
  const chain = routerSrc.slice(routerSrc.indexOf('_CF_FREE ='), routerSrc.indexOf('extract:'));
  A.ok(chain.indexOf('_GROQ_FREE') < chain.indexOf('_QWEN_STEP') || !/_QWEN_STEP/.test(chain),
    'the router must also spend the cheap quota first');
});

console.log(bad ? 'LLM CHAIN: FAIL' : 'LLM CHAIN ORDER: ALL GREEN (' + n + ' checks)');
process.exit(bad ? 1 : 0);
