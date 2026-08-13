// wcag-contrast-grader · Phase 3.
// Parses CSS colour values (hex / rgb / rgba / named) out of a page's HTML +
// inline styles, computes WCAG 2.1 relative luminance contrast ratios for the
// most common foreground / background pairings, and grades the page against
// WCAG 2.1 Level AA (4.5:1 for normal text, 3.0:1 for large text and UI
// components).
//
// Zero dependencies. Pure function. Reads the HTML string we already have
// from the scrape; no second fetch needed. The grader is intentionally
// conservative: it only reports a failing pair if the two colours actually
// co-occur in the same inline-style block (foreground colour + background
// colour on the same element).

const NAMED = {
  black: '#000000', white: '#ffffff', red: '#ff0000', green: '#008000',
  blue: '#0000ff', yellow: '#ffff00', orange: '#ffa500', purple: '#800080',
  pink: '#ffc0cb', grey: '#808080', gray: '#808080', silver: '#c0c0c0',
  navy: '#000080', teal: '#008080', maroon: '#800000', olive: '#808000'
};

function parseColor(s) {
  if (!s) return null;
  const v = String(s).trim().toLowerCase();
  if (NAMED[v]) return parseColor(NAMED[v]);
  // #rgb / #rrggbb
  let m = v.match(/^#([0-9a-f]{3})$/i);
  if (m) {
    const c = m[1];
    return { r: parseInt(c[0] + c[0], 16), g: parseInt(c[1] + c[1], 16), b: parseInt(c[2] + c[2], 16) };
  }
  m = v.match(/^#([0-9a-f]{6})$/i);
  if (m) {
    const c = m[1];
    return { r: parseInt(c.slice(0, 2), 16), g: parseInt(c.slice(2, 4), 16), b: parseInt(c.slice(4, 6), 16) };
  }
  // rgb(a) format
  m = v.match(/^rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (m) return { r: +m[1], g: +m[2], b: +m[3] };
  return null;
}

function relLuminance({ r, g, b }) {
  const f = c => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contrastRatio(c1, c2) {
  const a = parseColor(c1); const b = parseColor(c2);
  if (!a || !b) return null;
  const l1 = relLuminance(a); const l2 = relLuminance(b);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

// Pulls inline style blocks that contain BOTH color: and background-color: /
// background:. Returns the pairs and the WCAG contrast ratio for each.
function extractInlinePairs(html) {
  const pairs = [];
  const styleRe = /style=(?:"|')([^"']*)(?:"|')/gi;
  let m;
  while ((m = styleRe.exec(html)) !== null) {
    const css = m[1];
    const fg = (css.match(/(?:^|;|\s)color\s*:\s*([^;]+)/i) || [])[1];
    const bg = (css.match(/(?:^|;|\s)(?:background-color|background)\s*:\s*([^;]+)/i) || [])[1];
    if (fg && bg) {
      const ratio = contrastRatio(fg.trim(), bg.trim());
      if (ratio != null && isFinite(ratio)) pairs.push({ fg: fg.trim(), bg: bg.trim(), ratio: Number(ratio.toFixed(2)) });
    }
    if (pairs.length > 250) break; // safety cap
  }
  return pairs;
}

function gradeAA(pairs, opts = {}) {
  // Defaults: WCAG 2.1 AA thresholds.
  const normalThreshold = opts.normalThreshold || 4.5;
  const largeThreshold  = opts.largeThreshold  || 3.0;
  const failing = pairs.filter(p => p.ratio < normalThreshold);
  const borderline = pairs.filter(p => p.ratio >= normalThreshold && p.ratio < largeThreshold + 1.5);
  return {
    total_pairs: pairs.length,
    failing_pairs: failing.length,
    failing_sample: failing.slice(0, 5),
    passing_pairs: pairs.length - failing.length,
    grade: failing.length === 0 ? 'AA' : (failing.length <= 2 ? 'AA-' : (failing.length <= 5 ? 'A' : 'fail')),
    borderline
  };
}

function gradeHtml(html, opts) {
  const pairs = extractInlinePairs(html);
  return gradeAA(pairs, opts);
}

module.exports = { parseColor, relLuminance, contrastRatio, extractInlinePairs, gradeAA, gradeHtml };
