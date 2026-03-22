import { Suspense } from "react";

import { PlayerOutstandingContent } from "./_components/player-outstanding-content";

interface PlayerOutstandingPageProps {
  params: Promise<{ accountId: string }>;
}

/**
 * Server Component — await params, truyền accountId xuống Client Component.
 * <Suspense> bắt buộc vì PlayerOutstandingContent dùng useQuery + useQueryClient.
 */
export default async function PlayerOutstandingPage({ params }: PlayerOutstandingPageProps) {
  const { accountId } = await params;
  return (
    <Suspense>
      <PlayerOutstandingContent accountId={accountId} />
    </Suspense>
  );
}
