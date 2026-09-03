"use client";

import { ResultFeedGameKey } from "@megawin/resultfeed/entities";
import { parseAsInteger, parseAsString, parseAsStringLiteral, useQueryStates } from "nuqs";

const GAME_KEY_VALUES = Object.values(ResultFeedGameKey) as [ResultFeedGameKey, ...ResultFeedGameKey[]];

/** Reset về trang đầu — dùng khi đổi filter `gameKey`. */
const RESET_PAGE = { cursor: null, page: null } as const;

/**
 * URL state cho trang "Hàng đợi duyệt" (`review`) — filter `gameKey` (optional) + cursor
 * pagination Prev/Next (theo tiền lệ `useAuditLogFilters`) + `selected` (kỳ đang mở sheet
 * chi tiết, dạng `gameKey:drawPeriod`).
 */
export function useReviewFilters() {
  const [state, setState] = useQueryStates(
    {
      gameKey: parseAsStringLiteral(GAME_KEY_VALUES),
      cursor: parseAsString.withDefault(""),
      page: parseAsInteger.withDefault(1),
      selected: parseAsString.withDefault(""),
    },
    { history: "push", shallow: false },
  );

  function setGameKey(gameKey: ResultFeedGameKey | null) {
    void setState({ gameKey, ...RESET_PAGE });
  }

  function goNext(next: string) {
    void setState({ cursor: next, page: state.page + 1 });
  }

  function goPrev() {
    window.history.back();
  }

  function openDetail(gameKey: ResultFeedGameKey, drawPeriod: string) {
    void setState({ selected: `${gameKey}:${drawPeriod}` }, { history: "push" });
  }

  function closeDetail() {
    void setState({ selected: null }, { history: "push" });
  }

  const [selectedGameKey, selectedDrawPeriod] = state.selected ? state.selected.split(":") : [null, null];

  return {
    gameKey: state.gameKey,
    cursor: state.cursor,
    page: state.page,
    selectedGameKey: selectedGameKey as ResultFeedGameKey | null,
    selectedDrawPeriod,
    setGameKey,
    goNext,
    goPrev,
    openDetail,
    closeDetail,
  };
}
