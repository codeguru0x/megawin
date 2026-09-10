"use client";

/**
 * Ops Hub — Bulk Mutations (p1-02 plan §8, p1-09 §12)
 *
 * MỘT hook `useBulkAction` dùng chung cho cả 4 action (settle/void/close-sales/open-sales) —
 * response shape `BulkDrawActionOutput` giống nhau 100%, chỉ khác path + có `reason` hay không
 * (plan §8.4: "không viết 4 hook riêng gần như giống nhau").
 *
 * Hợp đồng partial success (plan §8.5, KHÁC hẳn `useDrawAction` đơn của trang `operations/`):
 * - Route LUÔN trả `200` kể cả khi có `failureCount > 0` — KHÔNG đọc HTTP status để biết pass/fail.
 * - Dòng THÀNH CÔNG bị xoá khỏi `selectedIds` NGAY (không chờ refetch) — dòng LỖI giữ nguyên
 *   trong selection kèm `rowErrors` để staff sửa/thử lại mà không phải chọn lại từ đầu.
 * - Toast 3 mức: full success / full failure / partial — KHÔNG bao giờ toast lỗi khi
 *   `successCount > 0` (staff sẽ tưởng nhầm 100% fail).
 *
 * P1-09 §12 bổ sung `useBulkBatchAction` — khi số kỳ chọn vượt `BULK_MAX_DRAWS` (1 request),
 * client tự chia thành nhiều request tuần tự qua `useBatchRunner` (hook chung, xem
 * `hooks/use-batch-runner.ts`) rồi GỘP side-effect (`applyBulkResult`) cho MỖI lô — vẫn xoá
 * dòng thành công khỏi selection ngay, giữ dòng lỗi kèm `rowErrors`, y hệt hành vi lô đơn.
 * KHÁC biệt duy nhất: KHÔNG toast per-lô (gây spam nếu 4-6 lô liên tiếp) — chỉ 1 toast tổng
 * sau khi TOÀN BỘ job xong.
 */

import { useCallback } from "react";

import { BULK_MAX_DRAWS } from "@megawin/game-core-application/use-cases/bulk-draw-action/limits";
import type {
  BulkDrawActionOutput,
  BulkDrawIdsInput,
  BulkTriggerSettleInput,
  BulkVoidDrawInput,
} from "@megawin/game-keno-application/use-cases/draws";
import { apiClient, formatErrorToast } from "@megawin/next/client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import type { BatchChunkResult } from "@/hooks/use-batch-runner";
import { useBatchRunner } from "@/hooks/use-batch-runner";
import { kenoKeys } from "@/lib/query-keys";

import { useHubContext } from "../../use-hub-context";
import { BulkActionKind } from "./queue-types";

const BULK_PATH: Record<BulkActionKind, string> = {
  [BulkActionKind.Settle]: "/keno/draws/bulk-settle",
  [BulkActionKind.Void]: "/keno/draws/bulk-void",
  [BulkActionKind.CloseSales]: "/keno/draws/bulk-close-sales",
  [BulkActionKind.OpenSales]: "/keno/draws/bulk-open-sales",
};

const ACTION_VERB: Record<BulkActionKind, string> = {
  [BulkActionKind.Settle]: "kết sổ",
  [BulkActionKind.Void]: "huỷ",
  [BulkActionKind.CloseSales]: "đóng bán",
  [BulkActionKind.OpenSales]: "mở bán",
};

/** Input gửi lên — `void` cần `reason`, 3 action còn lại chỉ cần `drawIds` (server tự lấy `actor` từ session, KHÔNG gửi từ client). */
export type BulkActionInput = Omit<BulkDrawIdsInput, "actor"> | Omit<BulkVoidDrawInput, "actor" | "KENO_VOID_SFN_ARN">;

/**
 * Side-effect DÙNG CHUNG cho 1 lô response (bulk đơn HOẶC 1 lô trong job nhiều lô, p1-09 §12):
 * xoá dòng thành công khỏi selection NGAY, ghi/xoá `rowErrors` cho dòng vừa thử, invalidate
 * query. KHÔNG toast ở đây — caller (bulk đơn hay batch runner) tự quyết toast lúc nào.
 */
function applyBulkResult(
  data: BulkDrawActionOutput,
  triedDrawIds: readonly string[],
  ctx: {
    state: { selectedIds: ReadonlySet<string>; rowErrors: ReadonlyMap<string, string> };
    actions: {
      setSelection: (ids: ReadonlySet<string>) => void;
      setRowErrors: (errors: ReadonlyMap<string, string>) => void;
    };
    qc: ReturnType<typeof useQueryClient>;
  },
) {
  const succeededIds = new Set(data.results.filter((r) => r.ok).map((r) => r.drawId));
  const failedResults = data.results.filter((r) => !r.ok);

  const nextSelection = new Set(ctx.state.selectedIds);
  for (const id of succeededIds) {
    nextSelection.delete(id);
  }
  ctx.actions.setSelection(nextSelection);

  // Merge rowErrors: xoá lỗi cũ của các dòng vừa thử (thành công hay thất bại đều xoá lỗi
  // CŨ trước), rồi ghi lỗi MỚI cho dòng thất bại. Dòng KHÔNG nằm trong lô này giữ nguyên.
  const nextErrors = new Map(ctx.state.rowErrors);
  for (const drawId of triedDrawIds) {
    nextErrors.delete(drawId);
  }
  for (const r of failedResults) {
    nextErrors.set(r.drawId, r.errorMessage ?? "Thao tác thất bại, không rõ nguyên nhân.");
  }
  ctx.actions.setRowErrors(nextErrors);

  // Refetch để cập nhật stage/gate mới nhất — KHÔNG chờ tới nhịp poll kế (staff vừa hành
  // động, cần thấy kết quả ngay, giống hành vi mutation đơn ở `use-operations.ts`).
  void ctx.qc.invalidateQueries({ queryKey: kenoKeys.opsHub() });
}

