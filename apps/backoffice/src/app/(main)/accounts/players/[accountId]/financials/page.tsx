import { Suspense } from "react";

import { PlayerFinancialsContent } from "./_components/player-financials-content";

interface PlayerFinancialsPageProps {
  params: Promise<{ accountId: string }>;
}

/**
 * Server Component — await params, truyền accountId xuống Client Component.
 * <Suspense> bắt buộc vì PlayerFinancialsContent dùng useQueryState (nuqs).
 */
export default async function PlayerFinancialsPage({ params }: PlayerFinancialsPageProps) {
  const { accountId } = await params;
  return (
    <Suspense>
      <PlayerFinancialsContent accountId={accountId} />
    </Suspense>
  );
}
