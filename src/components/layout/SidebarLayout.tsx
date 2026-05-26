// ─── SidebarLayout ───
// 左侧菜单导航布局壳

import type { ReactNode } from 'react';

interface Props {
  sidebar: ReactNode;
  children: ReactNode;
}

export default function SidebarLayout({ sidebar, children }: Props) {
  return (
    <div className="h-screen w-screen flex overflow-hidden bg-app-bg">
      {sidebar}
      <main className="flex-1 flex flex-col min-w-0">
        {children}
      </main>
    </div>
  );
}
