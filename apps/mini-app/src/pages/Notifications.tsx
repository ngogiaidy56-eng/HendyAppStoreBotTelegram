import React, { useEffect, useState } from 'react';
import { featureApi } from '../services/api';
type Notice = { id:string; title:string; body:string; kind:string; created_at:number; read_at:number|null };
export default function Notifications() {
 const [items,setItems]=useState<Notice[]>([]); const [error,setError]=useState('');
 async function load(){ try { const r=await featureApi<{notifications:Notice[]}>('/api/notifications'); setItems(r.notifications||[]); } catch(e){setError((e as Error).message);} }
 useEffect(()=>{void load();},[]);
 async function mark(id:string){ try { await featureApi(`/api/notifications/${id}/read`,{method:'POST',body:{}}); setItems(xs=>xs.map(x=>x.id===id?{...x,read_at:Math.floor(Date.now()/1000)}:x)); }catch(e){setError((e as Error).message);} }
 return <section className="section"><h2>Thông báo</h2>{error&&<p role="alert">{error}</p>}{items.length===0&&!error&&<div className="panel">Bạn chưa có thông báo mới.</div>}{items.map(n=><article className="panel notification-item" key={n.id}><small>{new Date(n.created_at*1000).toLocaleString('vi-VN')} · {n.kind}</small><h3>{n.title}</h3><p>{n.body}</p>{!n.read_at&&<button onClick={()=>mark(n.id)}>Đánh dấu đã đọc</button>}</article>)}</section>;
}
