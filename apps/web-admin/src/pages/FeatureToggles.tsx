import React, { useEffect, useState } from 'react';

type Flag = { flag_key: string; description: string; enabled: number; rollout_percent: number };
const API = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

export default function FeatureToggles({ token }: { token: string }) {
  const [flags, setFlags] = useState<Flag[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  async function load() {
    const response = await fetch(`${API}/api/admin/features`, { headers: { authorization: `Bearer ${token}` } });
    const data = await response.json();
    if (!response.ok) throw Error(data.error?.message || 'Không tải được feature flags');
    setFlags(data.features || []);
  }
  useEffect(() => { load().catch((e) => setError(e.message)); }, [token]);
  async function save(flag: Flag, patch: Partial<Pick<Flag, 'enabled' | 'rollout_percent'>>) {
    setBusy(flag.flag_key); setError('');
    try {
      const next = { ...flag, ...patch };
      const response = await fetch(`${API}/api/admin/features`, {
        method: 'PUT', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ key: next.flag_key, description: next.description, enabled: !!next.enabled, rolloutPercent: Number(next.rollout_percent) }),
      });
      const data = await response.json();
      if (!response.ok) throw Error(data.error?.message || 'Cập nhật thất bại');
      await load();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(null); }
  }
  return <section className="panel"><h2>Cấu hình tính năng</h2><p>Bật/tắt tính năng và triển khai theo tỷ lệ phần trăm. Mọi thay đổi được lưu trong D1 và audit log.</p>
    {error && <p role="alert" className="error-text">{error}</p>}
    {flags.map((flag) => <article className="setting-row" key={flag.flag_key}>
      <div className="setting-info"><b>{flag.flag_key}</b><p>{flag.description || 'Không có mô tả'}</p><label className="rollout-label">Tỷ lệ triển khai: {flag.rollout_percent}%
        <input aria-label={`Tỷ lệ triển khai ${flag.flag_key}`} type="range" min="0" max="100" step="5" value={flag.rollout_percent} disabled={busy === flag.flag_key || !flag.enabled} onChange={(event) => setFlags((rows) => rows.map((row) => row.flag_key === flag.flag_key ? { ...row, rollout_percent: Number(event.target.value) } : row))} />
      </label><button className="secondary-action" disabled={busy === flag.flag_key || !flag.enabled} onClick={() => save(flag, { rollout_percent: flag.rollout_percent })}>Lưu rollout</button></div>
      <button disabled={busy === flag.flag_key} onClick={() => save(flag, { enabled: flag.enabled ? 0 : 1 })}>{busy === flag.flag_key ? 'Đang lưu…' : flag.enabled ? 'Đang bật' : 'Đang tắt'}</button>
    </article>)}
  </section>;
}
