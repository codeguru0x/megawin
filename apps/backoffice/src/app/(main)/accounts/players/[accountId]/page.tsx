import { redirect } from "next/navigation";

interface PlayerDetailPageProps {
  params: Promise<{ accountId: string }>;
}

/** Redirect về tab Tổng quan khi vào root [accountId] */
export default async function PlayerDetailPage({ params }: PlayerDetailPageProps) {
  const { accountId } = await params;
  redirect(`/accounts/players/${accountId}/overview`);
}
