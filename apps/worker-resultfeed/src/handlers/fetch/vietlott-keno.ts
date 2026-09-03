/**
 * Lambda: fetch-vietlott-keno (ResultFeed)
 *
 * EventBridge gọi mỗi 1 phút — `FetchAndParseUseCase` tự quyết định có làm gì hay
 * không dựa vào `SourceCursor.nextFetchAt` (xem JSDoc use-case + plan §4). Handler
 * chỉ là glue mỏng: khởi tạo use-case 1 lần (module scope, tái dùng qua các invocation
 * warm) với đúng adapter + gameKey, rồi delegate `run()`.
 *
 * `ttlSeconds = 120` PHẢI khớp `timeout: 120` khai báo ở `functions/fetch.yml` — xem
 * JSDoc `SingleRunWorker.ttlSeconds` (công thức chuẩn: TTL = Lambda timeout). Lock TTL
 * phải bao trùm hết burst catch-up (nhiều tick/invocation khi đang bắt kịp backlog),
 * không chỉ 1 lượt fetch đơn — xem `FetchAndParseUseCase.budgetMs`.
 */

import { ResultFeedGameKey } from "@megawin/resultfeed/entities";
import { vietlottDetailAdapter } from "@megawin/resultfeed-application/sources";
import { FetchAndParseUseCase } from "@megawin/resultfeed-application/use-cases/fetch";

const useCase = new FetchAndParseUseCase({
  sourceId: vietlottDetailAdapter.sourceId,
  gameKey: ResultFeedGameKey.Keno,
  adapter: vietlottDetailAdapter,
  // Keno quay liên tục (vài phút/kỳ) — không có giờ quay cố định để nhảy thẳng tới.
  schedule: { type: "continuous" },
  ttlSeconds: 120,
});

export async function handler() {
  return useCase.run();
}
