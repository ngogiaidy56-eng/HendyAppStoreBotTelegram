export type FeatureFlag = { key: string; enabled: boolean | number; rolloutPercent?: number };

/** Stable rollout bucket so a user does not flip between requests. */
export function rolloutBucket(subject: string, flagKey: string): number {
  const input = `${flagKey}:${subject}`;
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % 100;
}

export function evaluateFlag(flag: FeatureFlag | undefined, subject = 'anonymous'): boolean {
  if (!flag || !(flag.enabled === true || flag.enabled === 1)) return false;
  const percent = Math.max(0, Math.min(100, Number(flag.rolloutPercent ?? 100)));
  return rolloutBucket(subject, flag.key) < percent;
}

export function evaluateFlags(flags: FeatureFlag[], subject = 'anonymous'): Record<string, boolean> {
  return Object.fromEntries(flags.map((flag) => [flag.key, evaluateFlag(flag, subject)]));
}
