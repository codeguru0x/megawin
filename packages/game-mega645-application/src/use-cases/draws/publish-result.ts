/**
 * Use Case: Publish Result (Mega 6/45) — single entry point cho "nhập/sửa kết quả".
 *
 * Nhận `{ winningNumbers, vietlottRef? }` từ 1 form thống nhất ở UI và TỰ quyết
 * định hành động dựa trên `settledAt` + so sánh result cũ vs mới:
 *
 *   1. Chưa từng settle (`settledAt == null`):
 *      - `salesClosed → published`: publish lần đầu.
 *      - `published → published`: sửa result trước khi settle (ghi đè).
 *
 *   2. Đã settle (`settledAt != null`) — result chắc chắn đã có, phân biệt qua
 *      `isSameMega645Result`:
 *      - Result KHÔNG đổi → chỉ cập nhật vietlottRef (nếu có). KHÔNG mở resettle.
 *      - Result CÓ đổi:
 *        · status `Settled`  → `republishResultAfterSettled` (settled→published,
 *          GIỮ settledAt, $unset financial/stats/settleSummary/jackpot, ghi
 *          result + vietlottRef) → mở luồng resettle.
 *        · status `Published` (đang chờ resettle) → `publishResult` (cùng bộ
 *          $unset + ghi đè result + vietlottRef).
 *
 * `Settling` → reject (đang kết sổ, không cho sửa).
 *
 * Mega 6/45 gồm 6 số chính ("01"–"45") unique, KHÔNG có số đặc biệt/bonus.
 */

import { UseCase } from "@megawin/app-core/use-cases";
import type { AuditActor } from "@megawin/audit/logger";
import { DrawStatus } from "@megawin/game-core/entities";
import type { DrawVietlottRef } from "@megawin/game-mega645/entities";
import { isSameMega645Result } from "@megawin/game-mega645/rules";
import { AppException } from "@megawin/shared/errors";
import { nowVN } from "@megawin/shared/utils";

import { DrawRepository } from "../../infras/repos/draw-repo";
import { auditPublishResult, auditRepublishResult } from "../../services/audit-log";
import type { PublishResultInput, PublishResultOutput } from "./dto/draw.dto";

const PUBLISHABLE_STATUSES = new Set<string>([DrawStatus.SalesClosed, DrawStatus.Published, DrawStatus.Settled]);

export class PublishResultUseCase extends UseCase<PublishResultInput, PublishResultOutput> {
  private readonly drawRepo = new DrawRepository();

  /** @inheritdoc */
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

    const winningNumbers = [...input.winningNumbers];
    const publishedAt = nowVN();

    if (input.vietlottRef) {
      await this.validateVietlottPeriodUnique(input.drawId, input.vietlottRef.drawPeriod);
    }

    // `settledAt` là high-water mark — set lần đầu khi FinalizeSettle chạy, KHÔNG
    // bị $unset khi republish. Dùng nó (KHÔNG dùng status) để biết đã từng settle.
    const hasSettledBefore = Boolean(draw.settledAt);

    // ── Nhánh 1: chưa từng settle → publish bình thường ──────────────────
    if (!hasSettledBefore) {
      return this.publish(input.drawId, winningNumbers, publishedAt, input.actor, input.vietlottRef);
    }

    // ── Nhánh 2: đã settle → quyết định theo result có đổi hay không ──────
    // Đã settle ⇒ result chắc chắn tồn tại.
    const resultUnchanged = isSameMega645Result(draw.result!, {
      winningNumbers,
      publishedAt: draw.result!.publishedAt,
    });

