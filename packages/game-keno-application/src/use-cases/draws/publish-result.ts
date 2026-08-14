/**
 * Use Case: Publish Result (Keno) — single entry point cho "nhập/sửa kết quả".
 *
 * Nhận `{ winningNumbers, vietlottRef? }` từ 1 form thống nhất ở UI (mọi trạng
 * thái dùng chung form) và TỰ quyết định hành động dựa trên `settledAt`
 * (high-water mark) + so sánh winningNumbers cũ vs mới:
 *
 *   1. Chưa từng settle (`settledAt == null`):
 *      - `salesClosed → published`: publish lần đầu (ghi result + vietlottRef).
 *      - `published → published`: sửa result trước khi settle (ghi đè + vietlottRef).
 *
 *   2. Đã settle (`settledAt != null`) — result chắc chắn đã có, phân biệt qua
 *      `isSameKenoResult`:
 *      - winningNumbers KHÔNG đổi → chỉ cập nhật vietlottRef (nếu có), GIỮ NGUYÊN
 *        status và data settle. KHÔNG mở resettle.
 *      - winningNumbers CÓ đổi:
 *        · status `Settled`  → `republishResultAfterSettled` (settled→published,
 *          $unset financial/stats/settleSummary, ghi result + vietlottRef trong
 *          cùng 1 query) → mở luồng resettle.
 *        · status `Published` (đang chờ resettle) → ghi đè result + vietlottRef,
 *          giữ `Published` (vẫn chờ resettle).
 *
 * `Settling` → reject (đang kết sổ, không cho sửa).
 *
 * Việc tách winningNumbers (tham gia matching/payout → buộc resettle) khỏi
 * vietlottRef (metadata đối soát → KHÔNG resettle) được giữ nguyên ở repo layer;
 * use case này chỉ orchestrate gọi đúng method.
 *
 * Validate input (winningNumbers length + range + unique) thực hiện ở route
 * layer qua Zod schema `publishResultSchema` — use-case không validate lại
 * để tránh duplicate.
 */

import { UseCase } from "@megawin/app-core/use-cases";
import { DrawStatus } from "@megawin/game-core/entities";
import { computeDrawStats } from "@megawin/game-keno/helpers";
import { isSameKenoResult } from "@megawin/game-keno/rules";
import { AppException } from "@megawin/shared/errors";
import { nowVN } from "@megawin/shared/utils";

import { DrawRepository } from "../../infras/repos/draw-repo";
import { auditPublishResult, auditRepublishResult } from "../../services/audit-log";
import type { PublishResultInput, PublishResultOutput } from "./dto/draw.dto";

const PUBLISHABLE_STATUSES = new Set<string>([DrawStatus.SalesClosed, DrawStatus.Published, DrawStatus.Settled]);

export class PublishResultUseCase extends UseCase<PublishResultInput, PublishResultOutput> {
  private readonly drawRepo = new DrawRepository();

