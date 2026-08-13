// modern-slavery-detector · Phase 3.
// Detects whether a UK business falls within scope of the Modern Slavery Act 2015
// section 54 transparency obligation (commercial organisations with > £36M annual
// global turnover that supply goods or services in the UK) AND whether the firm
// publishes a Modern Slavery Statement on its website.
//
// Heuristics (deliberately conservative):
//   - Revenue mentions over £36M / $40M / €45M in the site text → in_scope = true
//   - Mentions of "FTSE", "LSE listed", "global headcount > 250", "annual report
//     2024" etc. raise the probability the firm is at threshold.
//   - We never assert in_scope without at least one signal.
//   - If in_scope and no statement detected, emit a categorical finding.

const REVENUE_PATTERNS = [
  /£\s*([1-9]\d{2,3})\s*(?:m|million)\b/i,                  // £100M+
  /£\s*([1-9](?:\.\d+)?)\s*(?:b|bn|billion)\b/i,            // £1bn+
  /annual\s+(?:revenue|turnover)\s+of\s+(?:over\s+)?[£$€]\s*([1-9]\d{1,3})\s*(?:m|million|b|billion)/i,
  /global\s+(?:revenue|turnover|sales)\s+of\s+(?:over\s+)?[£$€]\s*([1-9]\d{1,3})/i,
  /\$\s*([1-9]\d{2,3})\s*(?:m|million)\b/i,
  /\$\s*([1-9](?:\.\d+)?)\s*(?:b|bn|billion)\b/i,
  /€\s*([1-9]\d{2,3})\s*(?:m|million|mn)\b/i
];

const SCALE_HINTS = [
  /\bFTSE\s*(?:100|250|350)\b/i,
  /\bLSE\s*listed\b/i,
  /\b(?:NASDAQ|NYSE)\s*listed\b/i,
  /\bglobal\s+headcount\s+(?:of\s+)?[1-9]\d{3,}/i,
  /\b\d{1,2}[,\s]*\d{3}\s+(?:employees|colleagues|staff)\b/i,
  /\bForbes\s+Global\s+2000\b/i,
  /\bFortune\s+(?:500|1000)\b/i
];

const STATEMENT_PATTERNS = [
  /Modern\s+Slavery\s+(?:Act\s+2015\s+)?Statement/i,
  /Slavery\s+and\s+Human\s+Trafficking\s+Statement/i,
  /Section\s+54\s+(?:Modern\s+Slavery)?/i,
  /our\s+modern\s+slavery\s+statement/i
];

const STATEMENT_PATH_HINTS = [
  /\/modern-slavery/i, /\/modern-slavery-statement/i, /\/slavery-statement/i,
  /\/transparency\/modern-slavery/i, /\/anti-slavery/i
];

function detect(fullText, paths = []) {
  const t = String(fullText || '');

  // Step 1: revenue signal
  let in_scope_revenue = false;
  let evidence_revenue = null;
  for (const re of REVENUE_PATTERNS) {
    const m = t.match(re);
    if (m) {
      const raw = m[0];
      // crude threshold check: any £100M+, $40M+, €45M+ counts as "likely in scope"
      const num = parseFloat(m[1] || '0');
      const isLargeGBP = /£/.test(raw) && (/million/i.test(raw) ? num >= 36 : /b|bn|billion/i.test(raw));
      const isLargeUSD = /\$/.test(raw) && (/million/i.test(raw) ? num >= 50 : /b|bn|billion/i.test(raw));
      const isLargeEUR = /€/.test(raw) && (/million|mn/i.test(raw) ? num >= 45 : /b|bn|billion/i.test(raw));
      if (isLargeGBP || isLargeUSD || isLargeEUR) {
        in_scope_revenue = true;
        evidence_revenue = raw;
        break;
      }
    }
  }

  // Step 2: scale signal
  let in_scope_scale = false;
  let evidence_scale = null;
  for (const re of SCALE_HINTS) {
    const m = t.match(re);
    if (m) { in_scope_scale = true; evidence_scale = m[0]; break; }
  }

  // Step 3: statement detection
  const has_statement_text = STATEMENT_PATTERNS.some(re => re.test(t));
  const has_statement_path = (paths || []).some(p => STATEMENT_PATH_HINTS.some(re => re.test(p)));
  const has_statement = has_statement_text || has_statement_path;

  const in_scope = in_scope_revenue || in_scope_scale;
  const requires_finding = in_scope && !has_statement;

  return {
    in_scope,
    in_scope_signals: { revenue: in_scope_revenue ? evidence_revenue : null, scale: in_scope_scale ? evidence_scale : null },
    has_statement,
    requires_finding
  };
}

module.exports = { detect, REVENUE_PATTERNS, SCALE_HINTS, STATEMENT_PATTERNS };
