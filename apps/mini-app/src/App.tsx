import React, { useEffect, useMemo, useState } from 'react';
import { ArrowDownToLine, ArrowLeftRight, BadgeCheck, Bell, Boxes, CalendarCheck, CircleHelp, Code2, Gift, Gamepad2, ListTodo, RefreshCw, ShieldCheck, ShoppingBag, Users, UserRound, Wallet, X } from 'lucide-react';
import { api, getSession, setSession, signIn } from './services/api';
import Referral from './pages/Referral';
import DailyCheckIn from './pages/DailyCheckIn';
import Notifications from './pages/Notifications';
import Tasks from './pages/Tasks';
import Minigame from './pages/Minigame';
import Profile from './pages/Profile';
import AdminDashboard from './pages/AdminDashboard';
import './index.css';

const money = (value = 0) => `${new Intl.NumberFormat('vi-VN').format(value)} ₫`;
const tabs = [{ id:'shop', label:'Cửa hàng', icon:ShoppingBag }, { id:'wallet', label:'Ví tiền', icon:Wallet }, { id:'orders', label:'Đơn hàng', icon:Boxes }, { id:'vip', label:'VIP', icon:BadgeCheck }, { id:'tasks', label:'Nhiệm vụ', icon:ListTodo }, { id:'checkin', label:'Điểm danh', icon:CalendarCheck }, { id:'minigame', label:'Vòng quay may mắn', icon:Gamepad2 }, { id:'referral', label:'Mời bạn', icon:Users }, { id:'notifications', label:'Thông báo', icon:Bell }, { id:'profile', label:'Hồ sơ', icon:UserRound }, { id:'admin', label:'Quản trị', icon:ShieldCheck }];

