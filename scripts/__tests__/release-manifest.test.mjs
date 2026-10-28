import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { generateReleaseManifest } from '../generate-release-manifest.mjs';

async function temporaryDirectory() {
  return mkdtemp(path.join(os.tmpdir(), 'hendy-release-manifest-'));
}

test('generates SHA-256 manifest for supported artifacts and ignores unrelated files', async () => {
  const root = await temporaryDirectory();
  try {
    await mkdir(path.join(root, 'nested'));
    await writeFile(path.join(root, 'app.apk'), Buffer.from('signed android artifact'));
    await writeFile(path.join(root, 'nested', 'desktop.exe'), Buffer.from('signed windows artifact'));
    await writeFile(path.join(root, 'README.txt'), 'not a release file');
    const manifest = await generateReleaseManifest(root, { version: '2.4.1-rc.2', gitSha: 'abcdef0123456789' });
    assert.equal(manifest.artifactCount, 2);
    assert.deepEqual(manifest.artifacts.map((item) => item.platform).sort(), ['android', 'windows']);
    assert.ok(manifest.artifacts.every((item) => /^[a-f0-9]{64}$/.test(item.sha256)));
    assert.match(await readFile(path.join(root, 'SHA256SUMS'), 'utf8'), /app\.apk/);
    assert.equal(JSON.parse(await readFile(path.join(root, 'release-manifest.json'), 'utf8')).releaseVersion, '2.4.1-rc.2');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('rejects empty artifacts rather than publishing them', async () => {
  const root = await temporaryDirectory();
  try {
    await writeFile(path.join(root, 'empty.apk'), '');
    await assert.rejects(() => generateReleaseManifest(root, { version: '1.0.0' }), /empty release artifact/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('rejects unsupported version strings and empty release directories', async () => {
  const root = await temporaryDirectory();
  try {
    await writeFile(path.join(root, 'app.exe'), 'binary');
    await assert.rejects(() => generateReleaseManifest(root, { version: '../latest' }), /Release version/);
    const empty = path.join(root, 'empty');
    await mkdir(empty);
    await assert.rejects(() => generateReleaseManifest(empty), /No supported release files/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
