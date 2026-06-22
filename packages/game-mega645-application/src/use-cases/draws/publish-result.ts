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
 *          GIỮ settledAt, $unset financial/stats/settleSummary, ghi result +
 *          vietlottRef) → mở luồng resettle.
 *        · status `Published` (đang chờ resettle) → ghi đè result + vietlottRef.
 *
 * `Settling` → reject (đang kết sổ, không cho sửa).
 *
 * Mega 6/45 gồm 6 số chính ("01"–"45") unique, KHÔNG có số đặc biệt/bonus.
 */

import { NextApiUseCase } from "@megawin/next/server";
import { AppException } from "@megawin/shared/errors";
import { DrawStatus } from "@megawin/game-core/entities";
import { isSameMega645Result } from "@megawin/game-mega645/rules";
import type { DrawVietlottRef } from "@megawin/game-mega645/entities";
import { DrawRepository } from "../../infras/repos/draw-repo";
import type { PublishResultInput, PublishResultOutput } from "./dto/draw.dto";
import { nowVN } from "@megawin/shared/utils";

const PUBLISHABLE_STATUSES = new Set<string>([
  DrawStatus.SalesClosed,
  DrawStatus.Published,
  DrawStatus.Settled,
]);

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

    const winningNumbers = [...input.winningNumbers];
    const publishedAt = nowVN();

    // `settledAt` là high-water mark — set lần đầu khi FinalizeSettle chạy, KHÔNG
    // bị $unset khi republish. Dùng nó (KHÔNG dùng status) để biết đã từng settle.
    const hasSettledBefore = Boolean(draw.settledAt);

    // ── Nhánh 1: chưa từng settle → publish bình thường ──────────────────
    if (!hasSettledBefore) {
      return this.publish(input.drawId, winningNumbers, publishedAt, input.vietlottRef);
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
    return this.publish(input.drawId, winningNumbers, publishedAt, input.vietlottRef);
  }

  /** Ghi result (+ vietlottRef nếu có) qua `drawRepo.publishResult` → `Published`. */
  private async publish(
    drawId: string,
    winningNumbers: string[],
    publishedAt: Date,
    vietlottRef?: DrawVietlottRef,
  ): Promise<PublishResultOutput> {
    const updated = await this.drawRepo.publishResult(
      drawId,
      { winningNumbers, publishedAt },
      vietlottRef,
    );

    if (!updated) {
      throw AppException.internal(`Publish kết quả kỳ ${drawId} thất bại. Vui lòng thử lại.`);
    }

    return {
      drawId,
      status: DrawStatus.Published,
      result: {
        winningNumbers,
        publishedAt: publishedAt.toISOString(),
      },
    };
  }
}
