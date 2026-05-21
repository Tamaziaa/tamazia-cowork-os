#!/usr/bin/env node
// S008 personalisation engine · Phase 6 task 6.2.1
// Orchestrates 5 scanners → LLM pointer-generator → hallucination guard → quality scorer.
// Writes: personalisation_scans (1 row), pointer_hallucination_log (n rows),
//          leads.personalisation_pointers + .quality_score + .generated_at.
//
// CLI:
//   node run.js --domain example.co.uk --sector law-firms --country UK --company "Example LLP" [--lead-id 7]
// Optional: --max-pointers 50, --skip-llm (uses canonical phrasing of scanner findings)

const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..', '..', '..');
function pgPath() { return path.resolve(ROOT, 'scripts', 'psql'); }
function pg(sql) {
  const url = process.env.NEON_URL || process.env.NEON_CONNECTION_STRING;
  if (!url) return null;
  try { return execFileSync(pgPath(), [url, '-tA', '-c', sql], { encoding: 'utf8' }).toString().trim(); } catch (_e) { return null; }
}
function esc(v) { if (v === null || v === undefined) return 'NULL'; return `'${String(v).replace(/'/g, "''")}'`; }

const websiteScanner = require('../scanners/website.js');
const complianceScanner = require('../scanners/compliance.js');
const seoScanner = require('../scanners/seo.js');
const adScanner = require('../scanners/ad-intel.js');
const prScanner = require('../scanners/public-records.js');
const securityHeadersScanner = require('../scanners/security-headers.js');
const tlsDnsScanner = require('../scanners/tls-dns.js');
const technicalSeoScanner = require('../scanners/technical-seo.js');
const accessibilityScanner = require('../scanners/accessibility.js');
const contentDepthScanner = require('../scanners/content-depth.js');
const { run: llmRun } = require('../../../lib/llm/router.js');
const { filterPointers } = require('../lib/hallucination-guard.js');
const { scoreScan } = require('../lib/score-rubric.js');
const { tamaziaLinkFor } = require('../lib/tamazia-link-router.js');

const PROMPT_PATH = path.join(__dirname, '..', 'prompts', 'pointer-generator.md');
const SYSTEM_PROMPT = fs.readFileSync(PROMPT_PATH, 'utf8');

