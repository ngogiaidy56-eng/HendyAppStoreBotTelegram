import React from 'react';
export function MinigameWheel({ onSpin, spinning, disabled, result }: { onSpin: () => void; spinning: boolean; disabled: boolean; result?: string }) {
  return <section className="panel minigame-wheel"><div className="wheel-disc" aria-hidden="true">✦</div><h2>Vòng quay may mắn</h2><p>Mỗi tài khoản có một lượt quay miễn phí mỗi ngày.</p><button className="primary" onClick={onSpin} disabled={disabled || spinning}>{spinning ? 'Đang quay…' : 'Quay miễn phí'}</button>{result && <p role="status">{result}</p>}</section>;
}
export default MinigameWheel;
