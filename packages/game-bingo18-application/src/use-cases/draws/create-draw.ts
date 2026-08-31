/**
 * Use Case: Create Draw (Bingo18) – Batch
 *
 * Client gửi mảng kỳ cần tạo (`drawDate`, `drawTime`, `openNow`) — KHÔNG gửi `drawNo`.
 *
 * `execute` chỉ điều phối 3 bước: **validate → cấp `drawNo` → build doc & ghi**. Toàn bộ
 * guard nghiệp vụ nằm trong {@link CreateDrawUseCase.validateBatch} để `execute` đọc được
 * mạch chính mà không phải cuộn qua ~100 dòng kiểm tra.
 *
 * Thứ tự gọi CÓ Ý NGHĨA: `validateBatch` phải xong TRƯỚC `getNextDrawNoBatch` — counter là
 * `$inc` monotonic KHÔNG rollback, nên validate sau khi cấp số sẽ **đốt** dải `drawNo` mỗi
 * lần lô bị từ chối, và `drawNo` nhảy số không thể vá lại.
 *
 * Ghi TOÀN BỘ lô trong 1 transaction (all-or-nothing) qua `drawRepo.createDraws`.
 */

import { UseCase } from "@megawin/app-core/use-cases";
import type { DrawDoc } from "@megawin/game-bingo18/entities";
import { generateBingo18DrawId } from "@megawin/game-bingo18/helpers";
import { BINGO18_CREATE_DRAW_BATCH_MAX } from "@megawin/game-bingo18/schemas";
import { DrawStatus } from "@megawin/game-core/entities";
import { computeDrawDayCapacity, isDrawSlotCreatable, listDrawSlotMinutes } from "@megawin/game-core/utils";
import { MAX_DRAW_NO_PER_DAY } from "@megawin/shared/constants";
import { AppException } from "@megawin/shared/errors";
import { formatVN, getFinancialDate, minutesOfDayVN, secondsOfDayVN, todayVN } from "@megawin/shared/utils";

import { DrawCounterRepository } from "../../infras/repos/draw-counter-repo";
import { DrawRepository } from "../../infras/repos/draw-repo";
import { GetGlobalConfigUseCase } from "../game-config/get-global-config";
import type { CreateDrawInput, CreateDrawOutput, CreateDrawOutputItem } from "./dto/draw.dto";

/** Một kỳ trong lô sau khi đã quy giờ quay về phút-trong-ngày (giờ VN) để đối chiếu lưới. */
interface ValidatedSlot {
  /** Mốc quay tuyệt đối — dùng để ghi `drawTime` và tính `closeAt`/`financialDate`. */
  drawTime: Date;
  /** Mở bán ngay khi tạo (`salesOpen`) hay để chờ lịch (`scheduled`). */
  openNow: boolean;
}

/** Kết quả `validateBatch`: lô đã hợp lệ + dữ liệu `execute` cần để build doc. */
interface ValidatedBatch {
  /** Ngày quay chung của cả lô (`"YYYY-MM-DD"`). */
  drawDate: string;
  /** Đóng bán trước giờ quay bao nhiêu giây — snapshot config lúc validate. */
  salesCloseBeforeSeconds: number;
  /** Các kỳ hợp lệ, giữ nguyên thứ tự client gửi để `drawNo` tăng đúng ý staff. */
  slots: ValidatedSlot[];
}

export class CreateDrawUseCase extends UseCase<CreateDrawInput, CreateDrawOutput> {
  private readonly drawRepo = new DrawRepository();
  private readonly counterRepo = new DrawCounterRepository();
  private readonly getGlobalConfig = new GetGlobalConfigUseCase();