async function runEngine({ domain, sector, country, company, lead_id, max_pointers, skip_llm }) {
  const t0 = Date.now();
  domain = String(domain || '').toLowerCase();
  if (!domain) throw new Error('domain required');

  // Insert scan row early so other tables can reference it
  pg(`INSERT INTO personalisation_scans (workspace_id, lead_id, domain, sector, country, framework_version, status, started_at) VALUES (1, ${lead_id || 'NULL'}, ${esc(domain)}, ${esc(sector)}, ${esc(country)}, (SELECT version FROM framework_versions WHERE framework_short='UK_GDPR_A13' ORDER BY id DESC LIMIT 1), 'running', NOW()) RETURNING id`);
  const scanIdRaw = pg(`SELECT id FROM personalisation_scans WHERE domain=${esc(domain)} AND status='running' ORDER BY id DESC LIMIT 1`);
  const scanId = scanIdRaw ? Number(scanIdRaw) : null;

  // Step 1: Run all 10 scanners concurrently (website first so dependent scanners can reuse facts)
  const websiteFacts = await websiteScanner.scan({ domain });
  const [compliance, seo, adIntel, publicRecords, security, tlsDns, technicalSeo, accessibility, contentDepth] = await Promise.all([
    complianceScanner.scan({ domain, sector, country }),
    seoScanner.scan({ domain, websiteFacts }),
    adScanner.scan({ domain, company, websiteFacts }),
    prScanner.scan({ domain, company, country }),
    securityHeadersScanner.scan({ domain, websiteFacts }),
    tlsDnsScanner.scan({ domain }),
    technicalSeoScanner.scan({ domain, websiteFacts }),
    accessibilityScanner.scan({ domain, websiteFacts }),
    contentDepthScanner.scan({ domain, websiteFacts })
  ]);

  // Bundle scanner output for downstream stages
  const bundle = { websiteFacts, compliance, seo, adIntel, publicRecords, security, tlsDns, technicalSeo, accessibility, contentDepth };

  // Step 2: Build canonical raw-finding pointers FIRST (deterministic, always passes guard)
  const rawPointers = buildCanonicalPointers({ domain, ...bundle });

  // Step 3: Optionally enhance phrasing with LLM (keeps facts, just polishes the language)
  let llmPointers = [];
  if (!skip_llm) {
    llmPointers = await enhanceWithLLM({ scanId, lead_id, rawPointers, scannerBundle: bundle });
  }

  // Step 4: Hallucination guard — use scanner bundle + rawPointers as the anchor set
  const anchorBlob = { rawPointers, ...bundle };
  const guardOut = filterPointers([...llmPointers, ...rawPointers].slice(0, max_pointers || 100), anchorBlob);

  // Log rejected pointers to pointer_hallucination_log
  for (const r of guardOut.rejected) {
    const ptr = r.pointer || {};
    pg(`INSERT INTO pointer_hallucination_log (workspace_id, scan_id, lead_id, bucket, rejected_text, rejection_reason) VALUES (1, ${scanId || 'NULL'}, ${lead_id || 'NULL'}, ${esc(ptr.bucket || '')}, ${esc((ptr.fact || JSON.stringify(ptr)).slice(0, 600))}, ${esc(r.reason)})`);
  }

  // De-dupe identical facts across LLM + raw (prefer LLM phrasing where both exist)
  const finalPointers = dedupeAcrossSources(guardOut.accepted);

  // Step 5: Score
  const byBucket = groupByBucket(finalPointers);
  const scored = scoreScan(byBucket, { domain });
  // Re-attach quality scores into the flat list
  const flat = [];
  for (const b of Object.keys(scored.buckets)) for (const p of scored.buckets[b].pointers) flat.push(p);
  // Truncate to max
  flat.sort((a, b) => sevRank(a.severity) - sevRank(b.severity) || (b._quality.score - a._quality.score));
  const cap = Math.min(max_pointers || 50, flat.length);
  const trimmed = flat.slice(0, cap);

  // Step 6: Finalise scan + lead row
  const summary = {
    domain, sector, country, lead_id: lead_id || null,
    pointer_count: trimmed.length,
    pointer_count_p0: trimmed.filter(p => p.severity === 'P0').length,
    pointer_count_p1: trimmed.filter(p => p.severity === 'P1').length,
    pointer_count_p2: trimmed.filter(p => p.severity === 'P2').length,
    specificity_score: scored.specificity_score,
    buckets: Object.fromEntries(Object.entries(scored.buckets).map(([k, v]) => [k, { n: v.n, mean_score: v.mean_score }])),
    total_latency_ms: Date.now() - t0,
    rejected_count: guardOut.rejected.length,
    scan_id: scanId,
    pointers: trimmed.map(p => ({ bucket: p.bucket, severity: p.severity, fact: p.fact, recommendation: p.recommendation, evidence_url: p.evidence_url, citation: p.citation, quality: p._quality.score, fine_low_gbp: p.fine_low_gbp || null, fine_high_gbp: p.fine_high_gbp || null, layman_explanation: p.layman_explanation || null, tamazia_fix_short: p.tamazia_fix_short || null, service_page_path: p.service_page_path || null, pricing_tier: p.pricing_tier || null }))
  };

  // Compute total LLM cost from ledger for this scan
  const costRaw = pg(`SELECT COALESCE(SUM(cost_usd_micro),0), COALESCE(SUM(latency_ms),0) FROM llm_cost_ledger WHERE scan_id=${scanId || 0}`);
  let costMicro = 0, llmLatency = 0;
  if (costRaw) { const [c, l] = costRaw.split('\t').map(v => Number(v) || 0); costMicro = c || 0; llmLatency = l || 0; }
  summary.total_cost_usd_micro = costMicro || 0;
  summary.llm_latency_ms = llmLatency || 0;

  pg(`UPDATE personalisation_scans SET pointer_count=${summary.pointer_count}, pointer_count_p0=${summary.pointer_count_p0}, specificity_score=${summary.specificity_score}, total_cost_usd_micro=${summary.total_cost_usd_micro}, total_latency_ms=${summary.total_latency_ms}, buckets=${esc(JSON.stringify(summary.buckets))}, status='ok', finished_at=NOW() WHERE id=${scanId}`);

  if (lead_id) {
    pg(`UPDATE leads SET personalisation_pointers=${esc(JSON.stringify(summary.pointers))}, personalisation_quality_score=${summary.specificity_score}, personalisation_generated_at=NOW() WHERE id=${lead_id}`);
  }
  return summary;
}

