/** TypeScript contract for the runtime implementation in github-crypto.js. */
export interface GitHubPublicKey { key: string; key_id: string }
export interface EncryptedGitHubSecret { encrypted_value: string; key_id: string }
export type SecretMap = Record<string, string>;
