"use client";

import { ResultFeedGameKey } from "@megawin/resultfeed/entities";
import { parseAsString, parseAsStringLiteral, useQueryStates } from "nuqs";

const GAME_KEY_VALUES = Object.values(ResultFeedGameKey) as [ResultFeedGameKey, ...ResultFeedGameKey[]];

/** URL state cho trang "Tra cứu kỳ" — chỉ 2 field, đẩy vào URL để share link tra cứu. */
export function usePeriodLookupFilters() {
  const [state, setState] = useQueryStates(
    {
      gameKey: parseAsStringLiteral(GAME_KEY_VALUES),
      drawPeriod: parseAsString.withDefault(""),
    },
    { history: "push", shallow: false },
  );

  function lookup(gameKey: ResultFeedGameKey, drawPeriod: string) {
    void setState({ gameKey, drawPeriod: drawPeriod.trim() });
  }

  return {
    gameKey: state.gameKey,
    drawPeriod: state.drawPeriod || null,
    lookup,
  };
}
