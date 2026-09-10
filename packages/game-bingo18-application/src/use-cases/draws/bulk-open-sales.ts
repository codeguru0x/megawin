import { UseCase } from "@megawin/app-core/use-cases";
import { AUDIT_ACTIONS } from "@megawin/audit/entities";
import { runBulkDrawAction } from "@megawin/game-core-application/use-cases/bulk-draw-action";
import { APP_ERROR_CODES, AppException } from "@megawin/shared/errors";
import { nowVN } from "@megawin/shared/utils";

import { DrawRepository } from "../../infras/repos/draw-repo";
import { auditBulkDrawAction } from "../../services/audit-log";
import type { BulkDrawActionOutput, BulkDrawActionResult, BulkDrawIdsInput } from "./dto/bulk-draw-action.dto";
import { OpenSalesUseCase } from "./open-sales";

/** Mã lỗi riêng cho kỳ mở bán quá hạn — KHÔNG có trong error registry của `OpenSalesUseCase` đơn. */
const DRAW_SALES_WINDOW_CLOSED = "DRAW_SALES_WINDOW_CLOSED";

/**
 * Mở bán hàng loạt — {@link OpenSalesUseCase} cho từng kỳ, CÓ kiểm tra cửa sổ bán.
 *
 * Dùng cho gate `PendingOpen` (quên mở bán) và `Halted` (đã ngắt bán, giờ mở lại) — cả hai
 * thường xuất hiện thành DÃY kỳ liền nhau.
 *
 * KIỂM TRA THÊM `now < sales.closeAt` trước khi gọi: {@link OpenSalesUseCase} chỉ check
 * `status`, không check cửa sổ bán, nên mở bán kỳ đã quá `closeAt` sẽ "thành công" nhưng tạo
 * ra kỳ không nhận được vé nào. Kỳ quá hạn trả `DRAW_SALES_WINDOW_CLOSED`, KHÔNG gọi
 * `OpenSalesUseCase`.
 *
 * Đây KHÔNG phải duplicate validation của Zod (`code-quality-standards.mdc` §8): là business
 * rule phụ thuộc dữ liệu DB (`sales.closeAt` của từng kỳ), Zod ở route không thể biết.
 *
 * Số DB call KHÔNG tỷ lệ với N kỳ ngoài phần use-case đơn: đúng 1 query
 * `getCloseAtByDrawIds` cho cả lô, KHÔNG N lần `getDrawById`.
 */
export class BulkOpenSalesUseCase extends UseCase<BulkDrawIdsInput, BulkDrawActionOutput> {
  private readonly drawRepo = new DrawRepository();
  private readonly openSales = new OpenSalesUseCase();

  protected async execute(input: BulkDrawIdsInput): Promise<BulkDrawActionOutput> {
    // Dedupe SỚM — nguồn chân lý duy nhất cho thứ tự cuối cùng, khớp với cách
    // `runBulkDrawAction` tự dedupe nội bộ (2 lần dedupe cùng logic không gây lệch).
    const uniqueDrawIds = [...new Set(input.drawIds)];

    // 1 query duy nhất cho cả lô — KHÔNG N lần getDrawById.
    const closeAtByDrawId = await this.drawRepo.getCloseAtByDrawIds(uniqueDrawIds);

    const now = nowVN();
    const eligibleDrawIds: string[] = [];
    // Map kết quả các kỳ KHÔNG cần gọi use-case đơn (quá hạn / không tồn tại) — gộp lại theo
    // đúng thứ tự uniqueDrawIds ở bước cuối, tránh chia nhóm rồi gộp sai thứ tự.
    const precomputedResults = new Map<string, BulkDrawActionResult>();

    for (const drawId of uniqueDrawIds) {
      const closeAt = closeAtByDrawId.get(drawId);

      if (!closeAt) {
        // Kỳ không tồn tại trong DB — không gọi use-case đơn, trả lỗi tại đây luôn.
        precomputedResults.set(drawId, {
          drawId,
          ok: false,
          errorCode: APP_ERROR_CODES.DRAW_NOT_FOUND,
          errorMessage: `Kỳ quay ${drawId} không tồn tại.`,
        });
        continue;
      }

      if (now >= closeAt) {
        precomputedResults.set(drawId, {
          drawId,
          ok: false,
          errorCode: DRAW_SALES_WINDOW_CLOSED,
          errorMessage: `Không thể mở bán – kỳ quay ${drawId} đã quá thời điểm đóng bán (${closeAt.toISOString()}).`,
        });
        continue;
      }

      eligibleDrawIds.push(drawId);
    }

    // Chỉ chạy runner cho nhóm hợp lệ — nhóm quá hạn/không tồn tại đã có kết quả sẵn,
    // không cần try/catch của runner.
    const ranOutput =
      eligibleDrawIds.length > 0
        ? await runBulkDrawAction(eligibleDrawIds, async (drawId) => {
            await this.openSales.run({ drawId, actor: input.actor });
          })
        : { results: [], successCount: 0, failureCount: 0 };

    for (const result of ranOutput.results) {
      precomputedResults.set(result.drawId, result);
    }

    // Gộp lại THEO ĐÚNG THỨ TỰ uniqueDrawIds — Map tránh mất thứ tự khi chia 2 nhóm.
    const results = uniqueDrawIds.map((drawId) => {
      const result = precomputedResults.get(drawId);
      // Không thể thiếu: mọi drawId đều được set ở 1 trong 2 nhánh trên.
      if (!result) {
        throw AppException.internal(`Thiếu kết quả bulk-open-sales cho kỳ ${drawId} — lỗi logic điều phối.`);
      }
      return result;
    });

    const successCount = results.filter((r) => r.ok).length;
    const output: BulkDrawActionOutput = {
      results,
      successCount,
      failureCount: results.length - successCount,
    };

    auditBulkDrawAction({
      action: AUDIT_ACTIONS.draw.bulkOpenSales,
      actor: input.actor,
      // `uniqueDrawIds` — KHÔNG `input.drawIds`: đã dedupe ở đầu method, đúng bằng
      // `successCount + failureCount`. Dùng bản chưa dedupe sẽ ghi audit lệch số.
      drawIds: uniqueDrawIds,
      successCount: output.successCount,
      failureCount: output.failureCount,
    });

    return output;
  }
}
