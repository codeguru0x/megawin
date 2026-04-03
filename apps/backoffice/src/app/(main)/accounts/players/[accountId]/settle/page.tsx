import { Suspense } from "react";

import { PlayerSettleContent } from "./_components/player-settle-content";

interface PlayerSettlePageProps {
  params: Promise<{ accountId: string }>;
}

/**
 * Server Component — await params, truyền accountId xuống Client Component.
 * <Suspense> bắt buộc vì PlayerSettleContent dùng useQueryState (nuqs).
 */
export default async function PlayerSettlePage({ params }: PlayerSettlePageProps) {
  const { accountId } = await params;
  return (
    <Suspense>
      <PlayerSettleContent accountId={accountId} />
    </Suspense>
  );
}