function App() {
  const [user, setUser] = useState(null); const [products, setProducts] = useState([]); const [tab, setTab] = useState('shop');
  const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(''); const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const [deposit, setDeposit] = useState({ amountVnd: '50000', data: null }); const [gift, setGift] = useState(''); const [filter, setFilter] = useState('Tất cả');
  const telegram = window.Telegram?.WebApp;

  async function refresh() {
    setError('');
    try {
      if (!getSession()) await signIn();
      const [me, catalog] = await Promise.all([api('/api/me'), api('/api/products')]);
      setUser(me.user); setProducts(catalog.products || []);
      if (telegram) { telegram.ready(); telegram.expand(); telegram.setHeaderColor?.('#0b1020'); telegram.setBackgroundColor?.('#080b14'); }
    } catch (e) { setError(e.message); setSession(''); setUser(null); }
    finally { setLoading(false); }
  }
  useEffect(() => { refresh(); }, []);
  const categories = useMemo(() => ['Tất cả', ...new Set(products.map(p => p.category || 'Khác'))], [products]);
  const filtered = products.filter(p => (filter === 'Tất cả' || p.category === filter));

  async function buy(product) {
    if (!user) return;
    if (Number(user.balance_vnd) < Number(product.price_vnd)) { setError('Số dư không đủ. Hãy nạp tiền vào ví trước.'); setTab('wallet'); return; }
    if (!window.confirm(`Mua ${product.title} với giá ${money(product.price_vnd)}?`)) return;
    setBusy(product.id); setError(''); setNotice('');
    try {
      const requestId = crypto.randomUUID();
      const result = await api('/api/orders', { method:'POST', body:{ productId:product.id, requestId } });
      setNotice(`Mua thành công: ${result.order.title}\nMã của bạn: ${result.delivery}`);
      await refresh();
    } catch(e) { setError(e.message); }
    finally { setBusy(''); }
  }

  async function createDeposit(e) {
    e.preventDefault(); setBusy('deposit'); setError(''); setNotice('');
    try { const result = await api('/api/deposits', { method:'POST', body:{ amountVnd:Number(deposit.amountVnd) } }); setDeposit(s => ({...s,data:result.deposit})); setNotice(`Đã tạo yêu cầu nạp tiền. Nội dung chuyển khoản: ${result.deposit.reference}`); }
    catch(e) { setError(e.message); } finally { setBusy(''); }
  }
  async function redeem(e) {
    e.preventDefault(); setBusy('gift'); setError(''); setNotice('');
    try { const result = await api('/api/giftcodes/redeem', { method:'POST', body:{ code:gift } }); setNotice(`Đã cộng ${money(result.amountVnd)} vào ví.`); setGift(''); await refresh(); }
    catch(e) { setError(e.message); } finally { setBusy(''); }
  }
  async function switchTab(next) { setTab(next); if (next !== 'shop') { try { const me = await api('/api/me'); setUser(me.user); } catch(e) { setError(e.message); } } }

  if (loading) return <div className="splash"><div className="brand-mark"><Code2/></div><p>ĐANG KẾT NỐI HENDY STORE</p><div className="loader"/></div>;
  if (!user) return <div className="shell"><header className="topbar"><div className="brand"><span className="brand-mark"><Code2/></span><span>HENDY<span className="accent">STORE</span></span></div></header><main className="auth-card"><div className="glow-orb"/><ShieldCheck size={36}/><h1>Đăng nhập an toàn</h1><p>{error || 'Mở Mini App thông qua Telegram để xác thực tài khoản.'}</p><button className="primary" onClick={() => { setLoading(true); refresh(); }}><RefreshCw size={17}/> Thử lại</button></main></div>;

  return <div className="shell">
    <header className="topbar"><div className="brand"><span className="brand-mark"><Code2 size={20}/></span><span>HENDY<span className="accent">STORE</span></span></div><div className="top-user"><span className="online-dot"/> {user.first_name || user.username || 'Thành viên'} <BadgeCheck className="verified" size={15}/></div></header>
    <main>
      <section className="hero"><div className="hero-copy"><span className="eyebrow"><span className="online-dot"/> CHỢ SẢN PHẨM SỐ</span><h1>Mở khóa<br/><span className="gradient-text">trải nghiệm mới.</span></h1><p>Kho sản phẩm số và mã kích hoạt dành cho bạn.</p><div className="hero-actions"><span className="secure-label"><ShieldCheck size={15}/> Giao dịch bảo mật</span><span className="secure-label"><RefreshCw size={15}/> Tự động giao mã</span></div></div><div className="hero-art"><div className="ring ring-one"/><div className="ring ring-two"/><div className="hero-chip"><Code2 size={38}/><span>HND//OS</span></div><div className="float-tag tag-a">HỆ THỐNG ĐANG HOẠT ĐỘNG</div><div className="float-tag tag-b">BẢO MẬT 256-BIT</div></div></section>
      <section className="balance-panel"><div className="balance-meta"><span><Wallet size={16}/> TỔNG SỐ DƯ</span><span className="balance-status">● VÍ CỦA BẠN</span></div><div className="balance-row"><div><strong>{money(user.balance_vnd)}</strong><small>Ví tài khoản · VNĐ</small></div><button className="deposit-quick" onClick={() => switchTab('wallet')}>+ Nạp tiền</button></div><div className="balance-bottom"><span><span className="online-dot"/> Tài khoản đã xác thực</span><span>UID: {user.telegram_id}</span></div></section>
      {error && <div className="alert error"><CircleHelp size={18}/><span>{error}</span><button onClick={() => setError('')}><X size={16}/></button></div>}
      {notice && <div className="alert success"><BadgeCheck size={18}/><pre>{notice}</pre><button onClick={() => setNotice('')}><X size={16}/></button></div>}
      <nav className="tabs">{tabs.filter(t => t.id !== 'admin' || user.isAdmin).map(t => <button key={t.id} onClick={() => switchTab(t.id)} className={tab===t.id?'active':''}><t.icon size={17}/>{t.label}</button>)}</nav>
      {tab==='shop' && <section className="section"><div className="section-heading"><div><span className="eyebrow">DANH MỤC ĐƯỢC CHỌN LỌC</span><h2>Sản phẩm <span className="accent">nổi bật</span></h2></div><span className="count-pill">{products.length} SẢN PHẨM</span></div><div className="filters">{categories.map(c => <button key={c} onClick={() => setFilter(c)} className={filter===c?'selected':''}>{c}</button>)}</div>
        {filtered.length===0 ? <div className="empty"><Boxes size={32}/><p>Chưa có sản phẩm. Vui lòng quay lại sau.</p></div> : <div className="product-grid">{filtered.map((p,i)=><article className="product-card" key={p.id}><div className={`product-icon hue-${i%4}`}><Code2 size={25}/><span className="product-type">{p.kind==='link'?'LIÊN KẾT':'MÃ'}</span></div><div className="product-body"><div className="product-category">{p.category} <span className={p.stock>0?'stock':'stock unavailable'}>{p.stock>0?`● Còn ${p.stock}`:'● Hết hàng'}</span></div><h3>{p.title}</h3><p>{p.description || 'Sản phẩm kỹ thuật số được giao tự động sau khi mua.'}</p><div className="product-footer"><strong>{money(p.price_vnd)}</strong><button disabled={busy===p.id || p.stock<1} onClick={()=>buy(p)}>{busy===p.id?'Đang mua…':<><ShoppingBag size={15}/> Mua ngay</>}</button></div></div></article>)}</div>}
      </section>}
      {tab==='wallet' && <section className="section"><div className="section-heading"><div><span className="eyebrow">QUẢN LÝ VÍ</span><h2>Nạp tiền <span className="accent">vào ví</span></h2></div></div><div className="wallet-grid"><form className="panel" onSubmit={createDeposit}><h3><ArrowDownToLine size={18}/> Tạo yêu cầu nạp</h3><p>Nhập số tiền, sau đó chuyển khoản đúng nội dung và số tiền được hiển thị.</p><label>Số tiền (VNĐ)<input type="number" min="10000" step="1000" value={deposit.amountVnd} onChange={e=>setDeposit(s=>({...s,amountVnd:e.target.value}))} required/></label><div className="amount-presets">{[50000,100000,200000,500000].map(a=><button type="button" key={a} className={Number(deposit.amountVnd)===a?'selected':''} onClick={()=>setDeposit(s=>({...s,amountVnd:String(a)}))}>{money(a)}</button>)}</div><button className="primary full" disabled={busy==='deposit'}>{busy==='deposit'?'Đang tạo…':'Tạo QR / yêu cầu nạp'}</button>{deposit.data && <div className="deposit-detail"><b>Nội dung chuyển khoản</b><code>{deposit.data.reference}</code><b>Số tiền</b><strong>{money(deposit.data.amountVnd)}</strong>{deposit.data.qrUrl?<img src={deposit.data.qrUrl} alt="VietQR"/>:<p>QR chưa được cấu hình. Liên hệ quản trị viên.</p>}</div>}</form>
      <form className="panel" onSubmit={redeem}><h3><Gift size={18}/> Đổi mã quà tặng</h3><p>Nhập mã quà tặng để cộng số dư vào ví. Mỗi tài khoản chỉ sử dụng mỗi mã một lần.</p><label>Mã gifcode<input value={gift} onChange={e=>setGift(e.target.value.toUpperCase())} placeholder="VD: WELCOME2026" maxLength={80} required/></label><button className="primary full" disabled={busy==='gift'}>{busy==='gift'?'Đang xử lý…':'Đổi mã quà tặng'}</button></form></div></section>}
      {tab==='orders' && <Orders />}
      {tab==='vip' && <VipCenter />}
      {tab==='tasks' && <Tasks />}
      {tab==='checkin' && <DailyCheckIn />}
      {tab==='minigame' && <Minigame />}
      {tab==='referral' && <Referral />}
      {tab==='notifications' && <Notifications />}
      {tab==='profile' && <Profile />}
      {tab==='admin' && user.isAdmin && <AdminDashboard />}
    </main>
    <footer><div className="brand small"><span className="brand-mark"><Code2 size={16}/></span> HENDY<span className="accent">STORE</span></div><span>PHIÊN BẢN 1.0</span></footer>
  </div>;
}


