const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

// Bound every R2 request so a stalled upload during minting can't hang the mint-worker indefinitely.
const R2_TIMEOUT_MS = Math.max(2000, Number(process.env.R2_TIMEOUT_MS || 30000));
const r2 = process.env.R2_ENDPOINT
  ? new S3Client({
      region: 'auto',
      endpoint: process.env.R2_ENDPOINT,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
      },
      requestHandler: { requestTimeout: R2_TIMEOUT_MS, connectionTimeout: 10000 },
      maxAttempts: 3,
    })
  : null;

// Returns true on success, false on any failure (missing config, timeout, error). Never throws — the
// caller (mint-worker) treats R2 as a best-effort mirror; Neon/the worker holds the canonical payload.
async function putAudit(slug, hash, json) {
  if (!r2) return false;
  try {
    await r2.send(new PutObjectCommand({
      Bucket: process.env.R2_BUCKET,
      Key: `audits/${slug}/${hash}.json`,
      Body: JSON.stringify(json),
      ContentType: 'application/json',
    }));
    return true;
  } catch (e) {
    console.error('[r2] putAudit failed (non-fatal):', String((e && e.message) || e).slice(0, 200));
    return false;
  }
}

module.exports = { putAudit };
