/**
 * Use Case: Get Combo Popularity for Player (Power 6/55) — minh bạch chia jackpot (p1-01).
 *
 * Cho player tự kiểm tra "bộ số tôi đã cược đang có bao nhiêu bộ cùng chơi" — CHỈ bộ số
 * mà account THỰC SỰ có entry trong kỳ (ownership-gate nghiêm ngặt). JP1/JP2 chia PER-DRAW
 * theo betCount trên toàn bộ line trúng (`patch-jackpot-prize.ts`:
 * `jackpotPerUnit = floor(pool / totalBetUnits)`), player có con số kiểm chứng được.
 *
 * ## Ownership-gate (chống dò ẩn bộ số hệ thống)
 *
 * Combo KHÔNG thuộc entry nào của account → trả **y hệt** trường hợp combo không có trong
 * DB: `{ found: false }`. Kẻ dò không phân biệt "combo có người chơi nhưng tôi chưa cược"
 * với "combo chưa ai chơi". KHÔNG dùng 403/404 (tự tiết lộ combo tồn tại).
 *
 * ## `sets` vs `jackpotUnits` — công thức tính tiền jackpot TẠM TÍNH cho tenant developer
 *
 * - `sets` = số bộ cược cùng comboKey — TÍN HIỆU tham khảo (KHÔNG phải mẫu số chia, khác
 *   Keno: Power 6/55 chia jackpot per-draw across mọi line trúng, không per-combo).
 * - `jackpotUnits` (CHỈ khi tra bộ 6 số standard, CHỈ áp dụng JP1) = `totalBetUnits` mẫu số
 *   chia jackpot, gom từ 3 nguồn phủ bộ S (standard exact + bao5 6 tập con + bao7–18
 *   superset) qua {@link ComboStatsRepository.sumJackpotUnitsForStandardSet}.
 * - Công thức TẠM TÍNH số tiền player nhận được nếu bộ 6 số này trúng Jackpot 1:
 *   `soTienTamTinh = Math.floor(jackpot1CurrentAmount / jackpotUnits) × betCount` (lấy
 *   `jackpot1CurrentAmount` từ endpoint `getJackpot`, `betCount` = số lần cược của player
 *   cho board này). ĐÂY LÀ CON SỐ TẠM TÍNH TẠI THỜI ĐIỂM TRA — pool còn tăng đến giờ đóng
 *   bán, `jackpotUnits` cũng chỉ tăng (bán vé tiếp) không giảm (trừ khi có vé bị void) —
 *   KHÔNG dùng con số này để cam kết/thông báo chính thức với player, chỉ hiển thị dạng
 *   "ước tính nếu trúng ngay bây giờ".
 *
 * Realtime — worker combo-stats cập nhật liên tục, KHÔNG chốt salesClosed.
 */

import { ApiGatewayUseCase, AppException } from "@megawin/app-core/use-cases";
import { PlayType, VALID_MAIN_NUMBER_SET } from "@megawin/game-power655/entities";
import { buildComboKey } from "@megawin/game-power655/rules";

import { ComboStatsRepository } from "../../infras/repos/combo-stats-repo";
import { EntryRepository } from "../../infras/repos/entry-repo";
import type { PlayerComboPopularityInput, PlayerComboPopularityOutput } from "./dto/player.dto";

/** Response rỗng đồng nhất — dùng cho cả "chưa cược" lẫn "combo không tồn tại". */
const NOT_FOUND: PlayerComboPopularityOutput = { found: false };

/**
 * Số lượng số đã chọn → PlayType hợp lệ:
 * 5 → bao5, 6 → standard, 7–15 → baoN, 18 → bao18. 16/17 số không map (undefined).
 */
const COUNT_TO_PLAY_TYPE: Record<number, PlayType> = {
  5: PlayType.Bao5,
  6: PlayType.Standard,
  7: PlayType.Bao7,
  8: PlayType.Bao8,
  9: PlayType.Bao9,
  10: PlayType.Bao10,
  11: PlayType.Bao11,
  12: PlayType.Bao12,
  13: PlayType.Bao13,
  14: PlayType.Bao14,
  15: PlayType.Bao15,
  18: PlayType.Bao18,
};

export class GetComboPopularityPlayerUseCase extends ApiGatewayUseCase<
  PlayerComboPopularityInput,
  PlayerComboPopularityOutput
> {
  private readonly entryRepo = new EntryRepository();
  private readonly comboRepo = new ComboStatsRepository();

  protected async execute(input: PlayerComboPopularityInput): Promise<PlayerComboPopularityOutput> {
    const { accountId, drawId, numbers } = input;

    // Số lượng số phải map được sang playType hợp lệ (5/6/7–15/18). Sai → 400 (lỗi client
    // rõ ràng, KHÔNG lộ dữ liệu hệ thống).
    const playType = COUNT_TO_PLAY_TYPE[numbers.length];
    if (!playType) {
      throw AppException.badRequest("Chỉ tra cứu bộ 5, 6, 7–15 hoặc 18 số.");
    }
    if (new Set(numbers).size !== numbers.length) {
      throw AppException.badRequest("Các số không được trùng nhau.");
    }

    for (const n of numbers) {
      if (!VALID_MAIN_NUMBER_SET.has(n)) {
        throw AppException.badRequest(`Số không hợp lệ: ${n}. Chỉ nhận "01".."55".`);
      }
    }

    const comboKey = buildComboKey(playType, numbers);

    // ── Ownership gate: combo phải nằm trong entry của chính account ──
    // Đọc boards account sở hữu trong kỳ (vài doc) → build tập comboKey của họ.
    const owned = await this.entryRepo.getBoardsByAccountDraw(accountId, drawId);
    const ownedKeys = new Set(owned.map((b) => buildComboKey(b.playType, b.mainNumbers)));

    // Combo không thuộc account → trả rỗng ĐỒNG NHẤT (chống dò ẩn — không phân biệt case).
    if (!ownedKeys.has(comboKey)) {
      return NOT_FOUND;
    }

    // Player sở hữu combo → công bố độ đông. KHÔNG trả amount/account nào.
    const doc = await this.comboRepo.findByComboKey(drawId, comboKey);
    if (!doc) {
      // Sở hữu nhưng combo-stats chưa kịp cập nhật (hiếm, worker lag) → vẫn rỗng đồng nhất.
      return NOT_FOUND;
    }

    const result: PlayerComboPopularityOutput = {
      found: true,
      sets: doc.sets,
    };

    // jackpotUnits CHỈ suy được cho bộ 6 số standard (mẫu số chia JP1 khi S trúng).
    // Board Bao (5, 7–18 số) không suy trước được mẫu số (phụ thuộc 6 số quay ra).
    if (playType === PlayType.Standard) {
      result.jackpotUnits = await this.comboRepo.sumJackpotUnitsForStandardSet(drawId, numbers);
    }

    return result;
  }
}
