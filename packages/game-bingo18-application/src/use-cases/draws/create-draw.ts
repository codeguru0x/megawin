/**
 * Use Case: Create Draw (Bingo18) – Batch
 *
 * Client gửi lên mảng các kỳ cần tạo (drawDate, drawTime, openNow) — KHÔNG gửi drawNo.
 * Server:
 *   1. Validate: batch ≤ BINGO18_CREATE_DRAW_BATCH_MAX, drawDate ≥ hôm nay (giờ VN), drawTime hợp lệ
 *   2. Group slots theo drawDate (1 lô có thể trải nhiều ngày)
 *   3. Với mỗi ngày, tự gán drawNo từ atomic counter theo batch (không trust drawNo từ client)
 *   4. closeAt = drawTime − play.salesCloseBeforeSeconds (theo config, KHÔNG hardcode)
 *   5. Ghi TOÀN BỘ lô trong 1 transaction (all-or-nothing) qua `drawRepo.createDraws`
 */

import { UseCase } from "@megawin/app-core/use-cases";
import type { DrawDoc } from "@megawin/game-bingo18/entities";
import { generateBingo18DrawId } from "@megawin/game-bingo18/helpers";
import { BINGO18_CREATE_DRAW_BATCH_MAX } from "@megawin/game-bingo18/schemas";
import { DrawStatus } from "@megawin/game-core/entities";
import { MAX_DRAW_NO_PER_DAY } from "@megawin/shared/constants";
import { AppException } from "@megawin/shared/errors";
import { getFinancialDate, todayVN } from "@megawin/shared/utils";

import { DrawCounterRepository } from "../../infras/repos/draw-counter-repo";
import { DrawRepository } from "../../infras/repos/draw-repo";
import { GetGlobalConfigUseCase } from "../game-config/get-global-config";
import type { CreateDrawInput, CreateDrawOutput, CreateDrawOutputItem } from "./dto/draw.dto";

export class CreateDrawUseCase extends UseCase<CreateDrawInput, CreateDrawOutput> {
  private readonly drawRepo = new DrawRepository();
  private readonly counterRepo = new DrawCounterRepository();
  private readonly getGlobalConfig = new GetGlobalConfigUseCase();

