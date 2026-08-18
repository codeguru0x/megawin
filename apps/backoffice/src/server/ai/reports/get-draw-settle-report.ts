/**
 * Use Case: Get Draw Settle Report (app-level, gộp 7 game — p1-03 §2.7)
 *
 * Điểm truy cập DUY NHẤT để tool `getDrawSettleReport` đọc báo cáo settle — dispatch theo
 * `GameProduct` sang `ListSettleDrawReportsUseCase` (không `drawId`) hoặc `ListDrawTenantsUseCase`
 * (có `drawId`, breakdown theo tenant) của package tương ứng.
 *
 * 1 tool, 2 độ sâu drill-down (danh sách kỳ ↔ breakdown tenant của 1 kỳ) — theo nguyên tắc
 * superset p1-03 §2.7, tránh tạo 2 tool cho 1 chuỗi drill.
 *
 * Dispatch bằng object map + `assertKnownGame` — 7 game dùng ĐÚNG cùng tên use-case
 * (`ListSettleDrawReportsUseCase`/`ListDrawTenantsUseCase`) và cùng shape input/output
 * (`SettleDrawReport`/`SettleTenantReport` chỉ khác field đặc thù game như jackpot/lineCount,
 * nhưng RAW passthrough không cần biết trước).
 */

import { UseCase } from "@megawin/app-core/use-cases";
import {
  ListDrawTenantsUseCase as Bingo18ListDrawTenantsUseCase,
  ListSettleDrawReportsUseCase as Bingo18ListSettleDrawReportsUseCase,
} from "@megawin/game-bingo18-application/use-cases/reports";
import { GameProduct } from "@megawin/game-core/entities";
import { GAME_LABELS } from "@megawin/game-core/labels";
import {
  ListDrawTenantsUseCase as KenoListDrawTenantsUseCase,
  ListSettleDrawReportsUseCase as KenoListSettleDrawReportsUseCase,
} from "@megawin/game-keno-application/use-cases/reports";
import {
  ListDrawTenantsUseCase as Lotto535ListDrawTenantsUseCase,
  ListSettleDrawReportsUseCase as Lotto535ListSettleDrawReportsUseCase,
} from "@megawin/game-lotto535-application/use-cases/reports";
import {
  ListDrawTenantsUseCase as Max3dListDrawTenantsUseCase,
  ListSettleDrawReportsUseCase as Max3dListSettleDrawReportsUseCase,
} from "@megawin/game-max3d-application/use-cases/reports";
import {
  ListDrawTenantsUseCase as Max3dproListDrawTenantsUseCase,
  ListSettleDrawReportsUseCase as Max3dproListSettleDrawReportsUseCase,
} from "@megawin/game-max3dpro-application/use-cases/reports";
import {
  ListDrawTenantsUseCase as Mega645ListDrawTenantsUseCase,
  ListSettleDrawReportsUseCase as Mega645ListSettleDrawReportsUseCase,
} from "@megawin/game-mega645-application/use-cases/reports";
import {
  ListDrawTenantsUseCase as Power655ListDrawTenantsUseCase,
  ListSettleDrawReportsUseCase as Power655ListSettleDrawReportsUseCase,
} from "@megawin/game-power655-application/use-cases/reports";
import { AppException } from "@megawin/shared/errors";

import type { GetDrawSettleReportDispatchInput, GetDrawSettleReportDispatchOutput } from "./types";

/** Trần cứng cho `limit` — tool AI, không phải bảng ảo hoá web (p1-03 §1.1 mục 2). */
const MAX_LIMIT = 30;
const DEFAULT_LIMIT = 10;

const listSettleUseCases = {
  [GameProduct.Keno]: new KenoListSettleDrawReportsUseCase(),
  [GameProduct.Lotto535]: new Lotto535ListSettleDrawReportsUseCase(),
  [GameProduct.Mega645]: new Mega645ListSettleDrawReportsUseCase(),
  [GameProduct.Power655]: new Power655ListSettleDrawReportsUseCase(),
  [GameProduct.Max3d]: new Max3dListSettleDrawReportsUseCase(),
  [GameProduct.Max3dpro]: new Max3dproListSettleDrawReportsUseCase(),
  [GameProduct.Bingo18]: new Bingo18ListSettleDrawReportsUseCase(),
};

const listDrawTenantsUseCases = {
  [GameProduct.Keno]: new KenoListDrawTenantsUseCase(),
  [GameProduct.Lotto535]: new Lotto535ListDrawTenantsUseCase(),
  [GameProduct.Mega645]: new Mega645ListDrawTenantsUseCase(),
  [GameProduct.Power655]: new Power655ListDrawTenantsUseCase(),
  [GameProduct.Max3d]: new Max3dListDrawTenantsUseCase(),
  [GameProduct.Max3dpro]: new Max3dproListDrawTenantsUseCase(),
  [GameProduct.Bingo18]: new Bingo18ListDrawTenantsUseCase(),
};

/** Bắt compiler khi `GameProduct` thêm entry mới mà 2 map trên chưa có. */
function assertKnownGame(
  game: GameProduct,
): asserts game is keyof typeof listSettleUseCases & keyof typeof listDrawTenantsUseCases {
  if (!(game in listSettleUseCases) || !(game in listDrawTenantsUseCases)) {
    throw AppException.internal(`Game không được hỗ trợ: ${String(game)}`);
  }
}

export class GetDrawSettleReportDispatchUseCase extends UseCase<
  GetDrawSettleReportDispatchInput,
  GetDrawSettleReportDispatchOutput
> {
  protected async execute(input: GetDrawSettleReportDispatchInput): Promise<GetDrawSettleReportDispatchOutput> {
    const { game, from, to, drawId } = input;
    assertKnownGame(game);

    const result =
      drawId === undefined
        ? await listSettleUseCases[game].run({
            from,
            to,
            page: input.page ?? 1,
            limit: Math.min(input.limit ?? DEFAULT_LIMIT, MAX_LIMIT),
          })
        : await listDrawTenantsUseCases[game].run({ drawId });

    return {
      meta: { game, gameLabel: GAME_LABELS[game], from, to, drawId, fetchedAt: new Date().toISOString() },
      result,
    };
  }
}
