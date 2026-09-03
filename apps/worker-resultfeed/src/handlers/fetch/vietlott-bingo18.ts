/**
 * Lambda: fetch-vietlott-bingo18 (ResultFeed)
 *
 * Cùng cơ chế `fetch-vietlott-keno`, khác `gameKey`. Cùng adapter `vietlott-detail`
 * (1 adapter phục vụ nhiều gameKey — mỗi Lambda = 1 nguồn × 1 game, xem plan §4).
 */

import { ResultFeedGameKey } from "@megawin/resultfeed/entities";
import { vietlottDetailAdapter } from "@megawin/resultfeed-application/sources";
import { FetchAndParseUseCase } from "@megawin/resultfeed-application/use-cases/fetch";

const useCase = new FetchAndParseUseCase({
  sourceId: vietlottDetailAdapter.sourceId,
  gameKey: ResultFeedGameKey.Bingo18,
  adapter: vietlottDetailAdapter,
  // Bingo18 quay liên tục (vài phút/kỳ) — không có giờ quay cố định để nhảy thẳng tới.
  schedule: { type: "continuous" },
  // = timeout Lambda ở `functions/fetch.yml` — lock TTL phải bao trùm hết burst catch-up
  // (nhiều tick/invocation, xem `FetchAndParseUseCase.budgetMs`), không chỉ 1 lượt fetch.
  ttlSeconds: 120,
});

export async function handler() {
  return useCase.run();
}
