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
  // Bingo18 quay liên tục trong giờ hoạt động Vietlott (06:06-21:53, chu kỳ 6 phút/kỳ) —
  // dùng `continuous-daily-window` để night-mode tự giãn nhịp sau giờ đóng cửa tới trước
  // giờ mở ngày mới (xem `schedule.ts` mục "GIÃN NHỊP QUA ĐÊM"). KHÔNG dùng `fixed` — quay
  // liên tục suốt ngày, không có slot rời rạc để nhảy thẳng tới như Lotto535.
  schedule: {
    type: "continuous-daily-window",
    firstDrawVn: "06:06",
    lastDrawVn: "21:53",
    drawIntervalMs: 6 * 60 * 1000,
  },
  // = timeout Lambda ở `functions/fetch.yml` — lock TTL phải bao trùm hết burst catch-up
  // (nhiều tick/invocation, xem `FetchAndParseUseCase.budgetMs`), không chỉ 1 lượt fetch.
  ttlSeconds: 120,
});

export async function handler() {
  return useCase.run();
}
