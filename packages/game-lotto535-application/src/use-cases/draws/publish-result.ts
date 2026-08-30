/**
 * Use Case: Publish Result (Lotto 5/35) — single entry point nhập/sửa kết quả.
 *
 * Đã settle: so `isSameLotto535Result` → republish mở resettle hoặc chỉ sửa vietlottRef.
 */

import { UseCase } from "@megawin/app-core/use-cases";
import type { AuditActor } from "@megawin/audit/logger";
import { DrawStatus } from "@megawin/game-core/entities";
import type { DrawVietlottRef } from "@megawin/game-lotto535/entities";
import { isSameLotto535Result } from "@megawin/game-lotto535/rules";
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

    // Invariant server-side: chỉ chạy khi input CÓ vietlottRef (giữ optional — `undefined`
    // nghĩa là "chỉ sửa số, giữ ref cũ", KHÔNG được validate như đang xoá ref).
    // Bắt trùng mã kỳ giữa 2 kỳ — KHÔNG bắt được typo ra mã kỳ chưa ai dùng, cũng KHÔNG bắt
    // được lệch neo cấu hình (xem 00-overview.md §6).
    if (input.vietlottRef) {
      await this.validateVietlottPeriodUnique(input.drawId, input.vietlottRef.drawPeriod);
    }

    const winningMain = [...input.winningMain];
    const winningSpecial = input.winningSpecial;
    const publishedAt = nowVN();

    const hasSettledBefore = Boolean(draw.settledAt);

    if (!hasSettledBefore) {
      return this.publishFirstTime(
        input.drawId,
        winningMain,
        winningSpecial,
        publishedAt,
        input.actor,
        input.vietlottRef,
      );
    }

    const resultUnchanged = isSameLotto535Result(draw.result!, {
      winningMain,
      winningSpecial,
      publishedAt: draw.result!.publishedAt,
    });

    if (resultUnchanged) {
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
          winningMain: draw.result!.winningMain,
          winningSpecial: draw.result!.winningSpecial,
          vietlottRef: input.vietlottRef,
        });
      }

      return {
        drawId: input.drawId,
        status: draw.status,
        result: {
          winningMain,
          winningSpecial,
          publishedAt: (draw.result!.publishedAt ?? publishedAt).toISOString(),
        },
      };
    }

    if (draw.status === DrawStatus.Settled) {
      const updated = await this.drawRepo.republishResultAfterSettled(
        input.drawId,
        { winningMain, winningSpecial, publishedAt },
        input.vietlottRef,
      );

      if (!updated) {
        throw AppException.internal(`Sửa kết quả kỳ ${input.drawId} thất bại — draw không còn ở "settled".`);
      }

      // Sửa kết quả sau settle → republish (mở luồng resettle). Fire-and-forget.
      auditRepublishResult({
        actor: input.actor,
        drawId: input.drawId,
        winningMain,
        winningSpecial,
        vietlottRef: input.vietlottRef,
      });

      return {
        drawId: input.drawId,
        status: DrawStatus.Published,
        result: {
          winningMain,
          winningSpecial,
          publishedAt: publishedAt.toISOString(),
        },
      };
    }

    const updated = await this.drawRepo.publishResult(
      input.drawId,
      { winningMain, winningSpecial, publishedAt },
      input.vietlottRef,
    );

    if (!updated) {
      throw AppException.internal(`Publish kết quả kỳ ${input.drawId} thất bại.`);
    }

    // Ghi đè result mới khi đang chờ resettle (status Published, đã settle ≥ 1
    // lần): publish thường, không mở resettle mới. Fire-and-forget.
    auditPublishResult({
      actor: input.actor,
      drawId: input.drawId,
      winningMain,
      winningSpecial,
      vietlottRef: input.vietlottRef,
    });

    return {
      drawId: input.drawId,
      status: DrawStatus.Published,
      result: {
        winningMain,
        winningSpecial,
        publishedAt: publishedAt.toISOString(),
      },
    };
  }

  private async publishFirstTime(
    drawId: string,
    winningMain: string[],
    winningSpecial: string,
    publishedAt: Date,
    actor: AuditActor,
    vietlottRef?: DrawVietlottRef,
  ): Promise<PublishResultOutput> {
    const updated = await this.drawRepo.publishResult(
      drawId,
      { winningMain, winningSpecial, publishedAt },
      vietlottRef,
    );

    if (!updated) {
      throw AppException.internal(`Publish kết quả kỳ ${drawId} thất bại.`);
    }

    // Publish lần đầu (chưa từng settle) → publish thường. Fire-and-forget.
    auditPublishResult({ actor, drawId, winningMain, winningSpecial, vietlottRef });

    return {
      drawId,
      status: DrawStatus.Published,
      result: {
        winningMain,
        winningSpecial,
        publishedAt: publishedAt.toISOString(),
      },
    };
  }

  /**
   * Invariant server-side cho `vietlottRef.drawPeriod`: KHÔNG kỳ nào khác được dùng cùng mã kỳ.
   * Query qua index sparse `idx_vietlott_drawPeriod`, loại trừ chính kỳ đang publish/sửa nên sửa
   * lại `vietlottRef` của chính nó không tự báo trùng.
   *
   * Chốt 30/08: BỎ check "`drawPeriod` đơn điệu tăng theo `drawTime`" của P0.2 (2 query neighbor,
   * lại cần thêm partial index `{drawTime}` mỗi game vì không index nào có `drawTime` dẫn đầu) —
   * dialog publish ĐÃ cảnh báo khi staff nhập lệch `suggestedPeriod`, nên check đó gần như chỉ
   * lặp lại việc UI làm. Đánh đổi: typo ra mã kỳ CHƯA ai dùng giờ lưu được, detector còn lại là
   * staff đối chiếu trang Vietlott (`00-overview.md` §6).
   */
  private async validateVietlottPeriodUnique(drawId: string, drawPeriod: string): Promise<void> {
    const duplicate = await this.drawRepo.findDrawByVietlottPeriod(drawPeriod, drawId);

    if (duplicate) {
      throw AppException.badRequest(`Mã kỳ Vietlott "${drawPeriod}" đã được dùng cho kỳ ${duplicate.drawId}.`);
    }
  }
}
