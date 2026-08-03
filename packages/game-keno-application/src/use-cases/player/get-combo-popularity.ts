/**
 * Use Case: Get Combo Popularity for Player (Keno) — minh bạch combo cappable (p1-01).
 *
 * Cho player tự kiểm tra "combo tôi đã cược đang có bao nhiêu người cùng chơi" — chỉ
 * combo pick8/9/10 mà account THỰC SỰ có entry trong kỳ (ownership-gate nghiêm ngặt).
 * Khi cap 8/9/10 chia đều kích hoạt, con số công bố kiểm chứng được → chứng minh hệ
 * thống không gian lận.
 *
 * ## Ownership-gate (chống dò ẩn bộ số hệ thống)
 *
 * Combo KHÔNG thuộc entry nào của account → trả **y hệt** trường hợp combo không có
 * trong DB: `{ found: false }`. Kẻ dò không phân biệt được "combo có người chơi nhưng
 * tôi chưa cược" với "combo chưa ai chơi". KHÔNG dùng 403/404 (tự tiết lộ combo tồn tại).
 *
 * Realtime — worker combo-stats cập nhật liên tục, KHÔNG chốt salesClosed.
 */

import { ApiGatewayUseCase, AppException } from "@megawin/app-core/use-cases";
import { buildComboKey } from "@megawin/game-keno/rules";
import { CAPPABLE_PICK_COUNTS } from "@megawin/game-keno/entities";
import { EntryRepository } from "../../infras/repos/entry-repo";
import { ComboStatsRepository } from "../../infras/repos/combo-stats-repo";
import type { PlayerComboPopularityInput, PlayerComboPopularityOutput } from "./dto/player.dto";

/** Response rỗng đồng nhất — dùng cho cả "chưa cược" lẫn "combo không tồn tại". */
const NOT_FOUND: PlayerComboPopularityOutput = { found: false };

export class GetComboPopularityPlayerUseCase extends ApiGatewayUseCase<
  PlayerComboPopularityInput,
  PlayerComboPopularityOutput
> {
  private readonly entryRepo = new EntryRepository();
  private readonly comboRepo = new ComboStatsRepository();

  protected async execute(input: PlayerComboPopularityInput): Promise<PlayerComboPopularityOutput> {
    const { accountId, drawId, numbers } = input;

    // Chỉ combo cappable (pick8/9/10) mới có ý nghĩa minh bạch (giải chia đều theo cap).
    // Số lượng không hợp lệ → 400 (đây là lỗi client rõ ràng, không lộ dữ liệu hệ thống).
    if (!CAPPABLE_PICK_COUNTS.has(numbers.length)) {
      throw AppException.badRequest("Chỉ tra cứu combo pick8/pick9/pick10.");
    }
    if (new Set(numbers).size !== numbers.length) {
      throw AppException.badRequest("Các số không được trùng nhau.");
    }

    const playType = `pick${numbers.length}`;
    const comboKey = buildComboKey(playType, numbers);

    // ── Ownership gate: combo phải nằm trong entry của chính account ──
    // Đọc boards account sở hữu trong kỳ (vài doc) → build tập comboKey của họ.
    const owned = await this.entryRepo.getBoardsByAccountDraw(accountId, drawId);
    const ownedKeys = new Set(
      owned
        .filter((b) => CAPPABLE_PICK_COUNTS.has(b.numbers.length))
        .map((b) => buildComboKey(`pick${b.numbers.length}`, b.numbers)),
    );

    // Combo không thuộc account → trả rỗng ĐỒNG NHẤT (chống dò ẩn — không phân biệt case).
    if (!ownedKeys.has(comboKey)) {
      return NOT_FOUND;
    }

    // Player sở hữu combo → công bố độ đông (players/sets). KHÔNG trả amount/account nào.
    const doc = await this.comboRepo.getByCombo(drawId, comboKey);
    if (!doc) {
      // Sở hữu nhưng combo-stats chưa kịp cập nhật (hiếm, worker lag) → vẫn rỗng đồng nhất.
      return NOT_FOUND;
    }

    return {
      found: true,
      sets: doc.sets,
    };
  }
}