  protected async execute(input: CreateDrawInput): Promise<CreateDrawOutput> {
    const { draws: inputDraws } = input;

    if (inputDraws.length === 0) {
      throw AppException.badRequest("Danh sách kỳ tạo không được rỗng.");
    }

    // Trần lô = hằng số dùng chung với Zod schema route + UI (một nguồn chân lý). KHÔNG suy ra
    // từ `drawsPerDay × 2` như trước: cách đó khoá staff vào đúng 2 ngày, mâu thuẫn với việc
    // cho phép tạo trước nhiều ngày ở dưới.
    if (inputDraws.length > BINGO18_CREATE_DRAW_BATCH_MAX) {
      throw AppException.badRequest(`Không thể tạo quá ${BINGO18_CREATE_DRAW_BATCH_MAX} kỳ một lúc.`);
    }

    // Chỉ chặn MỘT phía: KHÔNG cho tạo kỳ cho ngày đã qua (ngày đó theo nghiệp vụ đã có kết
    // quả, tạo mới là vô nghĩa và làm lệch báo cáo). KHÔNG chặn trần trên — staff được tạo
    // trước nhiều ngày như các game khác; số lượng đã bị `BINGO18_CREATE_DRAW_BATCH_MAX` chặn.
    const today = todayVN();
    for (const d of inputDraws) {
      if (d.drawDate < today) {
        throw AppException.badRequest(`Không thể tạo kỳ quay cho ngày đã qua: ${d.drawDate} (hôm nay ${today}).`);
      }
      if (Number.isNaN(new Date(d.drawTime).getTime())) {
        throw AppException.badRequest(`drawTime không hợp lệ: "${d.drawTime}"`);
      }
    }

    // Guard trùng slot NGAY TRONG LÔ: 2 dòng cùng (drawDate, drawTime) là staff nhập sai — nếu
    // để đi tiếp, counter cấp 2 drawNo khác nhau nên KHÔNG có drawId trùng để DB chặn, kết quả
    // là 2 kỳ song sinh cùng giờ quay (người chơi thấy 2 kỳ, kết quả Vietlott chỉ có 1).
    const slotKeys = new Set<string>();
    for (const d of inputDraws) {
      const key = `${d.drawDate}T${d.drawTime}`;
      if (slotKeys.has(key)) {
        throw AppException.badRequest(`Lô có 2 kỳ cùng ngày và giờ quay: ${d.drawDate} ${d.drawTime}.`);
      }
      slotKeys.add(key);
    }

    const globalConfig = await this.getGlobalConfig.run();
    const { play } = globalConfig;

    // Group theo drawDate, giữ nguyên thứ tự xuất hiện trong input để gán drawNo tuần tự đúng
    // ý staff, và để atomic counter chạy riêng theo từng ngày.
    const dateOrder: string[] = [];
    const groupsByDate = new Map<string, { index: number; drawTime: string; openNow: boolean }[]>();
    inputDraws.forEach((item, index) => {
      let group = groupsByDate.get(item.drawDate);
      if (!group) {
        group = [];
        groupsByDate.set(item.drawDate, group);
        dateOrder.push(item.drawDate);
      }
      group.push({ index, drawTime: item.drawTime, openNow: item.openNow });
    });

    const now = new Date();
    const draws: CreateDrawOutputItem[] = new Array(inputDraws.length);
    const docs: Omit<DrawDoc, "_id">[] = new Array(inputDraws.length);

    for (const drawDate of dateOrder) {
      const group = groupsByDate.get(drawDate);
      if (!group) {
        continue;
      }

      // Gán drawNo từ atomic counter theo từng ngày — không dùng drawNo từ client.
      const firstDrawNo = await this.counterRepo.getNextDrawNoBatch(drawDate, group.length);

      // Trần 999/ngày là hệ quả của format drawId "YYYY-MM-DD.NNN" (NNN đúng 3 chữ số): vượt
      // ngưỡng sẽ sinh drawId 4 chữ số mà mọi schema drawId đều từ chối → kỳ tạo ra không tra
      // cứu / công bố kết quả được. Counter là `$inc` monotonic KHÔNG reset khi tạo-rồi-xoá kỳ,
      // nên ngưỡng này đạt được thật sau nhiều lần tạo lại trong cùng ngày.
      const lastDrawNo = firstDrawNo + group.length - 1;
      if (lastDrawNo > MAX_DRAW_NO_PER_DAY) {
        throw AppException.badRequest(
          `Ngày ${drawDate} đã dùng hết dải số kỳ (tối đa ${MAX_DRAW_NO_PER_DAY} kỳ/ngày). ` +
            "Không thể tạo thêm kỳ cho ngày này.",
        );
      }

      for (const [i, { index, drawTime: drawTimeIso, openNow }] of group.entries()) {
        const drawNo = firstDrawNo + i;
        const drawTime = new Date(drawTimeIso);
        const drawId = generateBingo18DrawId(drawDate, drawNo);

        // closeAt tính theo config (play.salesCloseBeforeSeconds), KHÔNG hardcode — staff đổi
        // config thì batch tạo tiếp theo áp dụng ngay. Giá trị 0 hợp lệ: đóng bán đúng giờ quay.
        const closeAt = new Date(drawTime.getTime() - play.salesCloseBeforeSeconds * 1000);
        const status = openNow ? DrawStatus.SalesOpen : DrawStatus.Scheduled;

        // financialDate tính 1 LẦN/kỳ rồi dùng lại cho cả doc lưu DB và output — tránh gọi
        // getFinancialDate 2 lần/kỳ như trước. KHÔNG hoist ra ngoài vòng lặp theo ngày: mốc
        // tài chính là 11:00 VN, còn firstDrawTime mặc định 06:06 (sớm hơn) nên các kỳ đầu
        // ngày (06:06-10:59) thuộc financialDate của NGÀY HÔM TRƯỚC, khác với kỳ 11:00 trở
        // đi (financialDate = drawDate) — financialDate KHÔNG hằng định trong 1 drawDate.
        const financialDate = getFinancialDate(drawTime);

        docs[index] = {
          drawId,
          drawDate,
          financialDate,
          drawNo,
          drawTime,
          status,
          sales: openNow ? { closeAt, openAt: now } : { closeAt },
          createdAt: now,
          updatedAt: now,
        };

        draws[index] = {
          drawId,
          drawDate,
          drawNo,
          drawTime: drawTime.toISOString(),
          closeAt: closeAt.toISOString(),
          financialDate,
          status,
        };
      }
    }

    // Ghi 1 LẦN cho cả lô trong transaction — thành công toàn bộ hoặc rollback sạch. Tránh cảnh
    // loop insert bị lỗi giữa đường để lại lô kỳ tạo dở dang mà staff không biết thiếu kỳ nào.
    await this.drawRepo.createDraws(docs);

    return { draws };
  }
}