  protected async execute(input: PublishResultInput): Promise<PublishResultOutput> {
    const draw = await this.drawRepo.getDrawById(input.drawId);

    if (!draw) {
      throw AppException.notFound(`Kỳ quay ${input.drawId} không tồn tại.`);
    }

    if (!PUBLISHABLE_STATUSES.has(draw.status)) {
      throw new AppException(
        "DRAW_INVALID_TRANSITION",
        `Không thể publish kết quả – draw ở trạng thái "${draw.status}".`,
      );
    }

    const publishedAt = nowVN();
    // `settledAt` là high-water mark — set lần đầu khi FinalizeSettle chạy, KHÔNG
    // bị $unset khi republish. Dùng nó (KHÔNG dùng status) để biết đã từng settle.
    const hasSettledBefore = Boolean(draw.settledAt);

    // ── Nhánh 1: chưa từng settle → publish bình thường (result + vietlottRef) ──
    if (!hasSettledBefore) {
      return this.publish(input, publishedAt);
    }

    // ── Nhánh 2: đã settle → quyết định theo winningNumbers có đổi hay không ──
    // Đã settle ⇒ result chắc chắn tồn tại (FinalizeSettle yêu cầu có result).
    // KHÔNG đổi → chỉ là sửa metadata vietlottRef → KHÔNG resettle.
    const resultUnchanged = isSameKenoResult(draw.result!.winningNumbers, input.winningNumbers);

    if (resultUnchanged) {
      if (input.vietlottRef) {
        const updated = await this.drawRepo.updateVietlottRef(input.drawId, input.vietlottRef);

        if (!updated) {
          throw AppException.internal(`Cập nhật Vietlott Ref kỳ ${input.drawId} thất bại — draw status đã thay đổi.`);
        }

        // Kết quả KHÔNG đổi, chỉ sửa vietlottRef → không mở resettle. Vẫn ghi
        // audit qua auditPublishResult (winningNumbers giữ nguyên) để lưu vết
        // ai đổi ref — theo quyết định gộp vietlottRef vào publish, không tách
        // action riêng. Fire-and-forget.
        auditPublishResult({
          actor: input.actor,
          drawId: input.drawId,
          winningNumbers: draw.result!.winningNumbers,
          vietlottRef: input.vietlottRef,
        });
      }

      // Giữ nguyên status + result hiện tại (không đổi gì về kết quả/settle).
      return this.toOutput(input, draw.status, draw.result!.publishedAt ?? publishedAt);
    }

    // winningNumbers CÓ đổi sau settle.
    const stats = computeDrawStats(input.winningNumbers);
    const resultData = { winningNumbers: input.winningNumbers, ...stats, publishedAt };

    if (draw.status === DrawStatus.Settled) {
      // settled → published + $unset data settle cũ → mở luồng resettle.
      // Ghi result + vietlottRef trong CÙNG 1 query (vietlottRef không kéo
      // resettle, nhưng gộp vào tránh thừa 1 round-trip mỗi lần sửa).
      const updated = await this.drawRepo.republishResultAfterSettled(input.drawId, resultData, input.vietlottRef);

      if (!updated) {
        throw AppException.internal(
          `Sửa kết quả kỳ ${input.drawId} thất bại — draw không còn ở "settled" (có thể đã bị thay đổi đồng thời).`,
        );
      }

      // Sửa kết quả sau settle → republish (mở luồng resettle). Fire-and-forget.
      auditRepublishResult({
        actor: input.actor,
        drawId: input.drawId,
        winningNumbers: input.winningNumbers,
        vietlottRef: input.vietlottRef,
      });

      return this.toOutput(input, DrawStatus.Published, publishedAt);
    }

    // status === Published (đã settle ≥ 1 lần, đang chờ resettle): ghi đè result
    // mới + vietlottRef, giữ Published. publishResult cho phép Published→Published.
    return this.publish(input, publishedAt);
  }

  /** Ghi result (+ vietlottRef nếu có) qua `drawRepo.publishResult`, → `Published`. */
  private async publish(input: PublishResultInput, publishedAt: Date): Promise<PublishResultOutput> {
    const stats = computeDrawStats(input.winningNumbers);
    const resultData = { winningNumbers: input.winningNumbers, ...stats, publishedAt };

    const updated = await this.drawRepo.publishResult(input.drawId, resultData, input.vietlottRef);

    if (!updated) {
      throw AppException.internal(`Publish kết quả kỳ ${input.drawId} thất bại. Vui lòng thử lại.`);
    }

    // Publish lần đầu / sửa trước settle / ghi đè Published (chờ resettle):
    // đều là publish thường (không mở resettle mới). Fire-and-forget.
    auditPublishResult({
      actor: input.actor,
      drawId: input.drawId,
      winningNumbers: input.winningNumbers,
      vietlottRef: input.vietlottRef,
    });

    return this.toOutput(input, DrawStatus.Published, publishedAt);
  }

  /** Build output shape thống nhất. */
  private toOutput(input: PublishResultInput, status: string, publishedAt: Date): PublishResultOutput {
    return {
      drawId: input.drawId,
      status,
      result: {
        winningNumbers: input.winningNumbers,
        publishedAt: publishedAt.toISOString(),
      },
    };
  }
}
