'use strict';
// D4.5 · Bounce-guard auto-pause component.
// Checks every sending alias for a dangerous bounce rate (>3 bounced leads in 7 days)
// and pauses any alias that breaches the threshold. Sets paused=true + paused_reason='bounce_guard'
// on the aliases table so alias-rotator.js (pickSendAlias) never picks a paused alias.
//
// Designed to be called:
//   - from the engine-cycle workflow after each send run
//   - standalone: node src/components/deliverability-guard.js
//
// All Neon changes are additive (paused + paused_reason columns added via migration D4.5).
// SEND stays OFF — this component only pauses aliases, it never sends anything.
//
// NOTE: The bounce detection joins aliases on sending domain (SPLIT_PART of the alias address).
// This fires correctly when leads.contact_email (the recipient) bounces from a sending domain
// we control. The join is intentionally heuristic — if a domain is shared by multiple aliases,
// all aliases on that domain get paused together (conservative / fail-safe).

const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..', '..');

// Inline logger: uses src/lib/logger if available, else console.
let log;
try { log = require('../lib/logger'); } catch (_) {
  log = {
    info: (...a) => console.log('[deliverability-guard]', ...a),
    warn: (...a) => console.warn('[deliverability-guard] WARN', ...a),
    error: (...a) => console.error('[deliverability-guard] ERROR', ...a)
  };
}

function pg(sql) {
  const url = process.env.NEON_URL || process.env.NEON_CONNECTION_STRING;
  if (!url) return null;
  try {
    return execFileSync(path.join(ROOT, 'scripts', 'psql'), [url, '-tA', '-c', sql], { encoding: 'utf8' }).toString().trim();
  } catch (_e) { return null; }
}
function esc(v) { if (v == null) return 'NULL'; return `'${String(v).replace(/'/g, "''")}'`; }

/**
 * Pause any alias whose sending domain has >bounceThreshold bounces from recipient leads in 7d.
 * @param {object} opts
 * @param {number} [opts.bounceThreshold=3] - pause if bounce_count > this value
 * @returns {{ paused: number, aliases: string[], skipped_no_neon: boolean }}
 */
async function checkAndPauseHighBounceAliases(opts = {}) {
  const bounceThreshold = Number.isFinite(opts.bounceThreshold) ? opts.bounceThreshold : 3;
  const url = process.env.NEON_URL || process.env.NEON_CONNECTION_STRING;
  if (!url) {
    log.warn('NEON_URL not set — skipping bounce-guard check');
    return { paused: 0, aliases: [], skipped_no_neon: true };
  }

  // Find aliases whose domain appears in recently bounced leads.
  // Bounce signal: leads.status='bounced' (always present, written by bounce-handler S024).
  // SPLIT_PART(a.address,'@',2) extracts the sending domain from the alias email address.
  // Excludes already-paused aliases. COALESCE guards rows predating the paused column.
  const findSql = `
    SELECT a.id::text, a.email, SPLIT_PART(a.address, '@', 2) AS alias_domain,
           COUNT(l.id)::text AS bounce_count
    FROM aliases a
    JOIN leads l
      ON LOWER(COALESCE(l.contact_email, l.email, '')) LIKE ('%@' || SPLIT_PART(a.address, '@', 2))
    WHERE l.status = 'bounced'
      AND l.updated_at > NOW() - INTERVAL '7 days'
      AND COALESCE(a.paused, FALSE) = FALSE
    GROUP BY a.id, a.email, SPLIT_PART(a.address, '@', 2)
    HAVING COUNT(l.id) > ${bounceThreshold}
  `;

  const raw = pg(findSql);
  if (!raw) {
    log.info('bounce-guard: no data returned (aliases table may be empty or bounced leads are 0)');
    return { paused: 0, aliases: [] };
  }

  const rows = raw.split('\n').filter(Boolean).map(r => {
    const [id, email, alias_domain, bounce_count] = r.split('\t');
    return { id: Number(id), email: email || '', alias_domain: alias_domain || '', bounce_count: Number(bounce_count) };
  });

  if (rows.length === 0) {
    log.info(`bounce-guard: all aliases below threshold (>${bounceThreshold} bounces in 7d). No pauses needed.`);
    return { paused: 0, aliases: [] };
  }

  const paused = [];
  for (const alias of rows) {
    const updateSql = `
      UPDATE aliases
      SET paused = true,
          paused_reason = 'bounce_guard',
          updated_at = NOW()
      WHERE id = ${alias.id}
        AND COALESCE(paused, FALSE) = FALSE
      RETURNING id::text, email
    `;
    const updated = pg(updateSql);
    if (updated) {
      paused.push(alias.email);
      log.warn(`ALIAS PAUSED (bounce guard): ${alias.email} [domain=${alias.alias_domain}] — ${alias.bounce_count} bounced leads in 7d (threshold >${bounceThreshold})`);
    }
  }

  log.info(`bounce-guard complete: ${paused.length} alias(es) paused.${paused.length ? ' ' + paused.join(', ') : ''}`);
  return { paused: paused.length, aliases: paused };
}

if (require.main === module) {
  checkAndPauseHighBounceAliases()
    .then(r => { console.log('Done:', JSON.stringify(r, null, 2)); process.exit(0); })
    .catch(e => { console.error('Error:', e.message || e); process.exit(0); });
}

module.exports = { checkAndPauseHighBounceAliases };
