import React from 'react';
export default function MobileAppStoreLayout({ children }: { children: React.ReactNode }) {
  return <div className="mobile-app-store-layout" data-layout="mobile-app-store">{children}</div>;
}
