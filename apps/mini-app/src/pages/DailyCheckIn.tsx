import React, { useEffect, useState } from 'react';
import { featureApi } from '../services/api';
type Checkin = { day: string; checkedIn: boolean; rewardVnd: number };
export default function DailyCheckIn() {
  const [state,setState] = useState<Checkin | null>(null); const [busy,setBusy] = useState(false); const [message,setMessage] = useState('');
  async function load() { try { setState(await featureApi<Checkin>('/api/checkin')); } catch (e) { setMessage((e as Error).message); } }
  useEffect(() => { void load(); }, []);
  async function claim() { setBusy(true); setMessage(''); try { const r = await featureApi<{rewardVnd:number}>('/api/checkin',{method:'POST',body:{}}); setMessage(`Đã nhận ${new Intl.NumberFormat('vi-VN').format(r.rewardVnd)} ₫.`); await load(); } catch(e) { setMessage((e as Error).message); } finally { setBusy(false); } }
  return <section className="section"><h2>Điểm danh hàng ngày</h2><div className="panel"><p>Ngày hệ thống (UTC): {state?.day || '…'}</p><p>Phần thưởng: <b>{new Intl.NumberFormat('vi-VN').format(state?.rewardVnd || 0)} ₫</b></p><button className="primary" disabled={!state || state.checkedIn || busy} onClick={claim}>{state?.checkedIn ? 'Đã điểm danh hôm nay' : busy ? 'Đang xử lý…' : 'Điểm danh nhận thưởng'}</button>{message && <p role="status">{message}</p>}</div></section>;
}
