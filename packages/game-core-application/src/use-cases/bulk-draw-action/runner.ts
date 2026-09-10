import { AppException } from "@megawin/shared/errors";
import { logError } from "@megawin/shared/utils";

import type { BulkDrawActionOutput, BulkDrawActionResult } from "./dto";
import { BULK_CONCURRENCY } from "./limits";

/**
 * Điều phối một hành động trên nhiều kỳ — hạ tầng dùng chung cho MỌI bulk draw action của
 * MỌI game (settle/void/close-sales/open-sales).
 *
 * KHÔNG chứa logic nghiệp vụ nào, KHÔNG biết game nào đang gọi. Nhận 1 hàm `runOne(drawId)`
 * và lo:
 *   1. Dedupe `drawIds` (giữ thứ tự xuất hiện đầu tiên).
 *   2. Chia chunk `BULK_CONCURRENCY` và chạy `Promise.all` tuần tự từng chunk.
 *   3. Bọc `try/catch` RIÊNG mỗi kỳ — 1 kỳ throw KHÔNG làm mất kết quả các kỳ khác.
 *   4. Map `AppException` → `{ errorCode, errorMessage }`; lỗi lạ → `UNKNOWN` + log.
 *   5. Gom `results` theo đúng thứ tự đầu vào (đã dedupe) + đếm `successCount`/`failureCount`.
 *
 * PARTIAL SUCCESS là hợp đồng, không phải hệ quả: mỗi kỳ là một đơn vị độc lập về tài
 * chính, không transaction, không rollback.
 *
 * `Promise.all` trong hàm này là chỗ DUY NHẤT được phép trong toàn bộ luồng bulk — mọi
 * promise khác phải `await`/`void` tường minh (`biome-lint-conventions.mdc` §d cấm tuyệt
 * đối `biome-ignore` cho `noFloatingPromises` trong code tài chính, settle là đường tiền).
 *
 * LƯU Ý CHO CALLER khi ghi audit cấp lô: dùng `output.results.map((r) => r.drawId)`, KHÔNG
 * dùng `input.drawIds` — hàm này dedupe nội bộ nên `input.drawIds` có thể dài hơn
 * `successCount + failureCount`, ghi vào audit sẽ lệch số.
 *
 * @param drawIds - Danh sách kỳ cần xử lý, có thể trùng — sẽ dedupe giữ thứ tự đầu.
 * @param runOne - Hàm xử lý 1 kỳ, throw `AppException` (hoặc lỗi khác) khi thất bại.
 */
export async function runBulkDrawAction(
  drawIds: string[],
  runOne: (drawId: string) => Promise<void>,
): Promise<BulkDrawActionOutput> {
  // Dedupe giữ thứ tự xuất hiện đầu tiên — Set giữ insertion order trong JS.
  const uniqueDrawIds = [...new Set(drawIds)];

  const results: BulkDrawActionResult[] = [];

  // Chia chunk BULK_CONCURRENCY, chạy tuần tự từng chunk — mỗi chunk tối đa
  // BULK_CONCURRENCY kỳ chạy đồng thời qua Promise.all.
  for (let i = 0; i < uniqueDrawIds.length; i += BULK_CONCURRENCY) {
    const chunk = uniqueDrawIds.slice(i, i + BULK_CONCURRENCY);

    const chunkResults = await Promise.all(
      chunk.map(async (drawId): Promise<BulkDrawActionResult> => {
        try {
          await runOne(drawId);
          return { drawId, ok: true };
        } catch (err) {
          if (err instanceof AppException) {
            return { drawId, ok: false, errorCode: err.code, errorMessage: err.message };
          }

          // Lỗi không kiểm soát (driver Mongo, AWS SDK, bug runtime...) — log đầy đủ
          // server-side, trả message chung an toàn cho client (không lộ chi tiết hạ tầng).
          logError("runBulkDrawAction", err, { drawId });
          return {
            drawId,
            ok: false,
            errorCode: "UNKNOWN",
            errorMessage: "Lỗi xảy ra trên hệ thống, vui lòng liên hệ quản trị viên.",
          };
        }
      }),
    );

    results.push(...chunkResults);
  }

  const successCount = results.filter((r) => r.ok).length;

  return {
    results,
    successCount,
    failureCount: results.length - successCount,
  };
}
