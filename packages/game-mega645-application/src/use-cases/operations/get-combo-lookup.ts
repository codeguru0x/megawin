/**
 * Mega 6/45 – Get Combo Lookup Use Case (staff)
 *
 * Tra cứu 1 board (bộ số theo playType) trong 1 kỳ cho staff — đọc pre-aggregated
 * `mega645_draw_combo_stats` (counter, O(1) theo unique index) + breakdown account từ
 * `mega645_draw_combo_accounts`. PlayType TỰ SUY ở UI theo số lượng số đã chọn
 * (analysis §3.10(7)).
 *
 * Validate playType hợp lệ + số lượng số khớp playType + format/trùng số đã nằm ở
 * Zod schema route (`comboLookupQuerySchema`, `.refine` cross-field) — use-case KHÔNG
 * validate lại (rule `code-quality-standards.mdc` §8), chỉ lo business logic (tính
 * `boardPrice`, đọc combo doc, breakdown account).
 *
 * `boardPrice` dùng `calculateLineCount` (rules/play-types.ts, keyed theo `PlayType`) —
 * KHÁC Power 6/55 dùng `BAO_COMBINATIONS[pt]` trực tiếp (bảng Mega 6/45 keyed theo N,
 * không theo playType — xem JSDoc `BAO_COMBINATIONS` ở entities/types.ts). Cùng giá trị
 * số line, chỉ khác nguồn tra cứu.
 */

import { NextApiUseCase } from "@megawin/next/server";
import { AppException } from "@megawin/shared/errors";
import { buildComboKey, calculateLineCount } from "@megawin/game-mega645/rules";
import type { PlayType } from "@megawin/game-mega645/entities";
import { GetGlobalConfigInternalUseCase } from "../game-config/get-global-config-internal";
import { DrawRepository } from "../../infras/repos/draw-repo";
import { ComboStatsRepository } from "../../infras/repos/combo-stats-repo";
import { ComboAccountsRepository } from "../../infras/repos/combo-accounts-repo";
import type { GetComboLookupInput, GetComboLookupOutput } from "./dto/ops.dto";

/**
 * Trần số account trả về cho 1 combo — combo hot có thể hàng nghìn người cược; UI
 * drill-down chỉ cần phần cược lớn nhất (repo sort `amount desc`). Tổng người chơi
 * thật vẫn chính xác qua `players` (đọc từ counter `accountCount`).
 */
const ACCOUNTS_LIMIT = 200;

export class GetComboLookupUseCase extends NextApiUseCase<GetComboLookupInput, GetComboLookupOutput> {
  private readonly getGlobalConfig = new GetGlobalConfigInternalUseCase();
  private readonly drawRepo = new DrawRepository();
  private readonly comboRepo = new ComboStatsRepository();
  private readonly comboAccountsRepo = new ComboAccountsRepository();

  protected async execute(input: GetComboLookupInput): Promise<GetComboLookupOutput> {
    const { drawId, numbers } = input;
    const pt = input.playType as PlayType;

    const [draw, config] = await Promise.all([this.drawRepo.getDrawById(drawId), this.getGlobalConfig.run()]);
    if (!draw) {
      throw AppException.notFound(`Kỳ quay ${drawId} không tồn tại.`);
    }

    const boardPrice = calculateLineCount(pt) * config.play.unitPrice;
    const comboKey = buildComboKey(pt, numbers);
    const doc = await this.comboRepo.findByComboKey(drawId, comboKey);

    if (!doc) {
      // Chưa ai cược bộ này → trả rỗng (không lỗi — staff biết combo trống).
      return {
        drawId,
        comboKey,
        found: false,
        players: 0,
        sets: 0,
        amount: 0,
        boardPrice,
        accounts: [],
      };
    }

    // Breakdown account nằm ở collection riêng (`mega645_draw_combo_accounts`) — doc
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
      boardPrice,
      accounts: rows.map((a) => ({
        accountId: a.accountId,
        username: a.username,
        sets: a.sets,
        amount: a.amount,
      })),
    };
  }
}
