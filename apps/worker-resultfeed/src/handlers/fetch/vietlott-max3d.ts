/**
 * Lambda: fetch-vietlott-max3d (ResultFeed)
 *
 * Cùng cơ chế `fetch-vietlott-keno`, khác `gameKey` + `schedule`. Max3D quay 3
 * kỳ/tuần cố định (18:00 giờ VN — Thứ 2, Thứ 4, Thứ 6) — dùng `schedule: { type: "fixed" }`
 * để `nextFetchAt` nhảy thẳng tới giờ quay kế tiếp ở nhánh thành công, thay vì poll đều
 * `minIntervalMs` suốt tuần cho kết quả chỉ đổi 3 lần/tuần (xem `schedule.ts`).
 *
 * Nhánh lỗi/`unavailable` vẫn poll theo `minIntervalMs`-based backoff như cũ (site có
 * thể publish muộn hơn giờ quay lý thuyết) — cron mỗi 1 phút vẫn cần để bắt kịp ngay
 * khi site vừa publish, xem `09-power-mega-max3d-family.plan.md §1.4`.
 */

import { ResultFeedGameKey } from "@megawin/resultfeed/entities";
import { vietlottDetailAdapter } from "@megawin/resultfeed-application/sources";
import { FetchAndParseUseCase } from "@megawin/resultfeed-application/use-cases/fetch";

const useCase = new FetchAndParseUseCase({
  sourceId: vietlottDetailAdapter.sourceId,
  gameKey: ResultFeedGameKey.Max3d,
  adapter: vietlottDetailAdapter,
  // Thứ 2=1, Thứ 4=3, Thứ 6=5 (dayOfWeek(): 0=CN...6=T7) — xác nhận từ footer fixture.
  schedule: { type: "fixed", drawTimesVn: ["18:00"], drawDaysOfWeek: [1, 3, 5] },
  // = timeout Lambda ở `functions/fetch.yml` — lock TTL phải bao trùm hết burst catch-up
  // (nhiều tick/invocation, xem `FetchAndParseUseCase.budgetMs`), không chỉ 1 lượt fetch.
  ttlSeconds: 120,
});

export async function handler() {
  return useCase.run();
}
