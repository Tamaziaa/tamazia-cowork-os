#!/usr/bin/env node
// S023 mail-tester-runner (Phase 4 task 4.5.1)
// Schedules a real mail-tester.com check by sending one email from the named alias
// to the rotating mail-tester address, then polls the result endpoint after 30s.
//
// In Phase 4 we ship the runner with a stub HTTP layer. The live SMTP send happens via the
// n8n W0/W1 sender once the alias-to-mailtester address path is wired (Phase 4 Aman action).

const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..', '..', '..', '..');
function pgPath() { return path.resolve(ROOT, 'scripts', 'psql'); }
function pg(sql) {
  const url = process.env.NEON_URL || process.env.NEON_CONNECTION_STRING;
  if (!url) return null;
  try { return execFileSync(pgPath(), [url, '-tA', '-c', sql], { encoding: 'utf8' }).toString().trim(); } catch (_e) { return null; }
}

const MAIL_TESTER_ADDRESS = process.env.MAIL_TESTER_ADDRESS || 'test-pending-runner@srv1.mail-tester.com';

function scheduleTest({ alias_id, alias_email }) {
  // n8n side fires the actual send through W0. Here we log intent + a tracking token.
  const token = `mt-${Date.now()}-${alias_id}`;
  return { alias_id, alias_email, mail_tester_address: MAIL_TESTER_ADDRESS, tracking_token: token };
}

function recordScore({ alias_id, score, details }) {
  if (typeof score !== 'number' || score < 0 || score > 10) throw new Error('score 0..10 required');
  pg(`UPDATE alias_health SET mail_tester_score=${score}, mail_tester_at=NOW(), notes=COALESCE(notes,'') || E'\nmail-tester: ${score} ${(details || '').replace(/'/g, "''").slice(0, 200)}' WHERE alias_id=${alias_id} AND id=(SELECT MAX(id) FROM alias_health WHERE alias_id=${alias_id})`);
  return { alias_id, score };
}

if (require.main === module) {
  const argv = process.argv.slice(2);
  if (argv[0] === '--schedule') {
    const alias_id = Number(argv[argv.indexOf('--alias-id') + 1] || 0);
    const alias_email = argv[argv.indexOf('--alias-email') + 1] || '';
    console.log(JSON.stringify(scheduleTest({ alias_id, alias_email })));
  } else if (argv[0] === '--record') {
    const alias_id = Number(argv[argv.indexOf('--alias-id') + 1] || 0);
    const score = Number(argv[argv.indexOf('--score') + 1] || 0);
    const details = argv[argv.indexOf('--details') + 1] || '';
    console.log(JSON.stringify(recordScore({ alias_id, score, details })));
  } else {
    console.error('Usage: run.js --schedule --alias-id N --alias-email X@Y  OR  --record --alias-id N --score 9.2 --details "..."');
    process.exit(2);
  }
}

module.exports = { scheduleTest, recordScore, MAIL_TESTER_ADDRESS };
