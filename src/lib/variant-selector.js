// variant-selector.js — chooses body + subject variants per (sector, touch).
// Allocation: deterministic by SHA1(lead_id) % 100 across allocation_pct buckets.
// On reply-rate degradation (Phase 3 task 3.2.5) variants flip active=false; the selector
// then re-renormalises allocation across remaining active variants.

const crypto = require('crypto');
const path = require('path');
const { execSync, execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');

function pgPath() { return path.resolve(ROOT, 'scripts', 'psql'); }

function loadActiveVariants(sector, touch) {
  const url = process.env.NEON_URL || process.env.NEON_CONNECTION_STRING;
  if (!url) return [];
  const sql = `SELECT id, variant_letter, allocation_pct, subject_template, body_template FROM template_variants WHERE workspace_id=1 AND sector='${sector}' AND touch=${touch} AND active=TRUE ORDER BY variant_letter`;
  try {
    const raw = execFileSync(pgPath(), [url, '-tA', '-c', sql], { encoding: 'utf8' }).toString().trim();
    if (!raw) return [];
    return raw.split('\n').filter(Boolean).map(line => {
      const [id, letter, alloc, subj, body] = line.split('\t');
      return { id: Number(id), letter, alloc: Number(alloc), subject: subj, body };
    });
  } catch (_e) { return []; }
}

function pickVariant(leadId, variants) {
  if (!variants.length) return null;
  const total = variants.reduce((a, v) => a + v.alloc, 0) || 1;
  const bucket = Number(BigInt('0x' + crypto.createHash('sha1').update(String(leadId || 0)).digest('hex').slice(0, 8)) % BigInt(total));
  let acc = 0;
  for (const v of variants) {
    acc += v.alloc;
    if (bucket < acc) return v;
  }
  return variants[variants.length - 1];
}

function loadActiveSubjectVariants(sector, touch) {
  const url = process.env.NEON_URL || process.env.NEON_CONNECTION_STRING;
  if (!url) return [];
  const sql = `SELECT id, variant_letter, allocation_pct, subject_template FROM subject_variants WHERE workspace_id=1 AND sector='${sector}' AND touch=${touch} AND active=TRUE ORDER BY variant_letter`;
  try {
    const raw = execFileSync(pgPath(), [url, '-tA', '-c', sql], { encoding: 'utf8' }).toString().trim();
    if (!raw) return [];
    return raw.split('\n').filter(Boolean).map(line => {
      const [id, letter, alloc, subj] = line.split('\t');
      return { id: Number(id), letter, alloc: Number(alloc), subject: subj };
    });
  } catch (_e) { return []; }
}

function pickSubjectVariant(leadId, variants, deterministicOffset = 'subject') {
  if (!variants.length) return null;
  const total = variants.reduce((a, v) => a + v.alloc, 0) || 1;
  const bucket = Number(BigInt('0x' + crypto.createHash('sha1').update(deterministicOffset + ':' + String(leadId || 0)).digest('hex').slice(0, 8)) % BigInt(total));
  let acc = 0;
  for (const v of variants) {
    acc += v.alloc;
    if (bucket < acc) return v;
  }
  return variants[variants.length - 1];
}

// Subject deduplication: G8. Don't send the same normalised subject to the same
// recipient_domain within 90 days, even across workspaces.
function normaliseSubject(subject) {
  return String(subject || '').toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 250);
}

function isSubjectAllowedForDomain(subject, recipientDomain) {
  const url = process.env.NEON_URL || process.env.NEON_CONNECTION_STRING;
  if (!url) return true;
  const norm = normaliseSubject(subject).replace(/'/g, "''");
  const dom  = String(recipientDomain || '').replace(/'/g, "''");
  const sql  = `SELECT 1 FROM subject_domain_dedupe WHERE recipient_domain='${dom}' AND subject_normalised='${norm}' AND last_used_at > NOW() - INTERVAL '90 days' LIMIT 1`;
  try {
    const raw = execFileSync(pgPath(), [url, '-tA', '-c', sql], { encoding: 'utf8' }).toString().trim();
    return raw.length === 0;
  } catch (_e) { return true; }
}

function recordSubjectUse(subject, recipientDomain, workspaceId = 1) {
  const url = process.env.NEON_URL || process.env.NEON_CONNECTION_STRING;
  if (!url) return;
  const norm = normaliseSubject(subject).replace(/'/g, "''");
  const dom  = String(recipientDomain || '').replace(/'/g, "''");
  const sql  = `INSERT INTO subject_domain_dedupe (workspace_id, recipient_domain, subject_normalised, last_used_at) VALUES (${workspaceId}, '${dom}', '${norm}', NOW()) ON CONFLICT (recipient_domain, subject_normalised) DO UPDATE SET last_used_at = NOW()`;
  try { execFileSync(pgPath(), [url, '-tA', '-c', sql], { encoding: 'utf8' }); } catch (_e) { /* */ }
}

module.exports = {
  loadActiveVariants,
  pickVariant,
  loadActiveSubjectVariants,
  pickSubjectVariant,
  isSubjectAllowedForDomain,
  recordSubjectUse,
  normaliseSubject,
};
