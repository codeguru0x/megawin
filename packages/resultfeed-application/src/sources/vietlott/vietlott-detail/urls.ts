/**
 * ResultFeed – vietlott-detail: URL Builder
 *
 * `02-fetch-parse.plan.md §2.2`. Dựng URL trang chi tiết (fetch theo kỳ).
 *
 * ⚠️ Hành vi `nocatche` KHÁC NHAU giữa các game — đã xác nhận bằng test thật qua Oxylabs
 * (`test/integration/oxylabs-real.test.ts`), không phải giả định đọc code:
 * - **Keno**: `nocatche` PHẢI là timestamp biến thiên (`now`). Test thật với
 *   `nocatche=<timestamp>` trả đúng cấu trúc DOM cho kỳ #0294129.
 * - **Bingo18**: NGƯỢC LẠI — `nocatche` PHẢI là hằng số `1`. Test thật với
 *   `nocatche=<timestamp>` (kỳ #0184369) trả về trang KHÔNG có `.day_so_ket_qua_v2`
 *   (parse fail); cùng lúc `nocatche=1` (kỳ #0184434) trả đúng cấu trúc. Rất có thể
 *   Vietlott dùng `nocatche=1` như 1 "cờ" bật chế độ no-cache cho riêng route Bingo18,
 *   không phải cache-buster theo giá trị như route Keno.
 *
 * KHÔNG "sửa cho giống nhau" giữa 2 game nếu không có bằng chứng thật mới — hành vi này đã
 * verify thực nghiệm, không phải lỗi code.
 */

import { ResultFeedGameKey } from "@megawin/resultfeed/entities";

/** Host + path gốc — KHÔNG đổi domain khác adapter mà không xác nhận lại (site thật dùng `www.`). */
const BASE_URL = "https://www.vietlott.vn/vi/trung-thuong/ket-qua-trung-thuong";

/**
 * Dựng URL trang chi tiết 1 kỳ. `period` PHẢI đã zero-pad ĐÚNG độ dài của nguồn (caller —
 * `adapter.ts` — chịu trách nhiệm, dùng `incrementPeriod` từ `@megawin/resultfeed/rules`
 * để giữ nguyên độ dài cursor đang lưu, KHÔNG hardcode `7` ở đây vì nguồn khác trong tương
 * lai có thể dùng độ dài khác).
 *
 * `now` (ms, dùng cho cache-buster) CHỈ áp dụng cho Keno — xem giải thích `nocatche` ở
 * đầu file. Bingo18/Lotto535/Power655/Mega645/Max3d/Max3dpro luôn gửi `nocatche=1` cố
 * định, tham số `now` bị bỏ qua cho 6 game này.
 *
 * URL 4 game Power655/Mega645/Max3d/Max3dpro xác nhận trực tiếp từ link do vận hành cung
 * cấp (`09-power-mega-max3d-family.plan.md`), CHƯA test qua Oxylabs thật như Keno/Bingo18
 * — nếu fetch sống báo lỗi liên tục ngay từ kỳ đầu, kiểm tra lại đúng path/param trước khi
 * nghi ngờ parser.
 */
export function buildDetailUrl(gameKey: ResultFeedGameKey, period: string, now: number): string {
  switch (gameKey) {
    case ResultFeedGameKey.Keno: {
      return `${BASE_URL}/view-detail-keno-result?id=${period}&nocatche=${now}`;
    }
    case ResultFeedGameKey.Bingo18: {
      return `${BASE_URL}/view-detail-bingo18-result?nocatche=1&id=${period}`;
    }
    case ResultFeedGameKey.Lotto535: {
      return `${BASE_URL}/535?id=${period}&nocatche=1`;
    }
    case ResultFeedGameKey.Power655: {
      return `${BASE_URL}/655?id=${period}&nocatche=1`;
    }
    case ResultFeedGameKey.Mega645: {
      return `${BASE_URL}/645?id=${period}&nocatche=1`;
    }
    case ResultFeedGameKey.Max3d: {
      return `${BASE_URL}/max-3D?id=${period}&nocatche=1`;
    }
    case ResultFeedGameKey.Max3dpro: {
      return `${BASE_URL}/max-3DPro?id=${period}&nocatche=1`;
    }
    default: {
      const _exhaustive: never = gameKey;
      throw new Error(`Unknown gameKey: ${_exhaustive}`);
    }
  }
}
