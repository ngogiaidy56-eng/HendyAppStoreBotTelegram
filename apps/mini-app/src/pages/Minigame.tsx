import React, { useEffect, useState } from 'react';
import { featureApi } from '../services/api';
import MinigameWheel from '../components/MinigameWheel';
type SpinState = { day: string; played: boolean; result: { prize_key: string; reward_vnd: number; created_at: number } | null };
export default function Minigame(){
 const [busy,setBusy]=useState(false); const [played,setPlayed]=useState(false); const [result,setResult]=useState(''); const [error,setError]=useState(''); const [loading,setLoading]=useState(true);
 useEffect(()=>{featureApi<SpinState>('/api/minigames/spin').then(s=>{setPlayed(s.played);if(s.result)setResult(s.result.reward_vnd?`Hôm nay bạn đã nhận ${new Intl.NumberFormat('vi-VN').format(s.result.reward_vnd)} ₫.`:'Bạn đã quay hôm nay. Hẹn gặp lại ngày mai!');}).catch(e=>setError(e.message)).finally(()=>setLoading(false));},[]);
 async function spin(){setBusy(true);setError('');try{const r=await featureApi<{prizeKey:string;rewardVnd:number}>('/api/minigames/spin',{method:'POST',body:{}});setPlayed(true);setResult(r.rewardVnd?`Chúc mừng! Bạn nhận ${new Intl.NumberFormat('vi-VN').format(r.rewardVnd)} ₫.`:'Chúc bạn may mắn ở lượt quay ngày mai!');}catch(e){setError((e as Error).message);if((e as Error).message.includes('hôm nay')){setPlayed(true);}}finally{setBusy(false);}}
 return <section className="section"><h2>Vòng quay may mắn</h2>{error&&<p role="alert">{error}</p>}<MinigameWheel onSpin={spin} spinning={busy||loading} disabled={played||loading} result={result}/><p className="muted">Trò chơi miễn phí, giới hạn một lượt mỗi ngày. Kết quả được xác định và ghi nhận tại máy chủ.</p></section>
}