  protected async execute(input: CreateDrawInput): Promise<CreateDrawOutput> {
    const { drawDate, salesCloseBeforeSeconds, slots } = await this.validateBatch(input);

    // ── Cấp drawNo ────────────────────────────────────────────────────────────────────
    // Từ đây trở xuống KHÔNG còn guard nghiệp vụ nào (trừ trần dải số): counter đã bị `$inc`
    // và không rollback được, nên mọi kiểm tra khác phải nằm trong `validateBatch`.
    const firstDrawNo = await this.counterRepo.getNextDrawNoBatch(drawDate, slots.length);

    // Trần 999/ngày là hệ quả của format drawId "YYYY-MM-DD.NNN" (NNN đúng 3 chữ số): vượt
    // ngưỡng sẽ sinh drawId 4 chữ số mà mọi schema drawId đều từ chối → kỳ tạo ra không tra
    // cứu / công bố kết quả được. Counter là `$inc` monotonic KHÔNG reset khi tạo-rồi-xoá kỳ,
    // nên ngưỡng này đạt được thật sau nhiều lần tạo lại trong cùng ngày. KHÔNG kiểm được
    // trong `validateBatch` vì chỉ biết `firstDrawNo` sau khi counter đã cấp.
    const lastDrawNo = firstDrawNo + slots.length - 1;
    if (lastDrawNo > MAX_DRAW_NO_PER_DAY) {
      throw AppException.badRequest(
        `Ngày ${drawDate} đã dùng hết dải số kỳ (tối đa ${MAX_DRAW_NO_PER_DAY} kỳ/ngày). ` +
          "Không thể tạo thêm kỳ cho ngày này.",
      );
    }

    // ── Build doc + ghi ───────────────────────────────────────────────────────────────
    const now = new Date();
    const draws: CreateDrawOutputItem[] = [];
    const docs: Omit<DrawDoc, "_id">[] = [];

    for (const [i, { drawTime, openNow }] of slots.entries()) {
      const drawNo = firstDrawNo + i;
      const drawId = generateBingo18DrawId(drawDate, drawNo);

      // closeAt tính theo config, KHÔNG hardcode — staff đổi config thì lô tạo tiếp theo áp
      // dụng ngay. Giá trị 0 hợp lệ: đóng bán đúng giờ quay.
      const closeAt = new Date(drawTime.getTime() - salesCloseBeforeSeconds * 1000);
      const status = openNow ? DrawStatus.SalesOpen : DrawStatus.Scheduled;

      // financialDate tính riêng cho TỪNG kỳ, KHÔNG hoist ra ngoài vòng lặp: mốc tài chính là
      // 11:00 VN, còn firstDrawTime mặc định 06:06 (sớm hơn) nên các kỳ đầu ngày (06:06–10:59)
      // thuộc financialDate của NGÀY HÔM TRƯỚC — financialDate KHÔNG hằng định trong 1 drawDate.
      const financialDate = getFinancialDate(drawTime);

      docs.push({
        drawId,
        drawDate,
        financialDate,
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
        financialDate,
        status,
      });
    }

    // Ghi 1 LẦN cho cả lô trong transaction — thành công toàn bộ hoặc rollback sạch. Tránh cảnh
    // loop insert bị lỗi giữa đường để lại lô kỳ tạo dở dang mà staff không biết thiếu kỳ nào.
    await this.drawRepo.createDraws(docs);

    return { draws };
  }

