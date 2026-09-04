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
  // Keno quay liên tục trong giờ hoạt động Vietlott (06:08-21:52, chu kỳ 8 phút/kỳ) — dùng
  // `continuous-daily-window` để night-mode tự giãn nhịp sau giờ đóng cửa tới trước giờ mở
  // ngày mới (xem `schedule.ts` mục "GIÃN NHỊP QUA ĐÊM"). KHÔNG dùng `fixed` — quay liên
  // tục suốt ngày, không có slot rời rạc để nhảy thẳng tới như Lotto535.
  schedule: {
    type: "continuous-daily-window",
    firstDrawVn: "06:08",
    lastDrawVn: "21:52",
    drawIntervalMs: 8 * 60 * 1000,
  },
  ttlSeconds: 120,
});

export async function handler() {
  return useCase.run();
}
