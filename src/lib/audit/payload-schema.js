'use strict';
/**
 * THE WRITE SEAM IS THE LAST HONEST PLACE.
 *
 * Everything upstream of this is a best effort: a crawl that may be bot-blocked, an LLM that may be rate-limited, a
 * register that may be down. This is the point where a best effort becomes A LEGAL DOCUMENT ADDRESSED TO A LAW FIRM.
 * After this line it is on a managing partner's screen and it is too late.
 *
 * Every one of these rules exists because the exact thing it forbids ALREADY SHIPPED:
 *
 *   company: 'Kingsleynapley'      — the domain stem, because no firm-name resolver existed.
 *   company: 'Bristol Office'      — a page heading.
 *   regulator: 'Sector regulator'  — the literal placeholder, printed on 51% of the catalogue.
 *   binding: 'Statute'             — a GUESS, applied to the SRA's rulebook.
 *   engine_version: v24            — a stale worker, silently adopting an old row.
 *   findings with no adjudication  — the report said the breaches had been reviewed. They had not.
 *
 * Zod turns each of those from "something I must remember to check" into "the row cannot be written".
 * A payload that fails here is a DRAFT. It is never a compliance report.
 */
const { z } = require('zod');

// Placeholders that must never reach a client. Each one shipped.
const FORBIDDEN_NAMES = /^(sector regulator|unknown|n\/a|none|null|undefined|office|home|contact|about|menu|the firm|company)$/i;

// PAGE FURNITURE. The live audit shipped addressed to "Bristol Office" — a page HEADING, not a firm. My first cut
// of this schema anchored the whole string, so "Bristol Office" sailed straight through the check written to stop
// exactly it. A heading is a real word followed by furniture; the furniture is what gives it away.
const PAGE_FURNITURE = /\b(office|offices|home|homepage|contact|contact us|about|about us|menu|navigation|search|login|careers|our team|locations?)\s*$/i;

const Finding = z.object({
  framework_short: z.string().min(1),
  severity: z.string().optional().nullable(),
  evidence_quote: z.string().optional().nullable(),
  observed: z.boolean().optional(),
  adjudicated: z.boolean().optional(),
}).passthrough()
  .refine(
    (f) => f.observed === true || f.adjudicated === true || !f.evidence_quote,
    { message: 'a text-derived finding carries an evidence_quote but NO adjudication — the report would tell the firm its breaches were reviewed when they were not' },
  );

const AuditPayload = z.object({
  // WHO. A name that is a page heading or a domain stem is not a firm.
  company: z.string().min(2)
    .refine((s) => !FORBIDDEN_NAMES.test(s.trim()), { message: 'company is a placeholder ("Unknown", "N/A")' })
    .refine((s) => !PAGE_FURNITURE.test(s.trim()), { message: 'company looks like a PAGE HEADING, not a firm ("Bristol Office") — this exact string shipped to a client' })
    .nullable().optional(),

  // WHICH ENGINE. A stale stamp means the DB gate rejects the row anyway; catching it here says WHY.
  engine_version: z.string().regex(/^v\d+\.\d+/, 'engine_version missing or malformed'),

  // THE LAW WAS CROSS-VERIFIED. The DB trigger already rejects a payload with no llm_verify; this names it.
  llm_verify: z.object({}).passthrough(),

  // THE CATALOGUE TRUTH TRAVELS WITH THE AUDIT — never a renderer guess.
  framework_meta: z.record(z.string(), z.object({
    name: z.string().nullable(),
    regulator: z.string()
      .refine((s) => !FORBIDDEN_NAMES.test(s.trim()), { message: 'regulator is the literal placeholder "Sector regulator" — omit it instead of guessing' })
      .nullable(),
    binding_type: z.string().nullable(),
    section_ref: z.string().nullable(),
  }).passthrough()).optional(),

  findings: z.array(Finding).optional(),

  // THE CONTRACT. A required stage that did not run makes this a draft.
  stage_manifest: z.object({ sendable: z.boolean() }).passthrough().optional(),
}).passthrough();

/**
 * Returns { ok, errors[] }. Never throws — a schema crash must not become a mint crash.
 * The caller decides: block the write, or write it flagged unsendable.
 */
function validatePayload(payload) {
  try {
    const r = AuditPayload.safeParse(payload);
    if (r.success) return { ok: true, errors: [] };
    return {
      ok: false,
      errors: r.error.issues.map((i) => (i.path.join('.') || '(root)') + ': ' + i.message),
    };
  } catch (e) {
    return { ok: false, errors: ['schema threw: ' + String((e && e.message) || e)] };
  }
}

module.exports = { validatePayload, AuditPayload, FORBIDDEN_NAMES, PAGE_FURNITURE };
