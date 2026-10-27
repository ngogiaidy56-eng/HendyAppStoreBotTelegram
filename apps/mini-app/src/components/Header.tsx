import React from 'react';
export function Header({ title = 'HENDY STORE', subtitle }: { title?: string; subtitle?: string }) {
  return <header className="topbar"><div className="brand"><span className="brand-mark">H</span><span>{title}</span></div>{subtitle && <span className="top-user">{subtitle}</span>}</header>;
}
export default Header;
