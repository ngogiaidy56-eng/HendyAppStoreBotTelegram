import React from 'react';
export default function DesktopPortalLayout({ children }: { children: React.ReactNode }) {
  return <div className="desktop-portal-layout" data-layout="desktop-portal">{children}</div>;
}
