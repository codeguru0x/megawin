"use client";

import { ConsensusState, type ResultFeedGameKey } from "@megawin/resultfeed/entities";

import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { RESULTFEED_GAME_LABELS } from "../../_lib/labels";
import { useConsensusList } from "../../_lib/use-queries";
import { useReviewFilters } from "../_lib/use-filters";
import { PeriodReviewSheet } from "./period-review-sheet";
import { ReviewListTable } from "./review-list-table";

/**
 * Trang chính "Hàng đợi duyệt" — tổ hợp filter game + table (state=conflict) + sheet chi
 * tiết. `state` cố định `conflict` — plan `07-admin-management-page.plan.md §5.2` chỉ yêu
 * cầu hàng đợi conflict, không cho filter theo state khác ở trang này (dashboard đã có
 * breakdown đủ state).
 */
export function ReviewContent() {
  const {
    gameKey,
    cursor,
    page,
    selectedGameKey,
    selectedDrawPeriod,
    setGameKey,
    goNext,
    goPrev,
    openDetail,
    closeDetail,
  } = useReviewFilters();

  const query = useConsensusList({ state: ConsensusState.Conflict, gameKey: gameKey ?? undefined }, cursor || null);

  const rows = query.data?.data ?? [];
  const nextCursor = query.data?.nextCursor ?? null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Select
          value={gameKey ?? "all"}
          onValueChange={(v) => setGameKey(v === "all" ? null : (v as ResultFeedGameKey))}
        >
          <SelectTrigger size="sm" className="h-8 w-40 text-xs">
            <SelectValue placeholder="Game" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Mọi game</SelectItem>
            {Object.entries(RESULTFEED_GAME_LABELS).map(([key, label]) => (
              <SelectItem key={key} value={key}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card className="gap-0 overflow-hidden py-0">
        <CardContent className="px-0 pt-0 pb-0">
          <ReviewListTable
            rows={rows}
            isLoading={query.isLoading}
            isFetching={query.isFetching}
            page={page}
            hasPrev={page > 1}
            hasNext={!!nextCursor}
            onPrev={goPrev}
            onNext={() => nextCursor && goNext(nextCursor)}
            onOpenDetail={(row) => openDetail(row.gameKey, row.drawPeriod)}
          />
        </CardContent>
      </Card>

      <PeriodReviewSheet gameKey={selectedGameKey} drawPeriod={selectedDrawPeriod || null} onClose={closeDetail} />
    </div>
  );
}
