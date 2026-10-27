import React, { useEffect, useState } from 'react';
import { featureApi } from '../services/api';
type ReferralData = { inviteLink: string | null; referralCode: string; totalReferrals: number; rewardVnd: number; note?: string | null };
export default function Referral() {
  const [data,setData] = useState<ReferralData | null>(null); const [error,setError] = useState(''); const [copied,setCopied] = useState(false);
  useEffect(() => { featureApi<ReferralData>('/api/referral').then(setData).catch((e) => setError(e.message)); }, []);
  async function copy() { if (!data?.inviteLink) return; try { await navigator.clipboard.writeText(data.inviteLink); setCopied(true); } catch { setError('Không thể sao chép tự động; hãy chọn và sao chép liên kết.'); } }
  return <section className="section"><h2>Giới thiệu bạn bè</h2><p>Mời bạn bè tham gia Hendy Store. Phần thưởng chỉ được ghi nhận một lần cho mỗi tài khoản hợp lệ.</p>{error && <p role="alert">{error}</p>}{data && <div className="panel"><b>Liên kết mời</b><p><code>{data.inviteLink || data.referralCode}</code></p>{data.inviteLink && <button onClick={copy}>{copied ? 'Đã sao chép' : 'Sao chép liên kết'}</button>}<p>Bạn đã mời: <b>{data.totalReferrals}</b></p><p>Thưởng hiện tại: <b>{new Intl.NumberFormat('vi-VN').format(data.rewardVnd)} ₫</b> / lượt</p>{data.note && <small>{data.note}</small>}</div>}</section>;
}
