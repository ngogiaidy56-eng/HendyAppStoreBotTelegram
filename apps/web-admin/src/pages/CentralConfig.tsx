import React, { useEffect, useState } from 'react';
import AutomationSecretsForm from '../components/AutomationSecretsForm';

const API = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
type ConfigValues = Record<string, string>;
type Field = { key: string; label: string; help?: string; type?: 'text' | 'number' | 'textarea' | 'boolean'; placeholder?: string };

const EDITABLE_KEYS = [
  'MINIAPP_DOMAIN_OVERRIDE','ADMIN_DOMAIN_OVERRIDE','STOREFRONT_DOMAIN_OVERRIDE','VITE_API_BASE_URL',
  'BOT_USERNAME','MIN_DEPOSIT_VND','MAX_DEPOSIT_VND','DAILY_CHECKIN_REWARD_VND','REFERRAL_REWARD_VND',
  'SESSION_TTL_SECONDS','MAX_INIT_DATA_AGE_SECONDS','BANK_ID','BANK_ACCOUNT_NUMBER','BANK_ACCOUNT_NAME','BANK_SYNC_URL',
  'TASKS_CONFIG_JSON','MINIGAME_CONFIG_JSON','MAINTENANCE_MESSAGE','TASKS_ENABLED','MINIGAME_ENABLED',
  'AUTO_REDEPLOY_WORKERS_AFTER_DOMAIN_SYNC',
];

const FIELDS: { title: string; description: string; fields: Field[] }[] = [
  {
    title: 'Tên miền và API',
    description: 'Tên miền tùy chỉnh phải được cấu hình DNS và gắn vào Cloudflare Pages trước. Để trống trường override để tự phát hiện domain từ dự án Pages sau khi deploy.',
    fields: [
      { key: 'MINIAPP_DOMAIN_OVERRIDE', label: 'Domain Mini App', placeholder: 'https://app.example.com' },
      { key: 'ADMIN_DOMAIN_OVERRIDE', label: 'Domain Admin', placeholder: 'https://admin.example.com' },
      { key: 'STOREFRONT_DOMAIN_OVERRIDE', label: 'Domain Storefront', placeholder: 'https://store.example.com' },
      { key: 'VITE_API_BASE_URL', label: 'API base URL', placeholder: 'https://api.example.com', help: 'Dùng để build các frontend; giá trị mới có hiệu lực sau khi build/deploy lại.' },
    ],
  },
  {
    title: 'Tham số vận hành',
    description: 'Các giá trị sẽ được đồng bộ thành GitHub Actions Variables và truyền vào Wrangler khi triển khai Workers.',
    fields: [
      { key: 'BOT_USERNAME', label: 'Telegram bot username', placeholder: 'HendyAppStoreBot' },
      { key: 'MIN_DEPOSIT_VND', label: 'Nạp tiền tối thiểu (VNĐ)', type: 'number' },
      { key: 'MAX_DEPOSIT_VND', label: 'Nạp tiền tối đa (VNĐ)', type: 'number' },
      { key: 'DAILY_CHECKIN_REWARD_VND', label: 'Thưởng điểm danh (VNĐ)', type: 'number' },
      { key: 'REFERRAL_REWARD_VND', label: 'Thưởng giới thiệu (VNĐ)', type: 'number' },
      { key: 'SESSION_TTL_SECONDS', label: 'Thời hạn phiên (giây)', type: 'number' },
      { key: 'MAX_INIT_DATA_AGE_SECONDS', label: 'Tuổi tối đa Telegram initData (giây)', type: 'number' },
      { key: 'BANK_ID', label: 'Mã ngân hàng VietQR', placeholder: 'VCB' },
      { key: 'BANK_ACCOUNT_NUMBER', label: 'Số tài khoản nhận nạp', placeholder: 'Để trống nếu chưa cấu hình' },
      { key: 'BANK_ACCOUNT_NAME', label: 'Tên chủ tài khoản', placeholder: 'Tên in trên tài khoản' },
      { key: 'BANK_SYNC_URL', label: 'Bank provider sync URL', placeholder: 'https://bank-provider.example/api/sync', help: 'Dùng bởi Queue Processor; chỉ cấu hình endpoint nhà cung cấp đã được xác minh.' },
      { key: 'MAINTENANCE_MESSAGE', label: 'Thông báo bảo trì', type: 'textarea' },
      { key: 'TASKS_ENABLED', label: 'Cho phép hệ thống nhiệm vụ', type: 'boolean' },
      { key: 'MINIGAME_ENABLED', label: 'Cho phép minigame', type: 'boolean' },
      { key: 'AUTO_REDEPLOY_WORKERS_AFTER_DOMAIN_SYNC', label: 'Tự triển khai Workers sau khi cập nhật domain', type: 'boolean' },
    ],
  },
  {
    title: 'Tham số riêng theo tác vụ',
    description: 'Nhập JSON object. Các cấu hình này được truyền đến runtime dưới dạng TASKS_CONFIG_JSON và MINIGAME_CONFIG_JSON; hãy giữ các khóa tương thích với code xử lý tác vụ.',
    fields: [
      { key: 'TASKS_CONFIG_JSON', label: 'Tasks configuration JSON', type: 'textarea', placeholder: '{"maxActiveTasks":20,"maxTargetCount":100000,"maxRewardVnd":1000000000}' },
      { key: 'MINIGAME_CONFIG_JSON', label: 'Minigame configuration JSON', type: 'textarea', placeholder: '{"prizes":[{"key":"jackpot","threshold":5,"rewardVnd":5000},{"key":"bonus","threshold":50,"rewardVnd":1000},{"key":"small","threshold":150,"rewardVnd":200},{"key":"try_again","threshold":795,"rewardVnd":0}]}' },
    ],
  },
];

