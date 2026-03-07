/**
 * Use Case: Prepare Void (Lotto 5/35)
 *
 * ═══════════════════════════════════════════════════════════════════════
 * STEP 1 TRONG VOID FLOW
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Verify draw đã ở status "voiding" (do void-draw API đã transition trước đó).
 * Load context cần thiết cho void flow.
 *
 * ────────────────────────────────────────────────
 * PRECONDITION:
 * ────────────────────────────────────────────────
 *   - Admin đã gọi void-draw API → API chuyển draw sang "voiding" + ghi voidInfo
 *   - Step Function nhận { drawId } → gọi PrepareVoid
 *   - PrepareVoid verify lại status = "voiding" (phòng trường hợp bị gọi nhầm)
 *
 * ────────────────────────────────────────────────
 * OUTPUT (truyền cho tất cả steps sau qua $voidCtx):
 * ────────────────────────────────────────────────
 *   { drawId, drawDate, drawNo }
 *   → VoidEntries, SyncTicketSummaries, DispatchRefunds, FinalizeVoid
 *     đều nhận drawId từ context này.
 *
 * IDEMPOTENT: chỉ đọc draw, không ghi.
 * CRASH-SAFE: retry safe — chỉ validate + return context.
 */

import { AppException, InternalUseCase } from "@megawin/app-core/use-cases";
import { DrawStatus } from "@megawin/game-core/entities";
import { DrawRepository } from "../../infras/repos/draw-repo";
import type { VoidContext } from "./types";

export interface PrepareVoidInput {
  drawId: string;
}

export class PrepareVoidUseCase extends InternalUseCase<PrepareVoidInput, VoidContext> {
  private readonly drawRepo = new DrawRepository();

  protected async execute(input: PrepareVoidInput): Promise<VoidContext> {
    const { drawId } = input;

    // ── 1. Load draw từ DB ──
    const draw = await this.drawRepo.getDrawById(drawId);

    if (!draw) {
      throw AppException.notFound(`Draw ${drawId} không tồn tại.`);
    }

    // ── 2. Validate status = "voiding" ──
    // Draw phải đã được void-draw API chuyển sang "voiding" trước khi start step function.
    // Status flow: open/selling/closed → voiding (API) → void (FinalizeVoid)
    // Nếu draw ở status khác (vd: "settled", "open") → reject, không void.
    if (draw.status !== DrawStatus.Voiding) {
      throw AppException.businessRuleViolation(
        `Draw ${drawId} status = "${draw.status}" – expected "voiding".`,
      );
    }

    return {
      drawId,
      drawDate: draw.drawDate,
      drawNo: draw.drawNo,
    };
  }
}
