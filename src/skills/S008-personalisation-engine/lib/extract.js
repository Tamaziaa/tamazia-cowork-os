// HTML extraction helpers · plain regex + light DOM. No external parser dependency.
// All returns include the source URL so the hallucination guard can validate every fact has provenance.

function stripTags(s) { return String(s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(); }
function decode(s) {
  return String(s || '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ');
}

function extractTitle(html) {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? decode(stripTags(m[1])).slice(0, 300) : '';
}
function extractMeta(html, name) {
  const re = new RegExp(`<meta[^>]+(?:name|property)\\s*=\\s*["']${name}["'][^>]*content\\s*=\\s*["']([^"']*)["']`, 'i');
  const re2 = new RegExp(`<meta[^>]+content\\s*=\\s*["']([^"']*)["'][^>]*(?:name|property)\\s*=\\s*["']${name}["']`, 'i');
  const m = html.match(re) || html.match(re2);
  return m ? decode(m[1]).slice(0, 500) : '';
}
function extractHeadings(html, tag) {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'gi');
  const out = [];
  let m;
  while ((m = re.exec(html)) !== null) {
    const txt = decode(stripTags(m[1])).trim();
    if (txt) out.push(txt.slice(0, 240));
    if (out.length > 50) break;
  }
  return out;
}
function extractLinks(html, baseHost) {
  const re = /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  const internal = []; const external = [];
  let m;
  while ((m = re.exec(html)) !== null) {
    const href = m[1]; const txt = decode(stripTags(m[2])).slice(0, 120);
    if (!href || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('#') || href.startsWith('javascript:')) continue;
    try {
      const u = new URL(href, `https://${baseHost}/`);
      if (u.host === baseHost) internal.push({ href: u.href, text: txt });
      else external.push({ href: u.href, text: txt });
    } catch (_e) {}
    if (internal.length + external.length > 400) break;
  }
  return { internal, external };
}
function countAlts(html) {
  const imgs = (html.match(/<img\b[^>]*>/gi) || []);
  let missing = 0; let total = imgs.length;
  for (const i of imgs) if (!/alt\s*=\s*["'][^"']+["']/i.test(i)) missing++;
  return { total, missing };
}
function extractJsonLd(html) {
  const re = /<script[^>]+type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  const out = [];
  let m;
  while ((m = re.exec(html)) !== null) {
    try { out.push(JSON.parse(m[1].trim())); } catch (_e) {}
  }
  return out;
}
function findPattern(html, patternList) {
  // patternList = [{regex, label}]
  const found = [];
  for (const p of patternList) {
    try { const re = new RegExp(p.regex, p.flags || 'i'); const m = html.match(re); if (m) found.push({ label: p.label, match: m[0].slice(0, 200) }); } catch (_e) {}
  }
  return found;
}
function approxWordCount(html) {
  return stripTags(html).split(/\s+/).filter(Boolean).length;
}
function extractTechFingerprint(html, headers) {
  const f = [];
  const xPow = headers['x-powered-by']; if (xPow) f.push({ key: 'x-powered-by', value: xPow });
  const server = headers['server']; if (server) f.push({ key: 'server', value: server });
  // Common CMS / framework markers
  const sigs = [
    { re: /wp-content|wp-includes/i, name: 'wordpress' },
    { re: /\/cdn\.shopify\.com\//i, name: 'shopify' },
    { re: /wix\.com|wixstatic/i, name: 'wix' },
    { re: /squarespace/i, name: 'squarespace' },
    { re: /webflow/i, name: 'webflow' },
    { re: /\/_next\//i, name: 'next.js' },
    { re: /\/_nuxt\//i, name: 'nuxt' },
    { re: /\/_astro\//i, name: 'astro' },
    { re: /\/wp-json\//i, name: 'wordpress-api' },
    { re: /react-dom/i, name: 'react' },
    { re: /elementor/i, name: 'elementor' },
    { re: /\bduda\.co\b/i, name: 'duda' }
  ];
  for (const s of sigs) if (s.re.test(html)) f.push({ key: 'cms', value: s.name });
  // analytics
  const ana = [
    { re: /gtag\(\s*['"]config['"]\s*,\s*['"]G-/, name: 'GA4' },
    { re: /UA-\d{4,}-\d/, name: 'UA-legacy' },
    { re: /fbq\(\s*['"]init['"]/i, name: 'meta-pixel' },
    { re: /clarity\.ms/i, name: 'ms-clarity' },
    { re: /hotjar/i, name: 'hotjar' },
    { re: /linkedin\.com\/li\.lms/i, name: 'linkedin-insight' }
  ];
  for (const s of ana) if (s.re.test(html)) f.push({ key: 'analytics', value: s.name });
  return f;
}

module.exports = {
  stripTags, decode, extractTitle, extractMeta, extractHeadings, extractLinks,
  countAlts, extractJsonLd, findPattern, approxWordCount, extractTechFingerprint
};
