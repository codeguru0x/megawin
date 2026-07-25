import type { ReactNode } from "react";

import { PlayerBackLink } from "./_components/player-back-link";
import { PlayerDetailNav } from "./_components/player-detail-nav";
import { PlayerPageTitle } from "./_components/player-page-title";
import { PlayerSidebarProfile } from "./_components/player-sidebar-profile";

interface PlayerDetailLayoutProps {
  children: ReactNode;
  params: Promise<{ accountId: string }>;
}

/**
 * Layout trang Player Detail.
 *
 * Server Component — chỉ biết accountId từ params.
 * Username/profile được fetch client-side qua PlayerPageTitle + PlayerSidebarProfile
 * (đều dùng usePlayerProfile hook → API route) để đảm bảo đúng kiến trúc Next.js.
 *
 * Sidebar: nav + profile card tĩnh bên dưới — luôn hiển thị khi chuyển tab.
 */
export default async function PlayerDetailLayout({ children, params }: PlayerDetailLayoutProps) {
  const { accountId } = await params;

  return (
    <div className="@container/main flex flex-col gap-6">
      {/* Page header */}
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        {/* Title — fetch username client-side, fallback về accountId */}
        <PlayerPageTitle accountId={accountId} />

        {/* Back link — tenantId auto-resolved từ profile để filter đúng tenant */}
        <PlayerBackLink accountId={accountId} />
      </div>

      <div className="flex flex-col gap-6 lg:flex-row">
        {/* Sidebar: nav + profile card bên dưới */}
        <div className="shrink-0 lg:w-52">
          <div className="rounded-xl border bg-card p-3 shadow-sm lg:sticky lg:top-20">
            <PlayerDetailNav accountId={accountId} />
            {/* Profile tĩnh — luôn hiển thị, không phụ thuộc tab đang active */}
            <PlayerSidebarProfile accountId={accountId} />
          </div>
        </div>

        {/* Content area */}
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
