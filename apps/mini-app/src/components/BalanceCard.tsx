import React from 'react';
export function BalanceCard({ balanceVnd, onDeposit }: { balanceVnd: number; onDeposit: () => void }) {
  return <section className="balance-panel" aria-label="Số dư ví"><div className="balance-meta"><span>TỔNG SỐ DƯ</span><span className="balance-status">● LIVE WALLET</span></div><div className="balance-row"><strong>{new Intl.NumberFormat('vi-VN').format(balanceVnd)} ₫</strong><button className="deposit-quick" onClick={onDeposit}>+ Nạp tiền</button></div><div className="balance-bottom"><span>Ví tài khoản · VNĐ</span><span>Giao dịch bảo mật</span></div></section>;
}
export default BalanceCard;
