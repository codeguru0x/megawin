/**
 * Use Case: Get Ops Snapshot (app-level, gộp 7 game — p1-03 §2.4)
 *
 * Điểm truy cập DUY NHẤT để tool `getOpsSnapshot` đọc snapshot vận hành 1 kỳ — dispatch theo
 * `GameProduct` sang `GetOpsSnapshotUseCase` của game tương ứng. Đặt dưới `server/ai/` vì switch
 * cross-game này CHỈ tồn tại cho model — web UI đã có route riêng từng game
 * (`{game}/operations/snapshot`) với cơ chế ETag/304 riêng mà tool KHÔNG cần (luôn lấy tươi).
 *
 * Dispatch bằng object map + `assertKnownGame` (không `switch`/`Record<GameProduct, any>`) — mỗi
 * entry giữ type thật của use-case riêng game; compiler đỏ ngay khi `GameProduct` thêm entry mới
 * mà map chưa có (cùng pattern `get-draw-snapshot.ts`).
 */

import { UseCase } from "@megawin/app-core/use-cases";
import { GetOpsSnapshotUseCase as Bingo18SnapshotUseCase } from "@megawin/game-bingo18-application/use-cases/operations";
import { GameProduct } from "@megawin/game-core/entities";
import { GAME_LABELS } from "@megawin/game-core/labels";
import { GetOpsSnapshotUseCase as KenoSnapshotUseCase } from "@megawin/game-keno-application/use-cases/operations";
import { GetOpsSnapshotUseCase as Lotto535SnapshotUseCase } from "@megawin/game-lotto535-application/use-cases/operations";
import { GetOpsSnapshotUseCase as Max3dSnapshotUseCase } from "@megawin/game-max3d-application/use-cases/operations";
import { GetOpsSnapshotUseCase as Max3dproSnapshotUseCase } from "@megawin/game-max3dpro-application/use-cases/operations";
import { GetOpsSnapshotUseCase as Mega645SnapshotUseCase } from "@megawin/game-mega645-application/use-cases/operations";
import { GetOpsSnapshotUseCase as Power655SnapshotUseCase } from "@megawin/game-power655-application/use-cases/operations";
import { AppException } from "@megawin/shared/errors";

import type { GetOpsSnapshotDispatchInput, GetOpsSnapshotDispatchOutput } from "./types";

const snapshotUseCases = {
  [GameProduct.Keno]: new KenoSnapshotUseCase(),
  [GameProduct.Lotto535]: new Lotto535SnapshotUseCase(),
  [GameProduct.Mega645]: new Mega645SnapshotUseCase(),
  [GameProduct.Power655]: new Power655SnapshotUseCase(),
  [GameProduct.Max3d]: new Max3dSnapshotUseCase(),
  [GameProduct.Max3dpro]: new Max3dproSnapshotUseCase(),
  [GameProduct.Bingo18]: new Bingo18SnapshotUseCase(),
};

/** Bắt compiler khi `GameProduct` thêm entry mới mà `snapshotUseCases` chưa có. */
function assertKnownGame(game: GameProduct): asserts game is keyof typeof snapshotUseCases {
  if (!(game in snapshotUseCases)) {
    throw AppException.internal(`Game không được hỗ trợ: ${String(game)}`);
  }
}

export class GetOpsSnapshotDispatchUseCase extends UseCase<GetOpsSnapshotDispatchInput, GetOpsSnapshotDispatchOutput> {
  protected async execute(input: GetOpsSnapshotDispatchInput): Promise<GetOpsSnapshotDispatchOutput> {
    const { game, drawId } = input;
    assertKnownGame(game);

    const snapshot = await snapshotUseCases[game].run({ drawId });

    return {
      meta: { game, gameLabel: GAME_LABELS[game], drawId, fetchedAt: new Date().toISOString() },
      snapshot,
    };
  }
}
