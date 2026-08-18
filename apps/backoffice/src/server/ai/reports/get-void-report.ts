/**
 * Use Case: Get Void Report (app-level, gộp 7 game — Wave 2)
 *
 * Điểm truy cập DUY NHẤT để tool `getVoidReport` đọc báo cáo kỳ ĐÃ HUỶ (void) — dispatch theo
 * `GameProduct` sang `ListVoidReportsUseCase` (không `drawId`) hoặc `ListVoidDrawTenantsUseCase`
 * (có `drawId`, breakdown theo tenant) của package tương ứng.
 *
 * Void RẤT HIẾM xảy ra (huỷ kỳ quay do sự cố/sai kết quả) — khác `getDrawSettleReport` (mọi kỳ
 * bình thường). Cùng nguyên tắc 1 tool 2 độ sâu drill-down (p1-03 §2.7), dispatch bằng object map
 * + `assertKnownGame`, KHÔNG map field vì cả 7 game dùng ĐÚNG cùng tên use-case và shape input/
 * output (`VoidDrawReport`/`VoidTenantBreakdownRow`).
 */

import { UseCase } from "@megawin/app-core/use-cases";
import {
  ListVoidDrawTenantsUseCase as Bingo18ListVoidDrawTenantsUseCase,
  ListVoidReportsUseCase as Bingo18ListVoidReportsUseCase,
} from "@megawin/game-bingo18-application/use-cases/reports";
import { GameProduct } from "@megawin/game-core/entities";
import { GAME_LABELS } from "@megawin/game-core/labels";
import {
  ListVoidDrawTenantsUseCase as KenoListVoidDrawTenantsUseCase,
  ListVoidReportsUseCase as KenoListVoidReportsUseCase,
} from "@megawin/game-keno-application/use-cases/reports";
import {
  ListVoidDrawTenantsUseCase as Lotto535ListVoidDrawTenantsUseCase,
  ListVoidReportsUseCase as Lotto535ListVoidReportsUseCase,
} from "@megawin/game-lotto535-application/use-cases/reports";
import {
  ListVoidDrawTenantsUseCase as Max3dListVoidDrawTenantsUseCase,
  ListVoidReportsUseCase as Max3dListVoidReportsUseCase,
} from "@megawin/game-max3d-application/use-cases/reports";
import {
  ListVoidDrawTenantsUseCase as Max3dproListVoidDrawTenantsUseCase,
  ListVoidReportsUseCase as Max3dproListVoidReportsUseCase,
} from "@megawin/game-max3dpro-application/use-cases/reports";
import {
  ListVoidDrawTenantsUseCase as Mega645ListVoidDrawTenantsUseCase,
  ListVoidReportsUseCase as Mega645ListVoidReportsUseCase,
} from "@megawin/game-mega645-application/use-cases/reports";
import {
  ListVoidDrawTenantsUseCase as Power655ListVoidDrawTenantsUseCase,
  ListVoidReportsUseCase as Power655ListVoidReportsUseCase,
} from "@megawin/game-power655-application/use-cases/reports";
import { AppException } from "@megawin/shared/errors";

import type { GetVoidReportDispatchInput, GetVoidReportDispatchOutput } from "./types";

const listVoidUseCases = {
  [GameProduct.Keno]: new KenoListVoidReportsUseCase(),
  [GameProduct.Lotto535]: new Lotto535ListVoidReportsUseCase(),
  [GameProduct.Mega645]: new Mega645ListVoidReportsUseCase(),
  [GameProduct.Power655]: new Power655ListVoidReportsUseCase(),
  [GameProduct.Max3d]: new Max3dListVoidReportsUseCase(),
  [GameProduct.Max3dpro]: new Max3dproListVoidReportsUseCase(),
  [GameProduct.Bingo18]: new Bingo18ListVoidReportsUseCase(),
};

const listVoidDrawTenantsUseCases = {
  [GameProduct.Keno]: new KenoListVoidDrawTenantsUseCase(),
  [GameProduct.Lotto535]: new Lotto535ListVoidDrawTenantsUseCase(),
  [GameProduct.Mega645]: new Mega645ListVoidDrawTenantsUseCase(),
  [GameProduct.Power655]: new Power655ListVoidDrawTenantsUseCase(),
  [GameProduct.Max3d]: new Max3dListVoidDrawTenantsUseCase(),
  [GameProduct.Max3dpro]: new Max3dproListVoidDrawTenantsUseCase(),
  [GameProduct.Bingo18]: new Bingo18ListVoidDrawTenantsUseCase(),
};

/** Bắt compiler khi `GameProduct` thêm entry mới mà 2 map trên chưa có. */
function assertKnownGame(
  game: GameProduct,
): asserts game is keyof typeof listVoidUseCases & keyof typeof listVoidDrawTenantsUseCases {
  if (!(game in listVoidUseCases) || !(game in listVoidDrawTenantsUseCases)) {
    throw AppException.internal(`Game không được hỗ trợ: ${String(game)}`);
  }
}

export class GetVoidReportDispatchUseCase extends UseCase<GetVoidReportDispatchInput, GetVoidReportDispatchOutput> {
  protected async execute(input: GetVoidReportDispatchInput): Promise<GetVoidReportDispatchOutput> {
    const { game, from, to, drawId } = input;
    assertKnownGame(game);

    const result =
      drawId === undefined
        ? await listVoidUseCases[game].run({ from, to })
        : await listVoidDrawTenantsUseCases[game].run({ drawId });

    return {
      meta: { game, gameLabel: GAME_LABELS[game], from, to, drawId, fetchedAt: new Date().toISOString() },
      result,
    };
  }
}
