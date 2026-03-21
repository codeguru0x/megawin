import { NextApiUseCase } from "@megawin/next/server";
import { AppException } from "@megawin/shared/errors";
import { DrawStatus } from "@megawin/game-core/entities";
import { generateBingo18DrawId } from "@megawin/game-bingo18/helpers";
import { getFinancialDate } from "@megawin/shared/utils/financial-date";
import { DrawRepository } from "../../infras/repos/draw-repo";
import { DrawCounterRepository } from "../../infras/repos/draw-counter-repo";
import type { CreateDrawInput, CreateDrawOutput, CreateDrawOutputItem } from "./dto/draw.dto";

export class CreateDrawUseCase extends NextApiUseCase<CreateDrawInput, CreateDrawOutput> {
  private readonly drawRepo = new DrawRepository();
  private readonly counterRepo = new DrawCounterRepository();

  protected async execute(input: CreateDrawInput): Promise<CreateDrawOutput> {
    const { draws: inputDraws } = input;

    if (inputDraws.length === 0) {
      throw AppException.badRequest("Danh sách kỳ tạo không được rỗng.");
    }
    if (inputDraws.length > 30) {
      throw AppException.badRequest("Không thể tạo quá 30 kỳ một lúc.");
    }

    // Kiểm tra duplicate (drawDate + drawNo) trong batch
    const seen = new Set<string>();
    for (const d of inputDraws) {
      const key = `${d.drawDate}.${String(d.drawNo).padStart(3, "0")}`;
      if (seen.has(key)) {
        throw AppException.badRequest(
          `Trùng drawId: ngày ${d.drawDate} kỳ ${d.drawNo} xuất hiện nhiều lần.`,
        );
      }
      seen.add(key);
    }

    const now = new Date();
    const draws: CreateDrawOutputItem[] = [];

    for (const item of inputDraws) {
      const { drawDate, drawNo, drawTime: drawTimeIso, openNow } = item;
      const drawTime = new Date(drawTimeIso);

      if (isNaN(drawTime.getTime())) {
        throw AppException.badRequest(`drawTime không hợp lệ: "${drawTimeIso}"`);
      }

      const drawId = generateBingo18DrawId(drawDate, drawNo);

      // Cập nhật counter để đảm bảo drawNo đồng bộ (idempotent upsert)
      await this.counterRepo.upsertLastDrawNo(drawDate, drawNo);

      // salesCloseBeforeSeconds mặc định 30s — closeAt = drawTime - 30s
      const closeAt = new Date(drawTime.getTime() - 30 * 1000);
      const status = openNow ? DrawStatus.SalesOpen : DrawStatus.Scheduled;

      await this.drawRepo.createDraw({
        drawId,
        drawDate,
        financialDate: getFinancialDate(drawTime),
        drawNo,
        drawTime,
        status,
        sales: openNow ? { closeAt, openAt: now } : { closeAt },
        createdAt: now,
        updatedAt: now,
      });

      draws.push({
        drawId,
        drawDate,
        drawNo,
        drawTime: drawTime.toISOString(),
        closeAt: closeAt.toISOString(),
        financialDate: getFinancialDate(drawTime),
        status,
      });
    }

    return { draws };
  }
}