/**
 * Mutation dùng chung cho 4 bulk action — `kind` quyết định path + verb trong toast.
 *
 * Dùng khi số kỳ chọn ≤ `BULK_MAX_DRAWS` (1 request duy nhất) — xem `useBulkBatchAction` cho
 * job nhiều lô. `SETTLE_SFN_ARN`/`KENO_VOID_SFN_ARN` KHÔNG gửi từ client (đó là secret hạ tầng
 * server-side, route tự đọc từ `env` — xem `bulk-settle/route.ts`). Type input ở client CHỈ có
 * `drawIds` (+ `reason` cho void) — `Omit` 2 field đó khỏi DTO gốc để tránh hiểu lầm phải gửi ARN.
 */
export function useBulkAction(kind: BulkActionKind) {
  const qc = useQueryClient();
  const { state, actions } = useHubContext();

  return useMutation({
    mutationFn: (input: BulkActionInput) => apiClient.post<BulkDrawActionOutput>(BULK_PATH[kind], input),
    onSuccess: (data, variables) => {
      applyBulkResult(data, variables.drawIds, { state, actions, qc });

      const verb = ACTION_VERB[kind];
      if (data.failureCount === 0) {
        toast.success(`Đã ${verb} ${data.successCount} kỳ.`);
      } else if (data.successCount === 0) {
        toast.error(`${verb.charAt(0).toUpperCase()}${verb.slice(1)} thất bại toàn bộ ${data.failureCount} kỳ.`, {
          description: data.results.find((r) => !r.ok)?.errorMessage,
        });
      } else {
        toast.warning(
          `Đã ${verb} ${data.successCount}/${data.results.length} kỳ — ${data.failureCount} kỳ lỗi, xem chi tiết tại dòng.`,
        );
      }
    },
    onError: (err) => {
      const { title, description } = formatErrorToast(err, "Thao tác hàng loạt thất bại.");
      toast.error(title, { description });
    },
  });
}

/**
 * Batch action — dùng khi số kỳ chọn VƯỢT `BULK_MAX_DRAWS` (p1-09 §12). Chia `drawIds` thành
 * nhiều lô `BULK_MAX_DRAWS` phần tử, gửi TUẦN TỰ qua `useBatchRunner` (hook chung, không biết
 * gì về Keno), áp `applyBulkResult` cho MỖI lô (selection/rowErrors cập nhật ngay theo từng
 * lô — staff thấy dòng biến mất/đỏ dần khi job đang chạy, không phải đợi tới cuối).
 *
 * Trả về `{ state, run }` — `state.status` dùng để render progress trong `BulkConfirmDialog`.
 * Toast CHỈ bắn 1 lần khi `run()` resolve (KHÔNG per-lô).
 */
export function useBulkBatchAction(kind: BulkActionKind) {
  const qc = useQueryClient();
  const { state, actions } = useHubContext();
  const batchRunner = useBatchRunner(BULK_MAX_DRAWS);

  const run = useCallback(
    async (drawIds: readonly string[], input: Omit<BulkActionInput, "drawIds">) => {
      const verb = ACTION_VERB[kind];

      const result = await batchRunner.run(drawIds, async (chunk): Promise<BatchChunkResult> => {
        const data = await apiClient.post<BulkDrawActionOutput>(BULK_PATH[kind], { ...input, drawIds: chunk });
        applyBulkResult(data, chunk, { state, actions, qc });
        return {
          successIds: data.results.filter((r) => r.ok).map((r) => r.drawId),
          failures: data.results.filter((r) => !r.ok).map((r) => ({ id: r.drawId, message: r.errorMessage })),
        };
      });

      if (result.failureCount === 0) {
        toast.success(`Đã ${verb} ${result.successCount} kỳ.`);
      } else if (result.successCount === 0) {
        toast.error(`${verb.charAt(0).toUpperCase()}${verb.slice(1)} thất bại toàn bộ ${result.failureCount} kỳ.`);
      } else {
        toast.warning(
          `Đã ${verb} ${result.successCount}/${drawIds.length} kỳ — ${result.failureCount} kỳ lỗi, xem chi tiết tại dòng.`,
        );
      }
      return result;
    },
    [batchRunner, kind, state, actions, qc],
  );

  return { batchState: batchRunner.state, resetBatch: batchRunner.reset, run };
}

/** Input cho `bulk-settle` — client KHÔNG gửi `SETTLE_SFN_ARN` (server tự đọc từ `env`). */
export type BulkSettleClientInput = Pick<BulkTriggerSettleInput, "drawIds">;
/** Input cho `bulk-void` — client KHÔNG gửi `KENO_VOID_SFN_ARN`. */
export type BulkVoidClientInput = Pick<BulkVoidDrawInput, "drawIds" | "reason">;
