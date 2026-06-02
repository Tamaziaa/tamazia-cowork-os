'use strict';
// P1.8 Tamazia audit design system: the single source the v15 render imports.
// v13 quiet-luxury letterhead tokens + colour-blind-safe severity + CSP-safe motion + the BINGO-voice formatter.

const TOKENS = {
  maroon: '#3D0E0E', gold: '#C8A664', cream: '#F8F5EF', ink: '#1F2937', muted: '#6b6b6b',
  serif: "'Times New Roman', Georgia, serif",
  sans: "-apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  green: '#2E7D32', red: '#B91C1C', amber: '#E67E22',
  maxw: '1100px',
};

// Severity is NEVER colour-only (WCAG 1.4.1): colour + icon + label always travel together.
const SEVERITY = {
  P0: { color: '#B91C1C', icon: '▲', label: 'Critical' },
  P1: { color: '#E67E22', icon: '●', label: 'High' },
  P2: { color: '#C8A664', icon: '◆', label: 'Moderate' },
  P3: { color: '#6b7280', icon: '■', label: 'Low' },
};
function severityOf(sev) { return SEVERITY[String(sev || 'P2').toUpperCase()] || SEVERITY.P2; }

// CSP-safe motion scaffolding (no inline handlers; respects prefers-reduced-motion).
const MOTION_CSS = [
  '@keyframes tzFadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}',
  '@keyframes tzDraw{to{stroke-dashoffset:0}}',
  '.tz-fade{animation:tzFadeUp .6s ease both}',
  '.tz-reveal{opacity:0}.tz-reveal.tz-in{animation:tzFadeUp .6s ease both}',
  '.tz-bar{transition:width 1s ease}',
  '@media (prefers-reduced-motion: reduce){*{animation:none!important;transition:none!important}.tz-reveal{opacity:1!important}}',
].join('\n');

// The BINGO voice: every finding becomes "Right now: <real problem + the quoted evidence>. Tamazia <the exact fix>."
function bingoLine(f) {
  f = f || {};
  const fact = String(f.fact || f.description || '').trim();
  const quote = String(f.evidence_quote || f.evidence_snippet || '').trim();
  const fixRaw = String(f.tamazia_fix_short || f.recommendation || '').trim();
  const ev = quote ? ' Here it is on your site: “' + quote.slice(0, 140).replace(/\s+/g, ' ').trim() + '”.' : '';
  const problem = (fact ? 'Right now: ' + fact + (/[.!?]$/.test(fact) ? '' : '.') : 'Right now: an issue was found on your site.') + ev;
  let fix;
  if (!fixRaw) fix = 'Tamazia fixes this as part of the engagement.';
  else if (/^tamazia/i.test(fixRaw)) fix = fixRaw + (/[.!?]$/.test(fixRaw) ? '' : '.');
  else fix = 'Tamazia ' + fixRaw.charAt(0).toLowerCase() + fixRaw.slice(1) + (/[.!?]$/.test(fixRaw) ? '' : '.');
  return { problem, fix };
}

module.exports = { TOKENS, SEVERITY, severityOf, MOTION_CSS, bingoLine };