  /**
   * Toàn bộ guard nghiệp vụ của lô. Throw `AppException` ở guard đầu tiên thất bại.
   *
   * Thứ tự guard CÓ Ý NGHĨA — không đảo:
   *   1. Lô không rỗng, không vượt trần, `drawTime` parse được
   *   2. Cả lô cùng **một** `drawDate`, và ngày đó không phải ngày đã qua
   *   3. Không trùng giờ quay ngay trong lô
   *   4. Mọi giờ quay nằm đúng trên **lưới giờ** game config
   *   5. Mọi kỳ còn đủ **cửa sổ bán** tối thiểu
   *   6. Không trùng giờ quay với kỳ **đã có trong DB**
   *   7. Số kỳ không vượt **sức chứa còn lại** của ngày
   *
   * Guard 4 đặt TRƯỚC guard 5 để thông báo lỗi nói đúng nguyên nhân gốc: giờ lệch lưới thì
   * phải báo "không thuộc lịch quay", không phải "đã hết thời gian mở bán".
   *
   * @returns Lô đã hợp lệ + snapshot config `execute` cần dùng
   */
  private async validateBatch(input: CreateDrawInput): Promise<ValidatedBatch> {
    const { draws: inputDraws } = input;

    // ── Guard 1: hình dạng lô ─────────────────────────────────────────────────────────
    const [firstDraw] = inputDraws;
    if (!firstDraw) {
      throw AppException.badRequest("Danh sách kỳ tạo không được rỗng.");
    }

    // Trần lô = hằng số dùng chung với Zod schema route + UI (một nguồn chân lý).
    if (inputDraws.length > BINGO18_CREATE_DRAW_BATCH_MAX) {
      throw AppException.badRequest(`Không thể tạo quá ${BINGO18_CREATE_DRAW_BATCH_MAX} kỳ một lúc.`);
    }

    // ── Guard 2: lô chỉ thuộc MỘT ngày, và ngày đó chưa qua ───────────────────────────
    // Mọi guard sức chứa bên dưới tính trên phạm vi 1 ngày, và `drawNo` cấp từ counter theo
    // từng ngày. Lô trải nhiều ngày sẽ khiến thông báo lỗi mất nghĩa ("còn 3 kỳ" — ngày nào?)
    // và staff không kiểm soát được mình vừa tạo gì. Cần nhiều ngày ⇒ bấm tạo nhiều lần.
    const drawDate = firstDraw.drawDate;
    for (const d of inputDraws) {
      if (d.drawDate !== drawDate) {
        throw AppException.badRequest(`Một lô chỉ được tạo kỳ cho MỘT ngày. Đang có cả ${drawDate} và ${d.drawDate}.`);
      }
      if (Number.isNaN(new Date(d.drawTime).getTime())) {
        throw AppException.badRequest(`drawTime không hợp lệ: "${d.drawTime}"`);
      }
    }

    // Ngày đã qua theo nghiệp vụ đã có kết quả — tạo mới là vô nghĩa và làm lệch báo cáo.
    const today = todayVN();
    if (drawDate < today) {
      throw AppException.badRequest(`Không thể tạo kỳ quay cho ngày đã qua: ${drawDate} (hôm nay ${today}).`);
    }

    const { play } = await this.getGlobalConfig.run();

    const grid = listDrawSlotMinutes(play.firstDrawTime, play.lastDrawTime, play.drawIntervalMinutes);
    if (!grid) {
      throw AppException.badRequest(
        "Cấu hình lịch quay không hợp lệ (giờ kỳ đầu/kỳ cuối hoặc chu kỳ). Vui lòng kiểm tra cấu hình game.",
      );
    }
    const gridSet = new Set(grid);

    // Chỉ ngày HÔM NAY bị lọc theo giờ; ngày tương lai mọi slot còn nguyên cửa sổ bán.
    const nowSecondsOfDay = drawDate === today ? secondsOfDayVN() : undefined;

    // Quy `drawTime` (ISO có offset) về phút-trong-ngày theo giờ VN — đơn vị chung với lưới giờ.
    const requested = inputDraws.map((d) => {
      const drawTime = new Date(d.drawTime);
      return { drawTime, minutes: minutesOfDayVN(drawTime), openNow: d.openNow };
    });

    // ── Guard 3: trùng giờ quay NGAY TRONG LÔ ─────────────────────────────────────────
    // 2 dòng cùng giờ quay là staff nhập sai. Nếu để đi tiếp, counter cấp 2 `drawNo` KHÁC
    // nhau nên không có `drawId` trùng để DB chặn → sinh 2 kỳ song sinh cùng giờ (người chơi
    // thấy 2 kỳ nhưng kết quả Vietlott chỉ có 1).
    const seenMinutes = new Set<number>();
    for (const r of requested) {
      if (seenMinutes.has(r.minutes)) {
        throw AppException.badRequest(`Lô có 2 kỳ cùng giờ quay: ${drawDate} ${formatVN(r.drawTime, "HH:mm")}.`);
      }
      seenMinutes.add(r.minutes);
    }

    // ── Guard 4: lệch lưới giờ ────────────────────────────────────────────────────────
    // Kỳ lệch lưới (VD 20:03 khi chu kỳ 6 phút) phá vỡ giả định "kỳ thứ N quay lúc T" mà
    // scheduler, đối soát Vietlott và mọi báo cáo theo kỳ đều dựa vào.
    for (const r of requested) {
      if (!gridSet.has(r.minutes)) {
        throw AppException.badRequest(
          `Giờ quay ${formatVN(r.drawTime, "HH:mm")} không thuộc lịch quay của game ` +
            `(${play.firstDrawTime}–${play.lastDrawTime}, mỗi ${play.drawIntervalMinutes} phút).`,
        );
      }
    }

    // ── Guard 5: hết cửa sổ bán ───────────────────────────────────────────────────────
    // Cùng predicate với preview nên staff không bao giờ thấy "preview gợi ý nhưng tạo báo
    // lỗi" — trừ trường hợp mốc cắt trôi qua giữa lúc staff xem preview và bấm tạo, đúng ý
    // muốn chặn.
    for (const r of requested) {
      if (!isDrawSlotCreatable(r.minutes, play.salesCloseBeforeSeconds, nowSecondsOfDay)) {
        throw AppException.badRequest(
          `Kỳ ${formatVN(r.drawTime, "HH:mm")} đã hết thời gian mở bán. Vui lòng tải lại danh sách gợi ý.`,
        );
      }
    }

    // ── Guard 6 + 7: đối chiếu với kỳ ĐÃ CÓ trong DB ──────────────────────────────────
    // Chỉ đọc kỳ từ mốc sớm nhất trong lô trở đi: kỳ có giờ quay sớm hơn không thể trùng với
    // bất kỳ dòng nào trong lô, đọc về là payload vô ích.
    const earliestRequested = requested.reduce((min, r) => (r.drawTime < min.drawTime ? r : min)).drawTime;
    const existingDrawTimes = await this.drawRepo.listDrawTimesByDate(drawDate, earliestRequested);
    const occupiedMinutes = existingDrawTimes.map(minutesOfDayVN);
    const occupiedSet = new Set(occupiedMinutes);

    for (const r of requested) {
      if (occupiedSet.has(r.minutes)) {
        throw AppException.conflict(
          `Kỳ quay lúc ${formatVN(r.drawTime, "HH:mm")} ngày ${drawDate} đã tồn tại. ` +
            "Vui lòng tải lại danh sách gợi ý.",
        );
      }
    }

    const capacity = computeDrawDayCapacity({
      firstDrawTime: play.firstDrawTime,
      lastDrawTime: play.lastDrawTime,
      intervalMinutes: play.drawIntervalMinutes,
      salesCloseBeforeSeconds: play.salesCloseBeforeSeconds,
      occupiedMinutes,
      nowSecondsOfDay,
    });
    // `grid` đã tính được ở trên nên config chắc chắn hợp lệ — nhánh này không đạt tới được.
    if (!capacity) {
      throw AppException.badRequest("Cấu hình lịch quay không hợp lệ. Vui lòng kiểm tra cấu hình game.");
    }

    // Guard 5/6 đã đảm bảo mọi kỳ trong lô đều nằm trong `availableMinutes`, nên vượt sức
    // chứa về lý thuyết không xảy ra. Vẫn giữ vì đây là guard rẻ, và nó bảo vệ trường hợp
    // logic trên bị nới lỏng trong tương lai mà quên mất trần sức chứa.
    const remaining = capacity.availableMinutes.length;
    if (requested.length > remaining) {
      throw AppException.badRequest(
        `Ngày ${drawDate} chỉ còn ${remaining}/${capacity.maxPerDay} kỳ có thể tạo, ` +
          `không thể tạo ${requested.length} kỳ.`,
      );
    }

    return {
      drawDate,
      salesCloseBeforeSeconds: play.salesCloseBeforeSeconds,
      slots: requested.map(({ drawTime, openNow }) => ({ drawTime, openNow })),
    };
  }
}
