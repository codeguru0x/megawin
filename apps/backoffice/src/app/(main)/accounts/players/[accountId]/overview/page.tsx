import { Suspense } from "react";

import { PlayerOverviewContent } from "./_components/player-overview-content";

interface PlayerOverviewPageProps {
  params: Promise<{ accountId: string }>;
}

/**
 * Server Component — await params, truyền accountId xuống Client Component.
 * <Suspense> bắt buộc vì PlayerOverviewContent dùng useQueryState (nuqs).
 */
export default async function PlayerOverviewPage({ params }: PlayerOverviewPageProps) {
  const { accountId } = await params;
  return (
    <Suspense>
      <PlayerOverviewContent accountId={accountId} />
    </Suspense>
  );
}