function buildCanonicalPointers({ domain, websiteFacts, compliance, seo, adIntel, publicRecords, security, tlsDns, technicalSeo, accessibility, contentDepth }) {
  const out = [];
  // Website-bucket pointers (drawn from raw facts about the home page)
  if (websiteFacts?.ok) {
    if (websiteFacts.pages && websiteFacts.pages.length > 0) {
      out.push({
        bucket: 'website', severity: 'P2',
        fact: `Site has at least ${websiteFacts.pages.length + 1} indexed pages discovered from internal links (home plus ${websiteFacts.pages.map(p => new URL(p.url).pathname).slice(0, 3).join(', ')}).`,
        recommendation: `Audit each of the ${websiteFacts.pages.length + 1} pages for consistent meta, canonical, and schema coverage.`,
        evidence_url: websiteFacts.base_url
      });
    }
    if (websiteFacts.tech && websiteFacts.tech.length > 0) {
      const cms = (websiteFacts.tech.find(t => t.key === 'cms') || {}).value;
      if (cms) out.push({
        bucket: 'website', severity: 'P2',
        fact: `Home page is served by ${cms} (detected from rendered HTML on ${websiteFacts.base_url}).`,
        recommendation: `Confirm ${cms} build pipeline ships server-rendered HTML so search engines see content on first paint.`,
        evidence_url: websiteFacts.base_url
      });
    }
    if (websiteFacts.headers_subset && !websiteFacts.headers_subset['strict-transport-security']) {
      out.push({
        bucket: 'website', severity: 'P1',
        fact: `Home page response on ${websiteFacts.base_url} is missing the Strict-Transport-Security header.`,
        recommendation: 'Configure HSTS at the edge with max-age=31536000 and includeSubDomains to harden the transport layer.',
        evidence_url: websiteFacts.base_url
      });
    }
    if (websiteFacts.sitemap && websiteFacts.sitemap.ok && (websiteFacts.sitemap.url_count || 0) < 5) {
      out.push({
        bucket: 'website', severity: 'P1',
        fact: `Sitemap at ${websiteFacts.sitemap.url} lists only ${websiteFacts.sitemap.url_count || 0} URLs.`,
        recommendation: `Expand the sitemap to include every indexable page so crawlers can discover at least 25 URLs.`,
        evidence_url: websiteFacts.sitemap.url
      });
    }
  }

  // Compliance bucket — convert misses to pointers verbatim
  if (compliance?.findings) {
    for (const f of compliance.findings) {
      if (f.status !== 'miss') continue;
      out.push({
        bucket: 'compliance', severity: f.severity,
        // Phase 7.0 · clean fact line (no URL, no double framework prefix)
        fact: truncate(f.description || (f.framework + ' ' + f.code + ' breach'), 200),
        recommendation: f.tamazia_fix_short || actionFor(f),
        evidence_url: (f.checked_urls && f.checked_urls[0]) || (f.trigger_evidence && f.trigger_evidence.url) || `https://${compliance.domain}/`,
        citation: `${f.framework} ${f.code}`,
        fine_low_gbp: f.fine_low_gbp || null,
        fine_high_gbp: f.fine_high_gbp || null,
        layman_explanation: f.layman_explanation || null,
        tamazia_fix_short: f.tamazia_fix_short || null,
        service_page_path: f.service_page_path || null,
        pricing_tier: f.pricing_tier || null,
        _source_severity: f.severity,
        _source_citation_url: f.citation_url
      });
    }
  }

  // SEO bucket — issues are already audit-ready
  if (seo?.issues) {
    for (const i of seo.issues) {
      out.push({
        bucket: 'seo', severity: i.severity,
        fact: truncate(i.fact, 200),
        recommendation: truncate(i.recommendation, 180),
        evidence_url: i.evidence_url,
        _source_severity: i.severity
      });
    }
  }

  // Ad intel issues
  if (adIntel?.issues) {
    for (const i of adIntel.issues) {
      out.push({
        bucket: 'ad_intel', severity: i.severity,
        fact: truncate(i.fact, 200),
        recommendation: truncate(i.recommendation, 180),
        evidence_url: i.evidence_url,
        _source_severity: i.severity
      });
    }
  }
  // Add positive tech-stack pointer if pixel exists
  if (adIntel?.tracking_pixels && adIntel.tracking_pixels.length > 0) {
    out.push({
      bucket: 'ad_intel', severity: 'P2',
      fact: `Detected analytics pixels on ${adIntel.domain}: ${adIntel.tracking_pixels.slice(0, 3).join(', ')}.`,
      recommendation: 'Configure conversion events for form submissions and call clicks to close the attribution loop.',
      evidence_url: `https://${adIntel.domain}/`
    });
  }

  // Public records issues
  if (publicRecords?.issues) {
    for (const i of publicRecords.issues) {
      out.push({
        bucket: 'public_records', severity: i.severity,
        fact: truncate(i.fact, 200),
        recommendation: truncate(i.recommendation, 180),
        evidence_url: i.evidence_url,
        _source_severity: i.severity
      });
    }
  }
  if (publicRecords?.rdap?.ok && publicRecords.rdap.registrar) {
    out.push({
      bucket: 'public_records', severity: 'P2',
      fact: `Domain ${publicRecords.domain} is registered with ${publicRecords.rdap.registrar} (${publicRecords.rdap.created_year ? 'created ' + publicRecords.rdap.created_year : 'creation date private'}).`,
      recommendation: 'Verify registrant contact info is current and renewal is auto-billed to avoid lapse.',
      evidence_url: `https://rdap.org/domain/${publicRecords.domain}`
    });
  }

  // Security headers
  if (security?.issues) {
    for (const i of security.issues) {
      out.push({ bucket: 'security', severity: i.severity, fact: truncate(i.fact, 200), recommendation: truncate(i.recommendation, 180), evidence_url: i.evidence_url, citation: i.citation_url, _source_severity: i.severity });
    }
  }
  if (security?.observatory?.ok && security.observatory.grade && /^[BCDEF]/.test(security.observatory.grade)) {
    out.push({
      bucket: 'security', severity: 'P1',
      fact: `Mozilla HTTP Observatory grades ${security.domain} security posture as ${security.observatory.grade} (score ${security.observatory.score}/100).`,
      recommendation: 'Move to grade A or A+ by adding CSP + HSTS + X-Frame-Options + Referrer-Policy.',
      evidence_url: `https://observatory.mozilla.org/analyze/${security.domain}`,
      citation: 'https://observatory.mozilla.org/'
    });
  }
  if (security?.hsts_preload?.ok && security.hsts_preload.status === 'unknown') {
    out.push({
      bucket: 'security', severity: 'P2',
      fact: `${security.domain} is not in the HSTS preload list (HSTS only applies after first visit).`,
      recommendation: 'Submit to hstspreload.org after publishing HSTS header with includeSubDomains + preload directives.',
      evidence_url: 'https://hstspreload.org/',
      citation: 'https://hstspreload.org/'
    });
  }

  // TLS + DNS
  if (tlsDns?.issues) {
    for (const i of tlsDns.issues) {
      out.push({ bucket: 'tls_dns', severity: i.severity, fact: truncate(i.fact, 200), recommendation: truncate(i.recommendation, 180), evidence_url: i.evidence_url, citation: i.citation_url, _source_severity: i.severity });
    }
  }

  // Technical SEO
  if (technicalSeo?.issues) {
    for (const i of technicalSeo.issues) {
      out.push({ bucket: 'technical_seo', severity: i.severity, fact: truncate(i.fact, 200), recommendation: truncate(i.recommendation, 180), evidence_url: i.evidence_url, citation: i.citation_url, _source_severity: i.severity });
    }
  }

  // Accessibility
  if (accessibility?.issues) {
    for (const i of accessibility.issues) {
      out.push({ bucket: 'accessibility', severity: i.severity, fact: truncate(i.fact, 200), recommendation: truncate(i.recommendation, 180), evidence_url: i.evidence_url, citation: i.wcag ? `WCAG ${i.wcag}` : null, _source_severity: i.severity });
    }
  }

  // Content depth
  if (contentDepth?.issues) {
    for (const i of contentDepth.issues) {
      out.push({ bucket: 'content_depth', severity: i.severity, fact: truncate(i.fact, 200), recommendation: truncate(i.recommendation, 180), evidence_url: i.evidence_url, citation: i.citation_url || (i.wcag ? `WCAG ${i.wcag}` : null), _source_severity: i.severity });
    }
  }

  // Attach Tamazia "how we fix this" link block to every pointer (bucket/citation aware)
  for (const p of out) {
    const link = tamaziaLinkFor(p);
    if (link) p.tamazia = link;
  }

  return out;
}

