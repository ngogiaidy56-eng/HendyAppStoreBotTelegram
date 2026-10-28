import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const EXTENSIONS = Object.freeze({
  '.apk': 'android', '.aab': 'android', '.ipa': 'ios',
  '.exe': 'windows', '.msix': 'windows', '.dmg': 'macos', '.pkg': 'macos',
});
const VERSION_RE = /^[0-9A-Za-z][0-9A-Za-z.+_-]{0,63}$/;

async function sha256File(filePath) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest('hex');
}

async function collectFiles(root, current = root, output = []) {
  const entries = await readdir(current, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const full = path.join(current, entry.name);
    if (entry.isSymbolicLink()) throw new Error('Release directory cannot contain symbolic links: ' + path.relative(root, full));
    if (entry.isDirectory()) {
      await collectFiles(root, full, output);
      continue;
    }
    if (!entry.isFile()) continue;
    const extension = path.extname(entry.name).toLowerCase();
    if (!Object.hasOwn(EXTENSIONS, extension)) continue;
    const info = await stat(full);
    if (info.size <= 0) throw new Error('Refusing to publish an empty release artifact: ' + path.relative(root, full));
    output.push({ full, relative: path.relative(root, full).split(path.sep).join('/'), extension, sizeBytes: info.size });
  }
  return output;
}

export async function generateReleaseManifest(directory, options = {}) {
  const root = path.resolve(directory);
  const version = String(options.version || process.env.RELEASE_VERSION || '0.0.0-dev');
  if (!VERSION_RE.test(version)) throw new Error('Release version must be 1-64 safe characters: letters, digits, dot, plus, underscore or hyphen.');
  const gitSha = String(options.gitSha || process.env.GITHUB_SHA || '').trim();
  if (gitSha && !/^[a-f0-9]{7,40}$/i.test(gitSha)) throw new Error('GITHUB_SHA must be a hexadecimal commit SHA.');
  const info = await stat(root).catch(() => null);
  if (!info?.isDirectory()) throw new Error('Release directory does not exist: ' + root);

  const files = await collectFiles(root);
  if (!files.length) throw new Error('No supported release files found (.apk, .aab, .ipa, .exe, .msix, .dmg, .pkg). Refusing to publish an empty release.');
  const artifacts = [];
  for (const item of files) {
    artifacts.push({
      fileName: path.posix.basename(item.relative),
      path: item.relative,
      platform: EXTENSIONS[item.extension],
      format: item.extension.slice(1),
      sizeBytes: item.sizeBytes,
      sha256: await sha256File(item.full),
    });
  }
  const manifest = {
    schemaVersion: 1,
    releaseVersion: version,
    gitSha: gitSha || null,
    generatedAt: new Date().toISOString(),
    artifactCount: artifacts.length,
    artifacts,
  };
  await writeFile(path.join(root, 'release-manifest.json'), JSON.stringify(manifest, null, 2) + '\n', { mode: 0o644 });
  await writeFile(path.join(root, 'SHA256SUMS'), artifacts.map((artifact) => artifact.sha256 + '  ' + artifact.path).join('\n') + '\n', { mode: 0o644 });
  return manifest;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const directory = process.argv[2] || 'release-output';
  try {
    const manifest = await generateReleaseManifest(directory);
    console.log('Generated release-manifest.json for ' + manifest.artifactCount + ' artifact(s), version ' + manifest.releaseVersion + '.');
    for (const artifact of manifest.artifacts) console.log(artifact.platform + '\t' + artifact.fileName + '\t' + artifact.sha256);
  } catch (error) {
    console.error('Release manifest failed: ' + (error instanceof Error ? error.message : 'unknown error'));
    process.exitCode = 1;
  }
}
