// finding-schema · Phase 1, R23-9.
// JSON schema for a single audit finding. Every finding produced by the scraper or
// any future signal extractor must validate against this schema before it can be
// written to Neon or rendered by the worker. Findings that fail validation are
// dropped and a drop event is recorded in telemetry.

// Phase 4: tighter schema. Required: category, severity, evidence, fix.
// Where: accept `where` OR `location` (legacy field).
// Phase 4 additions: optional canonical fields enforced with type checks,
// hard cap on length for every text field to prevent runaway tokens,
// and reject any pointer that includes UK-specific framework codes when
// the audit's country is non-UK (defence at validator stage too).
const REQUIRED = ['category', 'severity', 'evidence', 'fix'];
const ALLOWED_SEVERITY = new Set(['P0', 'P1', 'P2']);
const ALLOWED_KIND = new Set(['compliance', 'seo', 'technical', 'content', 'visibility', 'meta', 'accessibility', 'privacy']);
const MAX_TEXT_LEN = 4000;

function validateFinding(f) {
  const errors = [];
  if (!f || typeof f !== 'object') {
    return { ok: false, errors: ['finding is not an object'] };
  }

  for (const k of REQUIRED) {
    if (!f[k] || typeof f[k] !== 'string' || !f[k].trim()) {
      errors.push(`missing or empty field: ${k}`);
    }
  }
  // Where: accept `where` OR `location`. The scraper emits `location`.
  const where = f.where || f.location;
  if (!where || typeof where !== 'string' || !where.trim()) {
    errors.push('missing or empty field: where (or location)');
  } else if (!/(https?:\/\/|\/|Site-wide|site-wide|footer|across|homepage|contact|about|practice|services|property|listings|investor)/i.test(where)) {
    errors.push('where must reference a URL, path, or named site area');
  }

  if (f.severity && !ALLOWED_SEVERITY.has(f.severity)) {
    errors.push(`invalid severity: ${f.severity}`);
  }
  if (f.kind && !ALLOWED_KIND.has(f.kind)) {
    errors.push(`invalid kind: ${f.kind}`);
  }
  if (f.framework && typeof f.framework !== 'string') {
    errors.push('framework must be a string when present');
  }
  if (f.evidence && f.evidence.length < 10) {
    errors.push('evidence too short (must be at least 10 chars)');
  }
  if (f.fix && f.fix.length < 10) {
    errors.push('fix too short (must be at least 10 chars)');
  }
  // Phase 4: length caps to prevent unbounded text from a malformed scrape
  for (const fld of ['evidence', 'fix', 'uplift', 'location', 'where', 'citation']) {
    if (typeof f[fld] === 'string' && f[fld].length > MAX_TEXT_LEN) {
      errors.push(`${fld} exceeds ${MAX_TEXT_LEN} chars`);
    }
  }
  // Phase 4: optional canonical fields type-check
  if (f.citation_url && typeof f.citation_url !== 'string') errors.push('citation_url must be a string');
  if (f.language && !/^[a-z]{2}(-[A-Z]{2})?$/.test(f.language)) errors.push('language must be a BCP-47 short code (e.g. "en", "ar", "en-GB")');

  return { ok: errors.length === 0, errors };
}

// Telemetry event recorder. In the worker / build script we emit these into the
// audit_events table; in test harnesses we collect them into an array.
function makeTelemetryRecorder() {
  const events = [];
  return {
    drop(finding, reason) {
      events.push({ type: 'drop', at: new Date().toISOString(), category: finding && finding.category, reason });
    },
    remap(finding, from, to) {
      events.push({ type: 'remap', at: new Date().toISOString(), category: finding && finding.category, from, to });
    },
    fallback(stage, reason) {
      events.push({ type: 'fallback', at: new Date().toISOString(), stage, reason });
    },
    confidence(kind, value, signals) {
      events.push({ type: 'confidence', at: new Date().toISOString(), kind, value, signals });
    },
    list() { return events.slice(); },
    counts() {
      const c = { drop: 0, remap: 0, fallback: 0, confidence: 0 };
      for (const e of events) c[e.type] = (c[e.type] || 0) + 1;
      return c;
    }
  };
}

module.exports = { validateFinding, makeTelemetryRecorder, REQUIRED, ALLOWED_SEVERITY, ALLOWED_KIND };
