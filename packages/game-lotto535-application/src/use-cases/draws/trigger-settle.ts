import { NextApiUseCase } from "@megawin/next/server";
import { AppException } from "@megawin/shared/errors";
import { DrawStatus } from "@megawin/game-core/entities";
import { toExecutionName } from "@megawin/game-core/utils";
import { startExecution, ExecutionAlreadyExists } from "@megawin/app-core/aws/sf";
import { isSplitCycleDraw } from "@megawin/game-lotto535/rules";
import { DrawRepository } from "../../infras/repos/draw-repo";
import { EntryRepository } from "../../infras/repos/entry-repo";
import { GetGlobalConfigInternalUseCase } from "../game-config/get-global-config-internal";
import { JackpotCycleRepository } from "../../infras/repos/jackpot-cycle-repo";
import type { TriggerSettleInput, TriggerSettleOutput } from "./dto/draw.dto";
import { logError } from "@megawin/shared/utils";

/**
 * Kết sổ kỳ quay Lotto 5/35.
 *
 * Flow:
 *   1. Validate draw (tồn tại, có result)
 *   2. Guard trạng thái — chỉ kết sổ được khi:
 *      - Chưa từng kết sổ (`settledAt == null`). Kỳ đã settle không settle lại
 *        (Lotto 5/35 không có resettle).
 *      - Status là `published` (lần đầu) hoặc `settling` (retry idempotent).
 *        Mọi status khác → reject để tránh gọi lặp ở trạng thái không phù hợp.
 *   3. Xác định split cycle (Jackpot >= threshold + drawNo === 2)
 *   4. Transition status: published → settling (atomic, kèm splitInfo)
 *      - Nếu draw đã ở settling (retry) → skip transition
 *   5. Start Settle Step Function (deterministic name → idempotent)
 *
 * Idempotent: staff nhấn lại bao nhiêu lần cũng an toàn.
 * Nếu SF đã đang chạy (cùng deterministic name), AWS ném `ExecutionAlreadyExists`
 * → use case bắt lỗi đó và coi như thành công.
 */
export class TriggerSettleUseCase extends NextApiUseCase<TriggerSettleInput, TriggerSettleOutput> {
  private readonly drawRepo = new DrawRepository();
  private readonly entryRepo = new EntryRepository();
  private readonly cycleRepo = new JackpotCycleRepository();
  private readonly getGlobalConfig = new GetGlobalConfigInternalUseCase();

  protected async execute(input: TriggerSettleInput): Promise<TriggerSettleOutput> {
    if (!input.SETTLE_SFN_ARN) {
      throw AppException.badRequest("Worker kết sổ Lotto 5/35 không được cấu hình.");
    }

    const draw = await this.drawRepo.getDrawById(input.drawId);
    if (!draw) {
      throw AppException.notFound(`Kỳ quay ${input.drawId} không tồn tại.`);
    }

    if (!draw.result) {
      throw AppException.badRequest("Chưa có kết quả quay – phải publish result trước khi kết sổ.");
    }

    // Đã từng kết sổ (settledAt là high-water mark) → không settle lại bằng use
    // case này. Lotto 5/35 không có resettle nên kỳ đã settle là trạng thái cuối.
    if (draw.settledAt) {
      throw new AppException(
        "DRAW_ALREADY_SETTLED",
        `Không thể kết sổ – kỳ quay ${input.drawId} đã được kết sổ rồi.`,
      );
    }

    // Guard thứ tự kết sổ: phải settle TUẦN TỰ theo thời gian. Nếu còn kỳ trước
    // đó (drawId < kỳ này) CHƯA HOÀN THÀNH (chưa settled và chưa void) → chặn,
    // bắt buộc hoàn tất kỳ trước rồi mới kết sổ kỳ này. Tránh trả thưởng/đối soát
    // sai thứ tự thời gian (không thể kết sổ kỳ chiều khi kỳ sáng còn dở).
    const unfinishedPrior = await this.drawRepo.findUnfinishedDrawBefore(input.drawId);
    if (unfinishedPrior) {
      throw new AppException(
        "DRAW_SETTLE_ORDER",
        `Không thể kết sổ – kỳ quay ${unfinishedPrior.drawId} trước đó chưa hoàn thành. Phải kết sổ hoặc huỷ kỳ trước theo thứ tự.`,
      );
    }

    // Chỉ kết sổ được khi đang ở Published (lần đầu) hoặc Settling (retry
    // idempotent sau khi startExecution fail giữa chừng). Mọi status khác —
    // Scheduled/SalesOpen/SalesClosed/Settled/Voiding/Void — reject ngay,
    // tránh gọi đi gọi lại ở trạng thái không phù hợp.
    if (draw.status !== DrawStatus.Published && draw.status !== DrawStatus.Settling) {
      throw new AppException(
        "DRAW_INVALID_TRANSITION",
        `Không thể kết sổ – draw đang ở trạng thái "${draw.status}", chỉ kết sổ được khi ở "published".`,
      );
    }

    let splitCycle = false;

    if (draw.status !== DrawStatus.Settling) {
      const [globalConfig, activeCycle] = await Promise.all([
        this.getGlobalConfig.run(),
        this.cycleRepo.getActiveCycle(),
      ]);

      const jackpotCurrentAmount = activeCycle?.currentAmount ?? globalConfig.jackpot.seedAmount;

      splitCycle = isSplitCycleDraw(
        jackpotCurrentAmount,
        globalConfig.jackpot.splitThreshold,
        false,
        draw.drawNo,
      );

      // isSplitCycle được ghi trước lên draw để UI hiển thị ngay khi trigger settle.
      // Chi tiết split (tierAllocations, splitAmount...) sẽ được lưu vào JackpotCycle
      // bởi FinalizeSettle sau khi tính toán xong — không lưu trên draw document.
      const isSplitCycle = splitCycle ? true : undefined;

      const updated = await this.drawRepo.triggerSettle(input.drawId, isSplitCycle);

      if (!updated) {
        throw new AppException(
          "DRAW_INVALID_TRANSITION",
          `Không thể kết sổ – draw hiện tại không ở trạng thái "published".`,
        );
      }
    }

    try {
      await startExecution({
        stateMachineArn: input.SETTLE_SFN_ARN,
        name: toExecutionName(input.drawId),
        input: { drawId: input.drawId },
      });
    } catch (err) {
      // ExecutionAlreadyExists = phiên kết sổ này đã được start trước đó
      // (retry/replay). KHÔNG phải lỗi — coi như thành công idempotent.
      if (err instanceof ExecutionAlreadyExists) {
        return {
          drawId: input.drawId,
          status: DrawStatus.Settling,
          isSplitCycle: splitCycle,
        };
      }

      logError("TriggerSettle", err, { drawId: input.drawId });
      throw new AppException("SFN_START_FAILED", `Không thể khởi chạy settle worker`);
    }

    return {
      drawId: input.drawId,
      status: DrawStatus.Settling,
      isSplitCycle: splitCycle,
    };
  }
}