function VipCenter(){
  const [vip,setVip]=useState(null);const [error,setError]=useState('');
  useEffect(()=>{api('/api/vip').then(setVip).catch(e=>setError(e.message));},[]);
  if(error)return <section className="section"><div className="empty">{error}</div></section>;
  if(!vip)return <section className="section"><div className="empty"><RefreshCw className="spin"/> Đang tải cấp VIP…</div></section>;
  const progress=vip.nextLevel?Math.min(100,Math.max(0,(vip.totalSpentVnd-vip.level.minSpendVnd)/(vip.nextLevel.minSpendVnd-vip.level.minSpendVnd)*100)):100;
  return <section className="section"><div className="section-heading"><div><span className="eyebrow">CHƯƠNG TRÌNH THÀNH VIÊN</span><h2>Trung tâm <span className="accent">VIP</span></h2></div><span className="count-pill">{vip.level.id.toUpperCase()}</span></div><div className="panel vip-panel"><div className="vip-emblem"><BadgeCheck size={42}/></div><span className="eyebrow">CẤP THÀNH VIÊN HIỆN TẠI</span><h3>{vip.level.label}</h3><p>Tổng chi tiêu hợp lệ: <strong>{money(vip.totalSpentVnd)}</strong></p>{vip.nextLevel?<><div className="vip-progress-head"><span>Tiến độ lên cấp {vip.nextLevel.label}</span><b>{Math.round(progress)}%</b></div><div className="vip-track"><span style={{width:`${progress}%`}}/></div><small>Cần chi thêm {money(vip.remainingVnd)} để đạt cấp tiếp theo.</small></>:<p className="vip-max">Bạn đã đạt cấp VIP cao nhất.</p>}</div><div className="vip-levels">{vip.levels.map((level,index)=><div className={`vip-level ${vip.level.id===level.id?'current':''}`} key={level.id}><span>{['Ⅰ','Ⅱ','Ⅲ','Ⅳ'][index]}</span><div><b>{level.label}</b><small>{level.nextSpendVnd?`Từ ${money(level.minSpendVnd)} đến ${money(level.nextSpendVnd)}`:`Từ ${money(level.minSpendVnd)}`}</small></div>{vip.level.id===level.id&&<BadgeCheck size={17}/>}</div>)}</div><p className="muted">Cấp VIP được cập nhật theo tổng chi tiêu đơn hàng hoàn tất. Quyền lợi ưu đãi có thể được cấu hình thêm khi chính sách bán hàng được xác định.</p></section>
}

