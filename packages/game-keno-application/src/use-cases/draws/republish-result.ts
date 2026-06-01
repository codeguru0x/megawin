/**
 * Use Case: Republish Result (Keno) — bước 1 của workflow Resettle.
 *
 * Sửa lại kết quả của 1 draw đã `settled` → quay về `published` để chạy resettle.
 *
 * Dùng khi staff phát hiện kết quả nhập sai sau khi đã kết sổ → cần sửa kết quả
 * và chạy lại quy trình settle. KHÔNG dùng cho draw chưa settle (lần đầu —
 * dùng `PublishResultUseCase` thông thường).
 *
 * CHỈ nhận `winningNumbers`. Sửa `vietlottRef` (metadata tham chiếu Vietlott)
 * thuộc endpoint riêng `UpdateVietlottRefUseCase` — KHÔNG kéo theo resettle.
 *
 * Validate input (winningNumbers length + range + unique) thực hiện ở route
 * layer qua Zod schema `republishResultSchema` — use-case không validate lại
 * để tránh duplicate.
 *
 * Side effects:
 * - Transition `settled → published` qua `drawRepo.republishResultAfterSettled`.
 * - $unset `financial`, `stats`, `settleSummary` (data settle cũ).
 * - GIỮ `settledAt` — high-water mark để API trigger-resettle phân biệt
 *   resettle vs initial settle.
 * - GIỮ `vietlottRef` — không đụng metadata tham chiếu.
 *
 * IDEMPOTENT: nếu draw đã ở `published` (do gọi 2 lần), filter strict
 * `status: settled` ở repo sẽ trả null — caller throw lỗi rõ ràng.
 */

import { NextApiUseCase } from "@megawin/next/server";
import { AppException } from "@megawin/shared/errors";
import { DrawStatus } from "@megawin/game-core/entities";
import { computeDrawStats } from "@megawin/game-keno/helpers";
import { nowVN } from "@megawin/shared/utils";
import { DrawRepository } from "../../infras/repos/draw-repo";
import type { RepublishResultInput, RepublishResultOutput } from "./dto/draw.dto";

export class RepublishResultUseCase extends NextApiUseCase<
  RepublishResultInput,
  RepublishResultOutput
> {
  private readonly drawRepo = new DrawRepository();

  protected async execute(input: RepublishResultInput): Promise<RepublishResultOutput> {
    const draw = await this.drawRepo.getDrawById(input.drawId);

    if (!draw) {
      throw AppException.notFound(`Kỳ quay ${input.drawId} không tồn tại.`);
    }

    if (draw.status !== DrawStatus.Settled) {
      throw new AppException(
        "DRAW_INVALID_TRANSITION",
        `Chỉ có thể sửa kết quả khi kỳ quay đã được kết sổ.`,
      );
    }

    const publishedAt = nowVN();
    const stats = computeDrawStats(input.winningNumbers);
    const resultData = {
      winningNumbers: input.winningNumbers,
      ...stats,
      publishedAt,
    };

    const updated = await this.drawRepo.republishResultAfterSettled(input.drawId, resultData);

    if (!updated) {
      throw AppException.internal(
        `Republish kết quả kỳ ${input.drawId} thất bại — draw không còn ở "settled" (có thể đã bị thay đổi đồng thời).`,
      );
    }

    return {
      drawId: input.drawId,
      status: DrawStatus.Published,
      result: {
        winningNumbers: input.winningNumbers,
        publishedAt: publishedAt.toISOString(),
      },
    };
  }
}
