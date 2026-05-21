// jurisdiction-router.ts — runnable by Node.js as plain JavaScript (no type-only syntax).
// The .ts extension is kept so editors apply TypeScript intent; Node loads it as JS.
// Mirror at jurisdiction-router.js for tools that won't resolve .ts.

const EU_MEMBER_STATES = new Set([
  'AT','BE','BG','CY','CZ','DE','DK','EE','ES','FI','FR','GR','HR','HU','IE',
  'IT','LT','LU','LV','MT','NL','PL','PT','RO','SE','SI','SK'
]);

const SECTOR_MAP = {
  'law-firms':     ['UK_SRA_COC'],
  'healthcare':    ['UK_CQC','UK_MHRA'],
  'finance':       ['UK_FCA_CONC25'],
  'hospitality':   [],
  'real-estate':   [],
};

function routeJurisdictions(opts) {
  opts = opts || {};
  const c = String(opts.country || '').toUpperCase().trim();
  const sector = String(opts.sector || '').toLowerCase();
  const out = [];

  if (c === 'UK' || c === 'GB' || c === 'GBR') {
    out.push('UK_GDPR_A13', 'UK_PECR', 'UK_ICO_COOKIES');
  } else if (EU_MEMBER_STATES.has(c)) {
    out.push('EU_GDPR');
  } else if (c === 'US' || c === 'USA') {
    out.push('US_FTC');
  } else if (c === 'AE' || c === 'UAE') {
    out.push('UAE_PDPL');
  } else if (!c) {
    out.push('UK_GDPR_A13', 'EU_GDPR');
  } else {
    out.push('UK_GDPR_A13', 'EU_GDPR');
  }

  for (const s of (SECTOR_MAP[sector] || [])) out.push(s);
  return Array.from(new Set(out));
}

module.exports = { routeJurisdictions, EU_MEMBER_STATES };