function actionFor(f) {
  if (f.framework === 'UK_GDPR_A13' && f.code === 'A13.2.a') return 'Add a retention period statement to the privacy notice, naming the period or the criteria used.';
  if (f.framework === 'UK_GDPR_A13' && f.code === 'A13.2.b') return 'Add a section enumerating the data subject rights (access, rectification, erasure, restriction, portability, objection).';
  if (f.framework === 'UK_GDPR_A13' && f.code === 'A13.1.b') return 'Add a contact route for data protection queries (privacy@ or dataprotection@ inbox plus DPO if applicable).';
  if (f.framework === 'UK_SRA_COC') return 'Add the required SRA disclosure to the website footer including authorisation statement and SRA number.';
  if (f.framework === 'UK_FCA_CONC25') return 'Add the FCA-required disclosures including FRN, risk warning, and representative APR where applicable.';
  if (f.framework === 'UK_PECR') return 'Add the required consent mechanism for marketing communications and electronic tracking.';
  if (f.framework === 'UK_ICO_COOKIES') return 'Add a cookie consent banner with a one-click reject and a per-category preferences screen.';
  if (f.framework === 'UK_CQC') return 'Add the CQC registration disclosure and link to the latest inspection report.';
  if (f.framework === 'UK_MHRA') return 'Add MHRA/GPhC disclosures and clearly mark prescription-only medicines with the required wording.';
  if (f.framework === 'EU_GDPR') return 'Add the missing GDPR disclosure to the privacy notice for EU prospects.';
  if (f.framework === 'US_FTC') return 'Add the FTC-required disclosures including endorsement disclaimers and a CCPA-style do-not-sell route.';
  return 'Add the missing disclosure to the privacy or terms page so the rule is satisfied on next crawl.';
}
function truncate(s, n) { s = String(s || ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; }

async function enhanceWithLLM({ scanId, lead_id, rawPointers, scannerBundle }) {
  // For Phase 6 we keep enhancement deterministic — the LLM only re-phrases pointers
  // that are too vague or too long. We never let the LLM invent new findings; the
  // hallucination guard rejects any pointer whose facts don't appear in the bundle.
  const lowQuality = rawPointers.filter(p => (p.fact || '').length > 220 || /could be|may be|might|consider/i.test(p.fact || ''));
  if (lowQuality.length === 0) return []; // happy path — raw pointers are already audit-grade
  const payload = lowQuality.map(p => ({ bucket: p.bucket, severity: p.severity, raw_fact: p.fact, raw_recommendation: p.recommendation, evidence_url: p.evidence_url, citation: p.citation }));
  const userPrompt = `Re-phrase each pointer to be specific and audit-grade, keeping the same fact and severity. Output ONLY {"pointers":[...]} where each item has keys bucket, severity, fact, recommendation, evidence_url, citation (where present). Input:\n${JSON.stringify(payload, null, 2)}`;
  const r = await llmRun({ role: 'synthesise', system: SYSTEM_PROMPT, prompt: userPrompt, max_tokens: 1200, temperature: 0.2, json: true, scan_id: scanId, lead_id });
  if (!r.ok) return [];
  let parsed; try { parsed = JSON.parse(r.text.replace(/^```json|```$/g, '').trim()); } catch (_e) { return []; }
  if (!Array.isArray(parsed.pointers)) return [];
  return parsed.pointers.map(p => ({ ...p, _from: 'llm_enhance' }));
}

function dedupeAcrossSources(list) {
  const seen = new Set(); const out = [];
  for (const p of list) {
    const key = (p.bucket + '|' + (p.fact || '').toLowerCase().replace(/\s+/g, ' ').slice(0, 80));
    if (seen.has(key)) continue;
    seen.add(key); out.push(p);
  }
  return out;
}
function groupByBucket(list) {
  const g = {}; for (const p of list) { (g[p.bucket] = g[p.bucket] || []).push(p); } return g;
}
function sevRank(s) { return s === 'P0' ? 0 : s === 'P1' ? 1 : 2; }

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--domain') out.domain = argv[++i];
    else if (argv[i] === '--sector') out.sector = argv[++i];
    else if (argv[i] === '--country') out.country = argv[++i];
    else if (argv[i] === '--company') out.company = argv[++i];
    else if (argv[i] === '--lead-id') out.lead_id = Number(argv[++i]);
    else if (argv[i] === '--max-pointers') out.max_pointers = Number(argv[++i]);
    else if (argv[i] === '--skip-llm') out.skip_llm = true;
  }
  return out;
}

if (require.main === module) {
  const opts = parseArgs(process.argv.slice(2));
  if (!opts.domain) { console.error('Usage: run.js --domain X --sector Y --country UK [--company Z] [--lead-id N] [--skip-llm]'); process.exit(2); }
  runEngine(opts)
    .then(s => { console.log(JSON.stringify({ scan_id: s.scan_id, pointer_count: s.pointer_count, p0: s.pointer_count_p0, p1: s.pointer_count_p1, p2: s.pointer_count_p2, score: s.specificity_score, latency_ms: s.total_latency_ms, cost_usd_micro: s.total_cost_usd_micro, rejected: s.rejected_count, buckets: s.buckets, first_pointers: s.pointers.slice(0, 5) }, null, 2)); })
    .catch(e => { console.error(e); process.exit(1); });
}

module.exports = { runEngine, buildCanonicalPointers };
