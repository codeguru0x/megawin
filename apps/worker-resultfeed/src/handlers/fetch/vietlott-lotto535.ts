/**
 * Lambda: fetch-vietlott-lotto535 (ResultFeed)
 *
 * Cùng cơ chế `fetch-vietlott-keno`, khác `gameKey` + `schedule`. Lotto 5/35 quay 2
 * kỳ/ngày cố định (13:00 + 21:00 giờ VN, mọi ngày) — dùng `schedule: { type: "fixed" }`
 * để `nextFetchAt` nhảy thẳng tới giờ quay kế tiếp ở nhánh thành công, thay vì poll đều
 * `minIntervalMs` suốt ngày cho kết quả chỉ đổi 2 lần/ngày (xem `schedule.ts`).
 *
 * Nhánh lỗi/`unavailable` vẫn poll theo `minIntervalMs`-based backoff như cũ (site có
 * thể publish muộn hơn giờ quay lý thuyết) — cron mỗi 1 phút vẫn cần để bắt kịp ngay
 * khi site vừa publish, xem `05-lotto535-and-schedule.plan.md §2`.
 */

import { ResultFeedGameKey } from "@megawin/resultfeed/entities";
import { vietlottDetailAdapter } from "@megawin/resultfeed-application/sources";
import { FetchAndParseUseCase } from "@megawin/resultfeed-application/use-cases/fetch";

const useCase = new FetchAndParseUseCase({
  sourceId: vietlottDetailAdapter.sourceId,
  gameKey: ResultFeedGameKey.Lotto535,
  adapter: vietlottDetailAdapter,
  schedule: { type: "fixed", drawTimesVn: ["13:00", "21:00"] },
  // = timeout Lambda ở `functions/fetch.yml` — lock TTL phải bao trùm hết burst catch-up
  // (nhiều tick/invocation, xem `FetchAndParseUseCase.budgetMs`), không chỉ 1 lượt fetch.
  ttlSeconds: 120,
});

export async function handler() {
  return useCase.run();
}
