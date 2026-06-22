import type { ReactNode } from "react";

import { DocsSidebarShell } from "./_lib/components/docs-sidebar-shell";

/**
 * Layout 3-pane cho knowledge base. Nằm trong `(main)` nên kế thừa auth + app sidebar.
 *
 * Bù padding của `(main)` bằng margin âm để cột sidebar docs sát viền nội dung.
 * Cột trái: điều hướng docs (Sheet trên mobile). Cột giữa + phải: do page tự dựng
 * (article + table-of-contents) để TOC bám nội dung từng doc.
 */
export default function GuidesLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="-m-4 flex min-h-[calc(100dvh-3rem)] md:-m-6">
      <DocsSidebarShell />
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