function Orders(){
  const [orders,setOrders]=useState([]);const [wallet,setWallet]=useState([]);const [loading,setLoading]=useState(true);const [error,setError]=useState('');
  useEffect(()=>{Promise.all([api('/api/orders'),api('/api/wallet')]).then(([o,w])=>{setOrders(o.orders||[]);setWallet(w.transactions||[])}).catch(e=>setError(e.message)).finally(()=>setLoading(false));},[]);
  return <section className="section"><div className="section-heading"><div><span className="eyebrow">HOẠT ĐỘNG TÀI KHOẢN</span><h2>Lịch sử <span className="accent">giao dịch</span></h2></div></div>{error&&<p className="muted">{error}</p>}{loading?<div className="empty"><RefreshCw className="spin"/> Đang tải…</div>:<><h3 className="list-title">Đơn mua gần đây</h3><div className="activity-list">{orders.map(o=><div className="activity-row" key={o.order_id}><span className="activity-icon"><ShoppingBag size={17}/></span><div className="activity-info"><b>{o.title}</b><small>{new Date(o.created_at*1000).toLocaleString('vi-VN')} · {o.order_id.slice(0,8)}</small></div><div className="activity-amount"><b>-{money(o.amount_vnd)}</b><small className={o.status==='completed'?'status-ok':'status-pending'}>{o.status==='completed'?'Hoàn tất':'Đang xử lý'}</small></div></div>)}{orders.length===0&&<p className="empty">Chưa có đơn mua nào.</p>}</div><h3 className="list-title">Ví tiền</h3><div className="activity-list">{wallet.map(t=><div className="activity-row" key={t.id}><span className="activity-icon"><ArrowLeftRight size={17}/></span><div className="activity-info"><b>{({deposit:'Nạp tiền',purchase:'Mua hàng',giftcode:'Đổi gifcode',admin_adjustment:'Điều chỉnh số dư'})[t.kind]||t.kind}</b><small>{t.note||t.reference} · {new Date(t.created_at*1000).toLocaleString('vi-VN')}</small></div><div className="activity-amount"><b className={t.amount_vnd>=0?'credit':'debit'}>{t.amount_vnd>0?'+':''}{money(t.amount_vnd)}</b></div></div>)}{wallet.length===0&&<p className="empty">Chưa có giao dịch ví.</p>}</div></>}</section>
}

export default App;