    if (resultUnchanged) {
      // Result không đổi → chỉ sửa metadata vietlottRef nếu có. KHÔNG resettle.
      if (input.vietlottRef) {
        const updated = await this.drawRepo.updateVietlottRef(input.drawId, input.vietlottRef);

        if (!updated) {
          throw AppException.internal(`Cập nhật Vietlott Ref kỳ ${input.drawId} thất bại.`);
        }

        // Kết quả KHÔNG đổi, chỉ sửa vietlottRef → không mở resettle. Vẫn ghi
        // audit qua auditPublishResult (số quay giữ nguyên) để lưu vết ai đổi ref
        // — theo quyết định gộp vietlottRef vào publish, không tách action riêng.
        // Fire-and-forget.
        auditPublishResult({
          actor: input.actor,
          drawId: input.drawId,
          winningNumbers: draw.result!.winningNumbers,
          vietlottRef: input.vietlottRef,
        });
      }

      // Giữ nguyên status + result hiện tại.
      return {
        drawId: input.drawId,
        status: draw.status,
        result: {
          winningNumbers,
          publishedAt: (draw.result!.publishedAt ?? publishedAt).toISOString(),
        },
      };
    }

    // Result CÓ đổi sau settle.
    if (draw.status === DrawStatus.Settled) {
      // settled → published (GIỮ settledAt, $unset financial/stats/settleSummary)
      // → mở luồng resettle.
      const updated = await this.drawRepo.republishResultAfterSettled(
        input.drawId,
        { winningNumbers, publishedAt },
        input.vietlottRef,
      );

      if (!updated) {
        throw AppException.internal(`Sửa kết quả kỳ ${input.drawId} thất bại.`);
      }

      // Sửa kết quả sau settle → republish (mở luồng resettle). Fire-and-forget.
      auditRepublishResult({
        actor: input.actor,
        drawId: input.drawId,
        winningNumbers,
        vietlottRef: input.vietlottRef,
      });

      return {
        drawId: input.drawId,
        status: DrawStatus.Published,
        result: {
          winningNumbers,
          publishedAt: publishedAt.toISOString(),
        },
      };
    }

    // status === Published (đã settle ≥ 1 lần, đang chờ resettle): ghi đè result mới.
    return this.publish(input.drawId, winningNumbers, publishedAt, input.actor, input.vietlottRef);
  }

  /** Ghi result (+ vietlottRef nếu có) qua `drawRepo.publishResult` → `Published`. */
  private async publish(
    drawId: string,
    winningNumbers: string[],
    publishedAt: Date,
    actor: AuditActor,
    vietlottRef?: DrawVietlottRef,
  ): Promise<PublishResultOutput> {
    const updated = await this.drawRepo.publishResult(drawId, { winningNumbers, publishedAt }, vietlottRef);

    if (!updated) {
      throw AppException.internal(`Publish kết quả kỳ ${drawId} thất bại. Vui lòng thử lại.`);
    }

    // Publish thường (chưa từng settle, hoặc đang chờ resettle ghi đè result mới)
    // → không mở resettle mới. Fire-and-forget.
    auditPublishResult({ actor, drawId, winningNumbers, vietlottRef });

    return {
      drawId,
      status: DrawStatus.Published,
      result: {
        winningNumbers,
        publishedAt: publishedAt.toISOString(),
      },
    };
  }

  /**
   * Invariant server-side cho `vietlottRef.drawPeriod`: KHÔNG kỳ nào khác được dùng cùng mã kỳ.
   * Query qua index sparse `idx_vietlott_drawPeriod`, loại trừ chính kỳ đang publish/sửa nên sửa
   * lại `vietlottRef` của chính nó không tự báo trùng.
   *
   * Chốt 30/08: BỎ check "đơn điệu tăng theo `drawTime`" của P0.2 (2 query neighbor + cần thêm
   * partial index `{drawTime}` mỗi game) — dialog publish ĐÃ cảnh báo khi staff nhập lệch
   * `suggestedPeriod`. Đánh đổi: typo ra mã kỳ CHƯA ai dùng giờ lưu được, detector còn lại là
   * staff đối chiếu trang Vietlott (`00-overview.md` §6).
   */
  private async validateVietlottPeriodUnique(drawId: string, drawPeriod: string): Promise<void> {
    const duplicate = await this.drawRepo.findDrawByVietlottPeriod(drawPeriod, drawId);

    if (duplicate) {
      throw AppException.badRequest(`Mã kỳ Vietlott "${drawPeriod}" đã được dùng cho kỳ ${duplicate.drawId}.`);
    }
  }
}
