const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

const r2 = process.env.R2_ENDPOINT
  ? new S3Client({
      region: 'auto',
      endpoint: process.env.R2_ENDPOINT,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
      },
    })
  : null;

async function putAudit(slug, hash, json) {
  if (!r2) return false;
  await r2.send(new PutObjectCommand({
    Bucket: process.env.R2_BUCKET,
    Key: `audits/${slug}/${hash}.json`,
    Body: JSON.stringify(json),
    ContentType: 'application/json',
  }));
  return true;
}

module.exports = { putAudit };
