// Jurisdiction-detection gate: detectMarkets must catch every served market (offices/regulators/phone/
// currency/hreflang/cities/postcodes/address/served-language) and reject stray mentions. Run: node scripts/test-jurisdiction.mjs
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { detectMarkets } = require('../src/lib/sourcing/markets.js');
let P = 0, F = 0; const fails = [];
const m = (h, d) => detectMarkets({ html: h, domain: d || 'x.com' });
const has = (r, c) => (r.operating_countries || []).includes(c);
function t(name, cond, extra) { if (cond) P++; else { F++; fails.push(name + (extra ? ' :: ' + extra : '')); } }

let r;
r = m('HQ New York. We serve clients across Europe and the United Kingdom. London EC2V 8AS office. +1 212 555.', 'acme.com');
t('US+EU+UK firm => US', has(r, 'United States')); t('US+EU+UK => UK', has(r, 'United Kingdom')); t('US+EU+UK => serves_eu', r.serves_eu === true);
r = m('Streathers Solicitors, London EC1A 1BB. Regulated by the SRA. Call +44 20 7000. Fees in £.', 'streathers.co.uk');
t('UK law => UK', has(r, 'United Kingdom')); t('UK law => not US', !has(r, 'United States')); t('UK law => not serves_eu', r.serves_eu === false);
r = m('We are a Leeds firm. Our founder once worked in New York and loves America.', 'firm.co.uk');
t('stray US mention rejected', !has(r, 'United States')); t('stray => UK kept', has(r, 'United Kingdom'));
r = m('Online shop. Versand nach Deutschland. Impressum. Preise in EUR. +49 30 1234. Datenschutz.', 'shop.de');
t('DE ecommerce => Germany', has(r, 'Germany')); t('DE => serves_eu', r.serves_eu === true);
r = m('Offices in Dubai (DIFC) and London. We advise clients across the UAE and UK. +971 4 555, +44 20 555.', 'firm.com');
t('UAE+UK => UAE', has(r, 'United Arab Emirates')); t('UAE+UK => UK', has(r, 'United Kingdom')); t('UAE => Middle East region', (r.regions || []).includes('Middle East'));
r = m('San Francisco software company. Pricing $49/mo. +1 415 555 0000.', 'saas.com');
t('US SaaS => US', has(r, 'United States')); t('US SaaS => not UK', !has(r, 'United Kingdom')); t('US SaaS => not serves_eu', r.serves_eu === false);
r = m('Consultancy at 10 King Street, London EC2V 8AS.', 'x.com');
t('London postcode => UK', has(r, 'United Kingdom'));
r = m('Paris cabinet. Nous conseillons des clients en France. CNIL. +33 1 4000. Prix en EUR.', 'cabinet.fr');
t('FR firm => France', has(r, 'France')); t('FR => serves_eu', r.serves_eu === true);
r = m('Global platform. Offices in London, New York, Singapore. Customers across Europe, US and APAC. hreflang en-US en-GB.', 'g.io');
t('global => UK', has(r, 'United Kingdom')); t('global => US', has(r, 'United States')); t('global => serves_eu', r.serves_eu === true);
r = m('Cake shop in Manchester. Best cakes around.', 'cakes.co.uk');
t('local UK bakery => UK only', has(r, 'United Kingdom') && !has(r, 'United States') && !r.serves_eu);

console.log('\n===== JURISDICTION DETECTION TEST =====');
console.log('PASS ' + P + '  FAIL ' + F);
if (fails.length) { fails.forEach(f => console.log('  x ' + f)); process.exitCode = 1; } else console.log('All jurisdiction-detection cases correct.');
