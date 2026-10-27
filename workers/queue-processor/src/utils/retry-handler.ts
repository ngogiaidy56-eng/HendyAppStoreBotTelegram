export const MAX_ATTEMPTS = 5;
export function retryDelaySeconds(attempt: number) { return Math.min(3600, 15 * (2 ** Math.max(0, attempt - 1))); }
export function isRetryable(error: unknown) { const text=String((error as Error)?.message||error); return !/unsupported job|not configured|invalid payload|forbidden|unauthorized/i.test(text); }
