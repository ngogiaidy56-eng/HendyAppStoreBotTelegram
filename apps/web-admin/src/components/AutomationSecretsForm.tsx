import React, { useMemo, useState } from 'react';

const secretKeys = [
  'BOT_TOKEN','SESSION_SECRET','ADMIN_TELEGRAM_IDS',
  'BANK_WEBHOOK_SECRET','BANK_API_KEY','BANK_API_SECRET','GITHUB_WEBHOOK_SECRET',
  'CLOUDFLARE_API_TOKEN','CLOUDFLARE_ACCOUNT_ID','HENDY_GITHUB_TOKEN',
  'ANDROID_KEYSTORE_BASE64','ANDROID_KEYSTORE_PASSWORD','ANDROID_KEY_ALIAS','ANDROID_KEY_PASSWORD',
  'IOS_CERTIFICATE_BASE64','IOS_CERTIFICATE_PASSWORD','IOS_PROVISIONING_PROFILE_BASE64',
  'WINDOWS_PFX_BASE64','WINDOWS_PFX_PASSWORD','MACOS_CERTIFICATE_BASE64','MACOS_CERTIFICATE_PASSWORD',
  'APPLE_TEAM_ID','APPLE_ID','APPLE_APP_SPECIFIC_PASSWORD','R2_ACCESS_KEY_ID','R2_SECRET_ACCESS_KEY','SENTRY_AUTH_TOKEN',
] as const;
type SecretKey = typeof secretKeys[number];
type Props = { token?: string };

export default function AutomationSecretsForm({ token = '' }: Props) {
  const [values, setValues] = useState<Partial<Record<SecretKey,string>>>({});
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const pending = useMemo(() => secretKeys.filter((key) => Boolean(values[key]?.trim())), [values]);

  async function submit(event: React.FormEvent) {
    event.preventDefault(); setError(''); setMessage('');
    if (!confirmed) { setError('Bạn cần xác nhận rõ trước khi gửi secrets lên GitHub.'); return; }
    if (!pending.length) { setError('Nhập ít nhất một giá trị secret.'); return; }
    setBusy(true);
    try {
      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL || ''}/api/admin/github-secrets`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ confirm: true, secrets: Object.fromEntries(pending.map((key) => [key, values[key]])) }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error?.message || 'Không đồng bộ được secrets.');
      setMessage(`Đã mã hóa và đồng bộ ${data.count} secrets lên GitHub: ${(data.syncedKeys || []).join(', ')}. Chạy workflow Sync Runtime Secrets riêng nếu muốn đẩy các giá trị đã lưu sang Cloudflare.`);
      setValues({}); setConfirmed(false);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  return <section className="panel"><h2>Automation Secrets</h2>
    <p>Giá trị chỉ được gửi qua HTTPS, mã hóa bằng public key của GitHub repository (libsodium sealed box), không lưu plaintext trong D1 và không được đọc lại hoặc ghi vào audit log. Không nhập token có quyền cao hơn mức cần thiết.</p>
    <form onSubmit={submit}>
      <div className="secret-grid">{secretKeys.map((key) => <label key={key}>{key}<input type="password" autoComplete="new-password" spellCheck={false} value={values[key] || ''} onChange={(event) => setValues((current) => ({ ...current, [key]: event.target.value }))} placeholder="Để trống nếu không cập nhật" /></label>)}</div>
      <label className="confirm-row"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /> Tôi xác nhận sẽ ghi đè các GitHub Actions secrets có tên tương ứng.</label>
      <button type="submit" disabled={busy || !confirmed || pending.length === 0}>{busy ? 'Đang mã hóa và đồng bộ…' : `Đồng bộ ${pending.length} secrets`}</button>
    </form>
    {error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}
    <small>Giới hạn 26 tên secret được allowlist phía server; mỗi giá trị tối đa 40 KiB. Secret PAT dùng nội bộ để gọi GitHub API (HENDY_GITHUB_TOKEN) phải được cấu hình thủ công, không thể tự tạo ra từ giao diện này.</small>
  </section>;
}