const TARGETS = [
  { key: 'domains', label: 'Phát hiện / đồng bộ domain từ Cloudflare' },
  { key: 'workers', label: 'Cloudflare Workers / API' },
  { key: 'web', label: 'Web Admin + Storefront' },
  { key: 'miniapp', label: 'Telegram Mini App' },
  { key: 'secrets', label: 'Đồng bộ GitHub Secrets sang Workers' },
];

async function request(path: string, token: string, method = 'GET', body?: unknown) {
  const response = await fetch(API + path, {
    method,
    headers: { authorization: 'Bearer ' + token, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error?.message || data?.error || 'Yêu cầu thất bại.');
  return data;
}

export default function CentralConfig({ token }: { token: string }) {
  const [values, setValues] = useState<ConfigValues>({});
  const [initialValues, setInitialValues] = useState<ConfigValues>({});
  const [secretStatus, setSecretStatus] = useState<Record<string, { configured: boolean; updatedAt: number | null }>>({});
  const [githubVariablesAvailable, setGithubVariablesAvailable] = useState(false);
  const [githubSecretsAvailable, setGithubSecretsAvailable] = useState(false);
  const [targets, setTargets] = useState<string[]>(['workers']);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const data = await request('/api/admin/config', token);
      setValues(data.values || {});
      setInitialValues(data.values || {});
      setSecretStatus(data.secretStatus || {});
      setGithubVariablesAvailable(Boolean(data.githubVariablesAvailable));
      setGithubSecretsAvailable(Boolean(data.githubSecretsAvailable));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [token]);

  function change(key: string, value: string) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); setError(''); setNotice('');
    try {
      const editable = Object.fromEntries(EDITABLE_KEYS
        .filter((key) => (values[key] ?? '') !== (initialValues[key] ?? ''))
        .map((key) => [key, values[key] ?? '']));
      if (!Object.keys(editable).length) {
        setNotice('Không có thay đổi mới để lưu.');
        return;
      }
      const result = await request('/api/admin/config', token, 'POST', { values: editable });
      setNotice('Đã lưu ' + result.updatedKeys.length + ' thiết lập và đồng bộ GitHub Actions Variables. Các thay đổi runtime cần chạy workflow tương ứng.');
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function apply() {
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await request('/api/admin/config/apply', token, 'POST', { confirm: true, targets });
      const names = (result.dispatched || []).map((item: { workflow: string }) => item.workflow).join(', ');
      setNotice('Đã gửi yêu cầu chạy: ' + names + '. Đây mới là xác nhận dispatch; hãy xem GitHub Actions để kiểm tra kết quả deploy.');
      setConfirmed(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function renderField(field: Field) {
    const value = values[field.key] ?? '';
    if (field.type === 'boolean') {
      return <label className="config-field" key={field.key}>
        <span>{field.label}</span>
        <select value={value} onChange={(event) => change(field.key, event.target.value)}>
          <option value="true">Bật</option><option value="false">Tắt</option>
        </select>
        {field.help && <small>{field.help}</small>}
      </label>;
    }
    if (field.type === 'textarea') {
      return <label className="config-field" key={field.key}>
        <span>{field.label}</span>
        <textarea rows={field.key.endsWith('_JSON') ? 6 : 3} spellCheck={false} value={value} placeholder={field.placeholder} onChange={(event) => change(field.key, event.target.value)} />
        {field.help && <small>{field.help}</small>}
      </label>;
    }
    return <label className="config-field" key={field.key}>
      <span>{field.label}</span>
      <input type={field.type === 'number' ? 'number' : 'text'} min={field.type === 'number' ? 0 : undefined} value={value} placeholder={field.placeholder} onChange={(event) => change(field.key, event.target.value)} />
      {field.help && <small>{field.help}</small>}
    </label>;
  }

  return <div className="config-center">
    <section className="panel">
      <div className="config-heading">
        <div><h2>Trung tâm điều phối cấu hình</h2><p>Một nơi quản lý domain, tham số runtime, cấu hình nhiệm vụ và trạng thái đồng bộ secret.</p></div>
        <button type="button" className="secondary-action" disabled={busy || loading} onClick={() => void load()}>Làm mới</button>
      </div>
      <div className="config-status-grid">
        <div className="config-status"><span>GitHub Variables</span><b className={githubVariablesAvailable ? 'config-good' : 'config-warn'}>{githubVariablesAvailable ? 'Đã kết nối' : 'Chưa kết nối'}</b></div>
        <div className="config-status"><span>GitHub Secrets</span><b className={githubSecretsAvailable ? 'config-good' : 'config-warn'}>{githubSecretsAvailable ? 'Đã kết nối' : 'Chưa kiểm tra được'}</b></div>
        <div className="config-status"><span>Domain Mini App</span><a href={values.APP_URL || undefined} target="_blank" rel="noreferrer">{values.APP_URL || 'Chưa được phát hiện'}</a></div>
        <div className="config-status"><span>Domain Admin</span><a href={values.ADMIN_URL || undefined} target="_blank" rel="noreferrer">{values.ADMIN_URL || 'Chưa được phát hiện'}</a></div>
        <div className="config-status"><span>Domain Storefront</span><a href={values.STOREFRONT_URL || undefined} target="_blank" rel="noreferrer">{values.STOREFRONT_URL || 'Chưa được phát hiện'}</a></div>
        <div className="config-status"><span>CORS origins</span><small>{values.CORS_ORIGINS || 'Được đồng bộ sau lần deploy Pages đầu tiên'}</small></div>
      </div>
      <p className="config-note">Domain công khai được đọc từ Cloudflare Pages sau khi deploy thành công. Trường domain override cho phép chọn custom domain đã gắn trong Cloudflare; nếu để trống, hệ thống dùng domain Pages phát hiện được.</p>
    </section>

    {error && <div className="alert bad" role="alert">{error}</div>}
    {notice && <div className="alert good" role="status">{notice}</div>}
    {loading ? <section className="panel"><p>Đang tải cấu hình và trạng thái đồng bộ…</p></section> :
      <form onSubmit={save} className="config-form">
        {FIELDS.map((group) => <section className="panel" key={group.title}>
          <h2>{group.title}</h2><p>{group.description}</p>
          <div className="config-fields">{group.fields.map(renderField)}</div>
        </section>)}
        <div className="config-actions">
          <button type="submit" disabled={busy}>{busy ? 'Đang lưu…' : 'Lưu cấu hình'}</button>
          <span>Dữ liệu không nhạy cảm được đồng bộ sang GitHub Actions Variables và lưu trong D1 để kiểm toán.</span>
        </div>
      </form>
    }

    <section className="panel">
      <h2>Áp dụng cấu hình và điều phối CI/CD</h2>
      <p>Chọn mục tiêu để gửi workflow thủ công. Việc gửi workflow không khẳng định deployment đã hoàn tất.</p>
      <div className="config-targets">
        {TARGETS.map((target) => <label key={target.key}><input type="checkbox" checked={targets.includes(target.key)} onChange={(event) => setTargets((current) => event.target.checked ? [...current, target.key] : current.filter((item) => item !== target.key))} />{target.label}</label>)}
      </div>
      <label className="confirm-row"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /> Tôi xác nhận gửi các workflow đã chọn, bao gồm triển khai production nếu chọn mục tiêu tương ứng.</label>
      <button type="button" disabled={busy || !confirmed || !targets.length} onClick={() => void apply()}>{busy ? 'Đang gửi…' : 'Áp dụng / chạy workflow'}</button>
    </section>

    <section className="panel">
      <h2>Trạng thái API token và secrets</h2>
      <p>Giá trị secrets không bao giờ được đọc lại. Chỉ tên secret và thời điểm cập nhật được hiển thị; việc gửi secret sử dụng mã hóa bằng public key của repository.</p>
      {Object.keys(secretStatus).length ? <div className="config-secret-list">{Object.entries(secretStatus).sort(([a], [b]) => a.localeCompare(b)).map(([name, item]) =>
        <div className="config-secret" key={name}><span>{name}</span><b className={item.configured ? 'config-good' : 'config-warn'}>{item.configured ? 'Đã cấu hình' : 'Chưa cấu hình'}</b></div>
      )}</div> : <p className="config-note">Chưa truy xuất được danh sách secret từ GitHub; kiểm tra repository token và quyền Actions secrets.</p>}
    </section>

    <AutomationSecretsForm token={token} />
  </div>;
}
