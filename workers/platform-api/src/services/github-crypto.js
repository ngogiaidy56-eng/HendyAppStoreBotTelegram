/**
 * Encrypts Actions secrets using GitHub's repository public key.
 * libsodium is dynamically imported so ordinary API routes do not initialise WASM.
 */
export async function encryptGitHubSecret(publicKeyBase64, plaintext) {
  if (typeof plaintext !== 'string') throw new TypeError('Secret value must be a string');
  const loaded = await import('libsodium-wrappers');
  const sodium = loaded.default ?? loaded;
  await sodium.ready;
  const publicKey = sodium.from_base64(publicKeyBase64, sodium.base64_variants.ORIGINAL);
  const encrypted = sodium.crypto_box_seal(sodium.from_string(plaintext), publicKey);
  return sodium.to_base64(encrypted, sodium.base64_variants.ORIGINAL);
}
