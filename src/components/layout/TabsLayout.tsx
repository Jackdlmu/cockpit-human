// ─── TabsLayout ───
// 顶部多页签导航布局壳

import type { ReactNode } from 'react';

interface Props {
  tabBar: ReactNode;
  children: ReactNode;
}

export default function TabsLayout({ tabBar, children }: Props) {
  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-app-bg">
      {tabBar}
      <main className="flex-1 min-h-0">
        {children}
      </main>
    </div>
  );
}
