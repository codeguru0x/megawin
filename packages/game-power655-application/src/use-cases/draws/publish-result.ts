/**
 * Use Case: Publish Result (Power 6/55) — single entry point cho "nhập/sửa kết quả".
 *
 * Nhận `{ winningMain, bonusNumber, vietlottRef? }` từ 1 form thống nhất ở UI
 * và TỰ quyết định hành động dựa trên `settledAt` + so sánh result cũ vs mới:
 *
 *   1. Chưa từng settle (`settledAt == null`):
 *      - `salesClosed → published`: publish lần đầu.
 *      - `published → published`: sửa result trước khi settle (ghi đè).
 *
 *   2. Đã settle (`settledAt != null`) — result chắc chắn đã có, phân biệt qua
 *      `isSamePower655Result`:
 *      - Result KHÔNG đổi → chỉ cập nhật vietlottRef (nếu có). KHÔNG mở resettle.
 *      - Result CÓ đổi:
 *        · status `Settled`  → `republishResultAfterSettled` (settled→published,
 *          GIỮ settledAt, $unset financial/stats/settleSummary, ghi result +
 *          vietlottRef) → mở luồng resettle.
 *        · status `Published` (đang chờ resettle) → ghi đè result + vietlottRef.
 *
 * `Settling` → reject (đang kết sổ, không cho sửa).
 *
 * Validate input (6 số chính `"01"–"55"` unique + 1 bonus `"01"–"55"` khác số
 * chính) thực hiện ở route layer qua Zod schema `publishResultSchema` — use-case
 * không validate lại để tránh duplicate.
 */

import type { AuditActor } from "@megawin/audit/logger";
import { DrawStatus } from "@megawin/game-core/entities";
import type { DrawVietlottRef } from "@megawin/game-power655/entities";
import { isSamePower655Result } from "@megawin/game-power655/rules";
import { NextApiUseCase } from "@megawin/next/server";
import { AppException } from "@megawin/shared/errors";
import { nowVN } from "@megawin/shared/utils";

import { DrawRepository } from "../../infras/repos/draw-repo";
import { auditPublishResult, auditRepublishResult } from "../../services/audit-log";
import type { PublishResultInput, PublishResultOutput } from "./dto/draw.dto";

const PUBLISHABLE_STATUSES = new Set<string>([DrawStatus.SalesClosed, DrawStatus.Published, DrawStatus.Settled]);

export class PublishResultUseCase extends NextApiUseCase<PublishResultInput, PublishResultOutput> {
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

    const winningMain = input.winningMain;
    const bonusNumber = input.bonusNumber;
    const publishedAt = nowVN();

    // `settledAt` là high-water mark — set lần đầu khi FinalizeSettle chạy, KHÔNG
    // bị $unset khi republish. Dùng nó (KHÔNG dùng status) để biết đã từng settle.
    const hasSettledBefore = Boolean(draw.settledAt);

    // ── Nhánh 1: chưa từng settle → publish bình thường ──────────────────
    if (!hasSettledBefore) {
      return this.publish(input.drawId, winningMain, bonusNumber, publishedAt, input.actor, input.vietlottRef);
    }

    // ── Nhánh 2: đã settle → quyết định theo result có đổi hay không ──────
    // Đã settle ⇒ result chắc chắn tồn tại.
    const resultUnchanged = isSamePower655Result(draw.result!, {
      winningMain,
      bonusNumber,
      publishedAt: draw.result!.publishedAt,
    });

    if (resultUnchanged) {
      // Result không đổi → chỉ sửa metadata vietlottRef nếu có. KHÔNG resettle.
      if (input.vietlottRef) {
        const updated = await this.drawRepo.updateVietlottRef(input.drawId, input.vietlottRef);

        if (!updated) {
          throw AppException.internal(`Cập nhật Vietlott Ref kỳ ${input.drawId} thất bại — draw status đã thay đổi.`);
        }

        // Kết quả KHÔNG đổi, chỉ sửa vietlottRef → không mở resettle. Vẫn ghi
        // audit qua auditPublishResult (số quay giữ nguyên) để lưu vết ai đổi ref
        // — theo quyết định gộp vietlottRef vào publish, không tách action riêng.
        // Fire-and-forget.
        auditPublishResult({
          actor: input.actor,
          drawId: input.drawId,
          winningMain: draw.result!.winningMain,
          bonusNumber: draw.result!.bonusNumber,
          vietlottRef: input.vietlottRef,
        });
      }

      // Giữ nguyên status + result hiện tại.
      return {
        drawId: input.drawId,
        status: draw.status,
        result: {
          winningMain,
          bonusNumber,
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
        { winningMain, bonusNumber, publishedAt },
        input.vietlottRef,
      );

      if (!updated) {
        throw AppException.internal(
          `Sửa kết quả kỳ ${input.drawId} thất bại — draw không còn ở "settled" (có thể đã bị thay đổi đồng thời).`,
        );
      }

      // Sửa kết quả sau settle → republish (mở luồng resettle). Fire-and-forget.
      auditRepublishResult({
        actor: input.actor,
        drawId: input.drawId,
        winningMain,
        bonusNumber,
        vietlottRef: input.vietlottRef,
      });

      return {
        drawId: input.drawId,
        status: DrawStatus.Published,
        result: {
          winningMain,
          bonusNumber,
          publishedAt: publishedAt.toISOString(),
        },
      };
    }

    // status === Published (đã settle ≥ 1 lần, đang chờ resettle): ghi đè result mới.
    return this.publish(input.drawId, winningMain, bonusNumber, publishedAt, input.actor, input.vietlottRef);
  }

  /** Ghi result (+ vietlottRef nếu có) qua `drawRepo.publishResult` → `Published`. */
  private async publish(
    drawId: string,
    winningMain: string[],
    bonusNumber: string,
    publishedAt: Date,
    actor: AuditActor,
    vietlottRef?: DrawVietlottRef,
  ): Promise<PublishResultOutput> {
    const updated = await this.drawRepo.publishResult(drawId, { winningMain, bonusNumber, publishedAt }, vietlottRef);

    if (!updated) {
      throw AppException.internal(`Publish kết quả kỳ ${drawId} thất bại. Vui lòng thử lại.`);
    }

    // Publish thường (lần đầu chưa settle, hoặc ghi đè khi đang chờ resettle) →
    // không mở resettle mới. Fire-and-forget.
    auditPublishResult({ actor, drawId, winningMain, bonusNumber, vietlottRef });

    return {
      drawId,
      status: DrawStatus.Published,
      result: {
        winningMain,
        bonusNumber,
        publishedAt: publishedAt.toISOString(),
      },
    };
  }
}
