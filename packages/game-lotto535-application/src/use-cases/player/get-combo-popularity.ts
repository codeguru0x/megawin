/**
 * Use Case: Get Combo Popularity for Player (Lotto 5/35) — minh bạch chia Jackpot + cơ
 * chế split cycle cho player (p1-01).
 *
 * Cho player tự kiểm tra "bộ số tôi đã cược có bao nhiêu đơn vị cùng tham gia" — CHỈ bộ
 * mà account THỰC SỰ có entry trong kỳ (ownership-gate nghiêm ngặt).
 *
 * ## Ownership-gate (chống dò ẩn bộ số hệ thống)
 *
 * Combo KHÔNG thuộc entry nào của account → trả y hệt trường hợp combo không có trong DB:
 * `{ found: false }`. Kẻ dò không phân biệt được "combo có người chơi nhưng tôi chưa
 * cược" với "combo chưa ai chơi". KHÔNG dùng 403/404 (tự tiết lộ combo tồn tại).
 *
 * ## `jackpotUnits` — CHỈ khi tra bộ CHUẨN (5 chính + 1 ĐB)
 *
 * Đây là mẫu số CHIA Jackpot thật khi bộ đó trúng — chứng minh toán ở JSDoc
 * {@link ComboStatsRepository.sumJackpotUnitsForStandardSet}.
 *
 * ## `splitEligibleDraw` — chỉ mô tả cơ chế, KHÔNG số dự tính
 *
 * Split cycle KHÔNG có mẫu số tính trước giờ quay — pool chia theo đơn vị dự thưởng trúng
 * TỪNG TIER, chỉ biết SAU khi có kết quả (xem `rules/jackpot.ts` `calculateSplitDistribution`).
 *
 * Realtime — worker combo-stats cập nhật liên tục, KHÔNG chốt salesClosed.
 */

import { ApiGatewayUseCase, AppException } from "@megawin/app-core/use-cases";
import { PlayType } from "@megawin/game-lotto535/entities";
import {
  buildComboKey,
  calculateLineCount,
  inferPlayType,
  isSplitCycleDraw,
  validateSelection,
} from "@megawin/game-lotto535/rules";

import { ComboStatsRepository } from "../../infras/repos/combo-stats-repo";
import { DrawRepository } from "../../infras/repos/draw-repo";
import { EntryRepository } from "../../infras/repos/entry-repo";
import { JackpotCycleRepository } from "../../infras/repos/jackpot-cycle-repo";
import { GetGlobalConfigInternalUseCase } from "../game-config/get-global-config-internal";
import type { PlayerComboPopularityInput, PlayerComboPopularityOutput } from "./dto/player.dto";

/** Response rỗng đồng nhất — dùng cho cả "chưa cược" lẫn "combo không tồn tại". */
const NOT_FOUND: PlayerComboPopularityOutput = { found: false };

export class GetComboPopularityPlayerUseCase extends ApiGatewayUseCase<
  PlayerComboPopularityInput,
  PlayerComboPopularityOutput
> {
  private readonly entryRepo = new EntryRepository();
  private readonly comboRepo = new ComboStatsRepository();
  private readonly drawRepo = new DrawRepository();
  private readonly cycleRepo = new JackpotCycleRepository();
  private readonly getGlobalConfig = new GetGlobalConfigInternalUseCase();

  protected async execute(input: PlayerComboPopularityInput): Promise<PlayerComboPopularityOutput> {
    const { accountId, drawId, numbers, specials } = input;

    // Suy playType từ số lượng — tổ hợp không khớp playType nào (VD 6 chính + 2 ĐB) → 400
    // (lỗi client rõ ràng, không lộ dữ liệu hệ thống).
    const playType = inferPlayType(numbers.length, specials.length);
    if (!playType) {
      throw AppException.badRequest("Số lượng số chính/đặc biệt không khớp playType nào.");
    }
    const selection = { mainNumbers: numbers, specialNumbers: specials };
    const validation = validateSelection(playType, selection);
    if (!validation.valid) {
      throw AppException.badRequest(validation.errors.join("; "));
    }

    const comboKey = buildComboKey(playType, numbers, specials);

    // ── Ownership gate: bộ số phải nằm trong board CHÍNH account đã cược ──
    const owned = await this.entryRepo.getBoardsByAccountDraw(accountId, drawId);
    const ownedKeys = new Set(owned.map((b) => buildComboKey(b.playType, b.mainNumbers, b.specialNumbers)));

    // Bộ không thuộc account → trả rỗng ĐỒNG NHẤT (chống dò — không phân biệt case).
    if (!ownedKeys.has(comboKey)) {
      return NOT_FOUND;
    }

    const [doc, config] = await Promise.all([
      this.comboRepo.findByComboKey(drawId, comboKey),
      this.getGlobalConfig.run(),
    ]);
    if (!doc) {
      // Sở hữu nhưng combo-stats chưa kịp cập nhật (hiếm, worker lag) → vẫn rỗng đồng nhất.
      return NOT_FOUND;
    }

    const boardPrice = calculateLineCount(playType, selection) * config.play.unitPrice;

    const output: PlayerComboPopularityOutput = {
      found: true,
      sets: doc.sets,
      boardPrice,
    };

    // jackpotUnits + splitEligibleDraw CHỈ có ý nghĩa khi tra bộ CHUẨN (5 chính + 1 ĐB) —
    // đây là bộ DUY NHẤT trúng được Jackpot.
    if (playType === PlayType.Standard) {
      const [jackpotUnits, draw, activeCycle] = await Promise.all([
        this.comboRepo.sumJackpotUnitsForStandardSet(drawId, numbers, specials),
        this.drawRepo.getDrawById(drawId),
        this.cycleRepo.getActiveCycle(),
      ]);
      output.jackpotUnits = jackpotUnits;

      if (draw) {
        // Chưa biết ai trúng JP tại thời điểm player tra (draw chưa settle) — hasJackpotWinner
        // = false để trả lời đúng câu hỏi "kỳ này CÓ ĐỦ ĐIỀU KIỆN chia NẾU không ai trúng".
        const jackpotAmount = activeCycle?.currentAmount ?? config.jackpot.seedAmount;
        const splitThreshold = activeCycle?.config.splitThreshold ?? config.jackpot.splitThreshold;
        output.splitEligibleDraw = isSplitCycleDraw(jackpotAmount, splitThreshold, false, draw.drawNo);
      }
    }

    return output;
  }
}
