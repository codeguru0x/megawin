"use client";

/**
 * Batch Runner — chạy 1 danh sách ID lớn theo nhiều lô nhỏ TUẦN TỰ (plan p1-09 §12).
 *
 * Bài toán chung (KHÔNG riêng Keno): khi số lượng item cần xử lý vượt trần cho phép của 1
 * request (vd `BULK_MAX_DRAWS = 50` bên Keno), thay vì nâng trần server (rủi ro timeout mất
 * TOÀN BỘ kết quả — xem `bulk-draw-action/limits.ts`), client tự chia thành nhiều request nhỏ, gửi
 * TUẦN TỰ (KHÔNG song song — song song sẽ nhân concurrency phía server ngoài thiết kế gốc),
 * và gộp kết quả thành công/thất bại ở cuối.
 *
 * Hook này KHÔNG biết gì về Keno/`BulkDrawActionOutput`/`drawId` — chỉ làm việc với `string`
 * ID trần và 1 hàm `runChunk` do caller cung cấp (adapter riêng từng domain gọi API tương
 * ứng). Vì vậy sống ở `apps/backoffice/src/hooks/` (tầng app, dùng chung mọi game) — KHÔNG
 * đặt trong `game-keno-application` hay `operations-hub/_lib` (code-quality-standards §5:
 * tìm-trước-khi-tạo, tránh mỗi ops-hub tự viết lại logic chunk+tuần tự+gộp này).
 *
 * 1 lô lỗi TOÀN BỘ request (network/500) KHÔNG làm dừng job — toàn bộ ID trong lô đó được
 * tính là thất bại với `genericErrorMessage`, rồi tiếp tục lô kế (cùng triết lý partial-success
 * đã áp dụng ở tầng server, `bulk-runner.ts`).
 */

import { useCallback, useState } from "react";

/** Kết quả trả về từ `runChunk` cho 1 lô — adapter tự map response API của domain mình vào đây. */
export interface BatchChunkResult {
  /** ID đã xử lý thành công trong lô này. */
  successIds: string[];
  /** ID thất bại trong lô này, kèm lý do (hiện inline tại dòng tương ứng ở UI gọi hook). */
  failures: Array<{ id: string; message?: string }>;
}

/** Trạng thái tiến trình — dùng để render progress bar khi job có > 1 lô. */
export interface BatchRunnerState {
  status: "idle" | "running" | "done";
  totalChunks: number;
  doneChunks: number;
  totalItems: number;
  successCount: number;
  failureCount: number;
}

/** Kết quả tổng sau khi `run()` hoàn tất toàn bộ job (mọi lô). */
export interface BatchRunnerResult {
  successCount: number;
  failureCount: number;
  /** ID thất bại — để caller quyết định giữ trong selection cho staff thử lại (manual retry). */
  failedIds: string[];
}

/** Trạng thái khởi tạo/nghỉ — export để caller không chạy batch (vd single-row dialog) có
 * default hợp lệ cho prop `batchState` mà không phải tự construct object rỗng mỗi nơi. */
export const IDLE_BATCH_STATE: BatchRunnerState = {
  status: "idle",
  totalChunks: 0,
  doneChunks: 0,
  totalItems: 0,
  successCount: 0,
  failureCount: 0,
};

/** Chia `ids` thành các lô kích thước tối đa `chunkSize`, giữ nguyên thứ tự. */
function chunk<T>(ids: readonly T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < ids.length; i += chunkSize) {
    chunks.push(ids.slice(i, i + chunkSize));
  }
  return chunks;
}

/**
 * `chunkSize` — trần mỗi request (vd `BULK_MAX_DRAWS` bên Keno). Caller import hằng số thật
 * của domain mình, KHÔNG hardcode số ở đây (hook này domain-agnostic).
 */
export function useBatchRunner(chunkSize: number) {
  const [state, setState] = useState<BatchRunnerState>(IDLE_BATCH_STATE);

  const run = useCallback(
    async (
      ids: readonly string[],
      runChunk: (chunk: readonly string[]) => Promise<BatchChunkResult>,
    ): Promise<BatchRunnerResult> => {
      const chunks = chunk(ids, chunkSize);
      setState({
        status: "running",
        totalChunks: chunks.length,
        doneChunks: 0,
        totalItems: ids.length,
        successCount: 0,
        failureCount: 0,
      });

      let successCount = 0;
      const failedIds: string[] = [];

      // TUẦN TỰ — KHÔNG Promise.all: mỗi lô await xong mới gửi lô kế, giữ đúng concurrency
      // đã tính toán ở tầng server cho 1 request (xem JSDoc đầu file).
      for (let i = 0; i < chunks.length; i++) {
        const currentChunk = chunks[i];
        if (!currentChunk) {
          continue;
        }
        try {
          const result = await runChunk(currentChunk);
          successCount += result.successIds.length;
          for (const f of result.failures) {
            failedIds.push(f.id);
          }
        } catch {
          // Cả lô lỗi (network/500) — coi TOÀN BỘ ID trong lô là thất bại, KHÔNG dừng job.
          for (const id of currentChunk) {
            failedIds.push(id);
          }
        }
        setState((curr) => ({
          ...curr,
          doneChunks: i + 1,
          successCount,
          failureCount: failedIds.length,
        }));
      }

      setState((curr) => ({ ...curr, status: "done" }));
      return { successCount, failureCount: failedIds.length, failedIds };
    },
    [chunkSize],
  );

  const reset = useCallback(() => setState(IDLE_BATCH_STATE), []);

  return { state, run, reset };
}
