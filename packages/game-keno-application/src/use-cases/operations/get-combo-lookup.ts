import { NextApiUseCase } from "@megawin/next/server";
import { AppException } from "@megawin/shared/errors";
import { buildComboKey } from "@megawin/game-keno/rules";
import { KenoPlayType } from "@megawin/game-keno/entities";
import { DrawRepository } from "../../infras/repos/draw-repo";
import { ComboStatsRepository } from "../../infras/repos/combo-stats-repo";
import { ComboAccountsRepository } from "../../infras/repos/combo-accounts-repo";
import type { GetComboLookupInput, GetComboLookupOutput } from "./dto/combo-lookup.dto";

/** Số lượng số hợp lệ cho từng pick cappable. */
const PICK_COUNT: Record<string, number> = {
  [KenoPlayType.Pick8]: 8,
  [KenoPlayType.Pick9]: 9,
  [KenoPlayType.Pick10]: 10,
};

/**
 * Trần số account trả về cho 1 combo.
 *
 * Combo hot có thể có hàng nghìn người cược; UI drill-down chỉ cần phần cược lớn nhất
 * (repo sort `amount desc`). Tổng người chơi thật vẫn chính xác qua `accountCount`.
 */
const ACCOUNTS_LIMIT = 200;

/**
 * Tra cứu 1 bộ số cappable (pick 8/9/10) trong 1 kỳ cho staff.
 *
 * Đọc pre-aggregated `keno_draw_combo_stats` (counter, O(1) theo unique index) + breakdown
 * account từ `keno_draw_combo_accounts`. Trả tên + bộ + tiền để staff kiểm soát dồn cược
 * (syndicate) và giám sát giải cap. Chưa ai cược → `found: false`.
 */
export class GetComboLookupUseCase extends NextApiUseCase<GetComboLookupInput, GetComboLookupOutput> {
  private readonly drawRepo = new DrawRepository();
  private readonly comboRepo = new ComboStatsRepository();
  private readonly comboAccountsRepo = new ComboAccountsRepository();

  protected async execute(input: GetComboLookupInput): Promise<GetComboLookupOutput> {
    const { drawId, playType, numbers } = input;

    const expected = PICK_COUNT[playType];

    if (expected === undefined) {
      throw AppException.badRequest("Chỉ tra cứu combo pick8/pick9/pick10.");
    }

    if (numbers.length !== expected) {
      throw AppException.badRequest(`${playType} cần đúng ${expected} số.`);
    }

    const draw = await this.drawRepo.existsByDrawId(drawId);
    if (!draw) {
      throw AppException.notFound(`Kỳ quay ${drawId} không tồn tại.`);
    }

    const comboKey = buildComboKey(playType, numbers);
    const doc = await this.comboRepo.getByCombo(drawId, comboKey);

    if (!doc) {
      // Chưa ai cược bộ này → trả rỗng (không lỗi — staff biết combo trống).
      return {
        drawId,
        comboKey,
        found: false,
        players: 0,
        sets: 0,
        amount: 0,
        accounts: [],
      };
    }

    // Breakdown account nằm ở collection riêng (`keno_draw_combo_accounts`) từ p2-01 — doc
    // combo chỉ giữ counter để kích thước cố định bất kể bao nhiêu người cược.
    const rows = await this.comboAccountsRepo.listByCombo(drawId, comboKey, ACCOUNTS_LIMIT);

    return {
      drawId,
      comboKey,
      found: true,
      // Tổng thật từ counter — KHÔNG dùng `rows.length` vì mảng đã bị cắt ở ACCOUNTS_LIMIT.
      players: doc.accountCount,
      sets: doc.sets,
      amount: doc.amount,
      accounts: rows.map((a) => ({
        accountId: a.accountId,
        username: a.username,
        sets: a.sets,
        amount: a.amount,
      })),
    };
  }
}
