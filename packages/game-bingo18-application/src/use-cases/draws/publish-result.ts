/**
 * Use Case: Publish Result (Bingo 18) — single entry point cho "nhập/sửa kết quả".
 *
 * Nhận `{ numbers, vietlottRef? }` từ 1 form thống nhất ở UI (mọi trạng thái
 * dùng chung form) và TỰ quyết định hành động dựa trên `settledAt`
 * (high-water mark) + so sánh `numbers` cũ vs mới:
 *
 *   1. Chưa từng settle (`settledAt == null`):
 *      - `salesClosed → published`: publish lần đầu (ghi result + vietlottRef).
 *      - `published → published`: sửa result trước khi settle (ghi đè + vietlottRef).
 *
 *   2. Đã settle (`settledAt != null`) — result chắc chắn đã có, phân biệt qua
 *      `isSameBingo18Result`:
 *      - numbers KHÔNG đổi → chỉ cập nhật vietlottRef (nếu có), GIỮ NGUYÊN status
 *        và data settle. KHÔNG mở resettle.
 *      - numbers CÓ đổi:
 *        · status `Settled`  → `republishResultAfterSettled` (settled→published,
 *          $unset financial/stats/settleSummary, ghi result + vietlottRef trong
 *          cùng 1 query) → mở luồng resettle.
 *        · status `Published` (đang chờ resettle) → ghi đè result + vietlottRef,
 *          giữ `Published` (vẫn chờ resettle).
 *
 * `Settling` → reject (đang kết sổ, không cho sửa).
 *
 * Việc tách numbers (tham gia matching/payout → buộc resettle) khỏi vietlottRef
 * (metadata đối soát → KHÔNG resettle) được giữ nguyên ở repo layer; use case
 * này chỉ orchestrate gọi đúng method.
 *
 * Validate input (numbers length + range) thực hiện ở route layer qua Zod
 * schema `publishResultSchema` — use-case không validate lại để tránh duplicate.
 */

import { NextApiUseCase } from "@megawin/next/server";
import { AppException } from "@megawin/shared/errors";
import { DrawStatus } from "@megawin/game-core/entities";
import { isSameBingo18Result } from "@megawin/game-bingo18/rules";
import { nowVN } from "@megawin/shared/utils";
import { DrawRepository } from "../../infras/repos/draw-repo";
import type { PublishResultInput, PublishResultOutput } from "./dto/draw.dto";

const PUBLISHABLE_STATUSES = new Set<string>([
  DrawStatus.SalesClosed,
  DrawStatus.Published,
  DrawStatus.Settled,
]);

export class PublishResultUseCase extends NextApiUseCase<PublishResultInput, PublishResultOutput> {
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

    const numbers = [...input.numbers];
    // sum tính lại từ numbers mới — đồng nhất mọi nhánh.
    const sum = numbers[0]! + numbers[1]! + numbers[2]!;
    const publishedAt = nowVN();
    // `settledAt` là high-water mark — set lần đầu khi FinalizeSettle chạy, KHÔNG
    // bị $unset khi republish. Dùng nó (KHÔNG dùng status) để biết đã từng settle.
    const hasSettledBefore = Boolean(draw.settledAt);

    // ── Nhánh 1: chưa từng settle → publish bình thường (result + vietlottRef) ──
    if (!hasSettledBefore) {
      return this.publish(input, numbers, sum, publishedAt);
    }

    // ── Nhánh 2: đã settle → quyết định theo numbers có đổi hay không ──
    // Đã settle ⇒ result chắc chắn tồn tại (FinalizeSettle yêu cầu có result).
    // KHÔNG đổi → chỉ là sửa metadata vietlottRef → KHÔNG resettle.
    const resultUnchanged = isSameBingo18Result(draw.result!.numbers, numbers);

    if (resultUnchanged) {
      if (input.vietlottRef) {
        const updated = await this.drawRepo.updateVietlottRef(input.drawId, input.vietlottRef);

        if (!updated) {
          throw AppException.internal(
            `Cập nhật Vietlott Ref kỳ ${input.drawId} thất bại — draw status đã thay đổi.`,
          );
        }
      }

      // Giữ nguyên status + result hiện tại (không đổi gì về kết quả/settle).
      return this.toOutput(
        input.drawId,
        draw.status,
        numbers,
        sum,
        draw.result!.publishedAt ?? publishedAt,
      );
    }

    // numbers CÓ đổi sau settle.
    if (draw.status === DrawStatus.Settled) {
      // settled → published + $unset data settle cũ → mở luồng resettle.
      // Ghi result + vietlottRef trong CÙNG 1 query (vietlottRef không kéo
      // resettle, nhưng gộp vào tránh thừa 1 round-trip mỗi lần sửa).
      const updated = await this.drawRepo.republishResultAfterSettled(
        input.drawId,
        { numbers, sum, publishedAt },
        input.vietlottRef,
      );

      if (!updated) {
        throw AppException.internal(
          `Sửa kết quả kỳ ${input.drawId} thất bại — draw không còn ở "settled" (có thể đã bị thay đổi đồng thời).`,
        );
      }

      return this.toOutput(input.drawId, DrawStatus.Published, numbers, sum, publishedAt);
    }

    // status === Published (đã settle ≥ 1 lần, đang chờ resettle): ghi đè result
    // mới + vietlottRef, giữ Published. publishResult cho phép Published→Published.
    return this.publish(input, numbers, sum, publishedAt);
  }

  /** Ghi result (+ vietlottRef nếu có) qua `drawRepo.publishResult`, → `Published`. */
  private async publish(
    input: PublishResultInput,
    numbers: number[],
    sum: number,
    publishedAt: Date,
  ): Promise<PublishResultOutput> {
    const updated = await this.drawRepo.publishResult(
      input.drawId,
      { numbers, sum, publishedAt },
      input.vietlottRef,
    );

    if (!updated) {
      throw AppException.internal(`Publish kết quả kỳ ${input.drawId} thất bại. Vui lòng thử lại.`);
    }

    return this.toOutput(input.drawId, DrawStatus.Published, numbers, sum, publishedAt);
  }

  /** Build output shape thống nhất. */
  private toOutput(
    drawId: string,
    status: string,
    numbers: number[],
    sum: number,
    publishedAt: Date,
  ): PublishResultOutput {
    return {
      drawId,
      status,
      result: {
        numbers,
        sum,
        publishedAt: publishedAt.toISOString(),
      },
    };
  }
}
