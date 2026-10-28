import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const directory = path.resolve(process.argv[2] || 'release-output');
const platform = String(process.argv[3] || '').toLowerCase();
const version = String(process.env.RELEASE_VERSION || '').trim() || '0.0.0-dev';
const allowedPlatforms = new Set(['android', 'ios', 'windows', 'macos']);
if (!allowedPlatforms.has(platform)) throw new Error('Usage: node scripts/upload-release-r2.mjs <artifact-directory> <android|ios|windows|macos>');
if (!/^[0-9A-Za-z][0-9A-Za-z.+_-]{0,63}$/.test(version)) throw new Error('RELEASE_VERSION contains unsupported characters.');
const accountId = String(process.env.CLOUDFLARE_ACCOUNT_ID || '').trim();
const accessKey = String(process.env.R2_ACCESS_KEY_ID || '').trim();
const secretKey = String(process.env.R2_SECRET_ACCESS_KEY || '').trim();
const bucket = String(process.env.R2_BUCKET_NAME || 'hendy-app-releases').trim();
if (!/^[a-f0-9]{32}$/i.test(accountId)) throw new Error('CLOUDFLARE_ACCOUNT_ID must be the 32-character Cloudflare account ID.');
if (!accessKey || !secretKey) throw new Error('R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY must be configured as Actions secrets.');
if (!/^[a-z0-9.-]{3,63}$/.test(bucket)) throw new Error('R2_BUCKET_NAME is invalid.');

const manifestPath = path.join(directory, 'release-manifest.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
if (manifest.releaseVersion !== version || !Array.isArray(manifest.artifacts) || !manifest.artifacts.length) {
  throw new Error('Manifest/version mismatch or no artifacts; run generate-release-manifest.mjs before upload.');
}
if (manifest.artifacts.some((artifact) => artifact.platform !== platform)) {
  throw new Error('Manifest includes artifacts for another platform; refusing to upload to the wrong R2 prefix.');
}
const extensionPlatforms = { '.apk':'android', '.aab':'android', '.ipa':'ios', '.exe':'windows', '.msix':'windows', '.dmg':'macos', '.pkg':'macos' };
for (const artifact of manifest.artifacts) {
  const relativePath = String(artifact.path || '');
  if (!relativePath || path.isAbsolute(relativePath) || relativePath.split(/[\\/]/).includes('..')) {
    throw new Error('Manifest contains an unsafe artifact path.');
  }
  const filePath = path.resolve(directory, relativePath);
  if (!filePath.startsWith(directory + path.sep)) throw new Error('Manifest path escaped the release directory.');
  const fileInfo = await lstat(filePath);
  if (!fileInfo.isFile() || fileInfo.isSymbolicLink() || fileInfo.size !== Number(artifact.sizeBytes)) {
    throw new Error('Artifact file type or byte size does not match manifest: ' + relativePath);
  }
  const extension = path.extname(filePath).toLowerCase();
  if (extensionPlatforms[extension] !== platform || !/^[a-f0-9]{64}$/.test(String(artifact.sha256 || ''))) {
    throw new Error('Artifact format/platform or SHA-256 field is invalid: ' + relativePath);
  }
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(filePath)) digest.update(chunk);
  if (digest.digest('hex') !== artifact.sha256) throw new Error('SHA-256 mismatch: ' + relativePath);
}
const contents = await readdir(directory, { withFileTypes: true });
for (const entry of contents) {
  if (entry.isSymbolicLink()) throw new Error('Release upload directory cannot contain symbolic links.');
}
const info = await stat(directory);
if (!info.isDirectory()) throw new Error('Artifact path must be a directory.');
const endpoint = 'https://' + accountId + '.r2.cloudflarestorage.com';
const prefix = 'releases/' + platform + '/' + version + '/';
const args = ['s3', 'cp', directory, 's3://' + bucket + '/' + prefix, '--recursive', '--endpoint-url', endpoint, '--region', 'auto', '--no-progress',
  '--exclude', '*', '--include', '*.apk', '--include', '*.aab', '--include', '*.ipa', '--include', '*.exe', '--include', '*.msix', '--include', '*.dmg', '--include', '*.pkg', '--include', 'release-manifest.json', '--include', 'SHA256SUMS'];
const command = process.platform === 'win32' ? 'aws.exe' : 'aws';
const result = spawnSync(command, args, {
  stdio: 'inherit',
  env: { ...process.env, AWS_ACCESS_KEY_ID: accessKey, AWS_SECRET_ACCESS_KEY: secretKey, AWS_DEFAULT_REGION: 'auto', AWS_EC2_METADATA_DISABLED: 'true' },
  shell: process.platform === 'win32',
});
if (result.error) throw new Error('AWS CLI/R2 upload could not start: ' + result.error.message);
if (result.status !== 0) throw new Error('R2 upload failed (AWS CLI exit ' + result.status + '). No upload success is assumed.');
console.log('Uploaded ' + manifest.artifactCount + ' verified artifact(s) and manifest to s3://' + bucket + '/' + prefix);
