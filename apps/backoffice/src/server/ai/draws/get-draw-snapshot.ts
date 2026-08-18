/**
 * Use Case: Get Draw Snapshot (app-level, gộp 7 game — p1-03 §2.2)
 *
 * Điểm truy cập DUY NHẤT để tool `getDrawDetail` đọc 1 kỳ quay (hoặc kỳ hiện hành) — dispatch theo
 * `GameProduct` sang `GetDrawDetailUseCase`/`GetCurrentDrawUseCase` của game tương ứng, KHÔNG map
 * lại field (draw là dữ liệu sự kiện, tự giải thích — xem `types.ts`).
 *
 * `game-core-application` KHÔNG phụ thuộc 7 package `game-*-application` → use-case gộp PHẢI sống
 * ở tầng app (`app-use-case-layering.mdc` §1). Đặt dưới `server/ai/` vì switch-theo-game này CHỈ
 * tồn tại cho model — web UI đã có route riêng từng game (`{game}/draws/[drawId]`, `draws/current`),
 * không cần gộp cross-game.
 *
 * Dispatch bằng `switch` trên `GameProduct` (không `Record<GameProduct, any>`) để mỗi nhánh giữ
 * type thật của use-case riêng game — `default: throw assertNever` bắt compiler khi `GameProduct`
 * thêm entry mới mà quên nhánh.
 */

import { UseCase } from "@megawin/app-core/use-cases";
import {
  GetCurrentDrawUseCase as Bingo18CurrentUseCase,
  GetDrawDetailUseCase as Bingo18DetailUseCase,
} from "@megawin/game-bingo18-application/use-cases/draws";
import { GameProduct } from "@megawin/game-core/entities";
import { GAME_LABELS } from "@megawin/game-core/labels";
import {
  GetCurrentDrawUseCase as KenoCurrentUseCase,
  GetDrawDetailUseCase as KenoDetailUseCase,
} from "@megawin/game-keno-application/use-cases/draws";
import {
  GetCurrentDrawUseCase as Lotto535CurrentUseCase,
  GetDrawDetailUseCase as Lotto535DetailUseCase,
} from "@megawin/game-lotto535-application/use-cases/draws";
import {
  GetCurrentDrawUseCase as Max3dCurrentUseCase,
  GetDrawDetailUseCase as Max3dDetailUseCase,
} from "@megawin/game-max3d-application/use-cases/draws";
import {
  GetCurrentDrawUseCase as Max3dproCurrentUseCase,
  GetDrawDetailUseCase as Max3dproDetailUseCase,
} from "@megawin/game-max3dpro-application/use-cases/draws";
import {
  GetCurrentDrawUseCase as Mega645CurrentUseCase,
  GetDrawDetailUseCase as Mega645DetailUseCase,
} from "@megawin/game-mega645-application/use-cases/draws";
import {
  GetCurrentDrawUseCase as Power655CurrentUseCase,
  GetDrawDetailUseCase as Power655DetailUseCase,
} from "@megawin/game-power655-application/use-cases/draws";
import { AppException } from "@megawin/shared/errors";

import type { GetDrawSnapshotInput, GetDrawSnapshotOutput } from "./types";

const detailUseCases = {
  [GameProduct.Keno]: new KenoDetailUseCase(),
  [GameProduct.Lotto535]: new Lotto535DetailUseCase(),
  [GameProduct.Mega645]: new Mega645DetailUseCase(),
  [GameProduct.Power655]: new Power655DetailUseCase(),
  [GameProduct.Max3d]: new Max3dDetailUseCase(),
  [GameProduct.Max3dpro]: new Max3dproDetailUseCase(),
  [GameProduct.Bingo18]: new Bingo18DetailUseCase(),
};

const currentUseCases = {
  [GameProduct.Keno]: new KenoCurrentUseCase(),
  [GameProduct.Lotto535]: new Lotto535CurrentUseCase(),
  [GameProduct.Mega645]: new Mega645CurrentUseCase(),
  [GameProduct.Power655]: new Power655CurrentUseCase(),
  [GameProduct.Max3d]: new Max3dCurrentUseCase(),
  [GameProduct.Max3dpro]: new Max3dproCurrentUseCase(),
  [GameProduct.Bingo18]: new Bingo18CurrentUseCase(),
};

/** Bắt compiler khi `GameProduct` thêm entry mới mà `detailUseCases`/`currentUseCases` chưa có. */
function assertKnownGame(game: GameProduct): asserts game is keyof typeof detailUseCases {
  if (!(game in detailUseCases)) {
    throw AppException.internal(`Game không được hỗ trợ: ${String(game)}`);
  }
}

export class GetDrawSnapshotUseCase extends UseCase<GetDrawSnapshotInput, GetDrawSnapshotOutput> {
  protected async execute(input: GetDrawSnapshotInput): Promise<GetDrawSnapshotOutput> {
    const { game, drawId } = input;
    assertKnownGame(game);

    const isCurrent = drawId === undefined;
    const draw = isCurrent ? await currentUseCases[game].run() : await detailUseCases[game].run({ drawId });

    return {
      meta: { game, gameLabel: GAME_LABELS[game], fetchedAt: new Date().toISOString(), isCurrent },
      draw,
    };
  }
}
