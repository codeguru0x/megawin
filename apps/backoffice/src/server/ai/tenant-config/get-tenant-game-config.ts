/**
 * Use Case: Get Tenant Game Config (app-level, gộp 7 game — p1-03 §2.6)
 *
 * Điểm truy cập DUY NHẤT để tool `getTenantGameConfig` đọc cấu hình RIÊNG 1 đại lý (hoặc TẤT
 * CẢ đại lý) của 1 game — dispatch theo `GameProduct` sang `GetTenantConfigUseCase` /
 * `ListTenantConfigsUseCase` của game tương ứng, rồi gắn nhãn `ConfigItem` (cùng contract với
 * `getGameConfig`).
 *
 * Đóng đúng gap `instructions.md` rule 10 đang phải dặn "chưa tra được hoa hồng đại lý" (p1-03
 * §2.6) — model có tool thật để trả lời câu "đại lý X hoa hồng Keno bao nhiêu".
 *
 * `tenantId` không tồn tại (chưa từng override) KHÔNG phải lỗi — nghĩa là đại lý đang dùng
 * MẶC ĐỊNH hệ thống (`getGameConfig` section `rates`). Dispatcher trả `rows: []`, tool phải nói
 * rõ điều này qua `meta`, không throw.
 *
 * Dispatch bằng object map + `assertKnownGame` (không `switch`) — 7 game dùng ĐÚNG 1 shape
 * `TenantConfigEntity` (tenantId/commissionRate/isEnabled/version) nên không cần giữ type riêng
 * theo từng nhánh như dispatcher draws/operations.
 */

import { UseCase } from "@megawin/app-core/use-cases";
import {
  GetTenantConfigUseCase as Bingo18GetTenantConfigUseCase,
  ListTenantConfigsUseCase as Bingo18ListTenantConfigsUseCase,
} from "@megawin/game-bingo18-application/use-cases/tenant-config";
import { GameProduct } from "@megawin/game-core/entities";
import { GAME_LABELS } from "@megawin/game-core/labels";
import {
  GetTenantConfigUseCase as KenoGetTenantConfigUseCase,
  ListTenantConfigsUseCase as KenoListTenantConfigsUseCase,
} from "@megawin/game-keno-application/use-cases/tenant-config";
import {
  GetTenantConfigUseCase as Lotto535GetTenantConfigUseCase,
  ListTenantConfigsUseCase as Lotto535ListTenantConfigsUseCase,
} from "@megawin/game-lotto535-application/use-cases/tenant-config";
import {
  GetTenantConfigUseCase as Max3dGetTenantConfigUseCase,
  ListTenantConfigsUseCase as Max3dListTenantConfigsUseCase,
} from "@megawin/game-max3d-application/use-cases/tenant-config";
import {
  GetTenantConfigUseCase as Max3dproGetTenantConfigUseCase,
  ListTenantConfigsUseCase as Max3dproListTenantConfigsUseCase,
} from "@megawin/game-max3dpro-application/use-cases/tenant-config";
import {
  GetTenantConfigUseCase as Mega645GetTenantConfigUseCase,
  ListTenantConfigsUseCase as Mega645ListTenantConfigsUseCase,
} from "@megawin/game-mega645-application/use-cases/tenant-config";
import {
  GetTenantConfigUseCase as Power655GetTenantConfigUseCase,
  ListTenantConfigsUseCase as Power655ListTenantConfigsUseCase,
} from "@megawin/game-power655-application/use-cases/tenant-config";
import { AppException } from "@megawin/shared/errors";

import { item } from "../payload";
import type { GetTenantGameConfigDispatchInput, GetTenantGameConfigDispatchOutput, TenantConfigRow } from "./types";

/** Shape chung 7 game — mọi `TenantConfigEntity` per-game đều khớp cấu trúc này. */
interface TenantConfigShape {
  tenantId: string;
  commissionRate: number;
  isEnabled: boolean;
}

const getUseCases = {
  [GameProduct.Keno]: new KenoGetTenantConfigUseCase(),
  [GameProduct.Lotto535]: new Lotto535GetTenantConfigUseCase(),
  [GameProduct.Mega645]: new Mega645GetTenantConfigUseCase(),
  [GameProduct.Power655]: new Power655GetTenantConfigUseCase(),
  [GameProduct.Max3d]: new Max3dGetTenantConfigUseCase(),
  [GameProduct.Max3dpro]: new Max3dproGetTenantConfigUseCase(),
  [GameProduct.Bingo18]: new Bingo18GetTenantConfigUseCase(),
};

const listUseCases = {
  [GameProduct.Keno]: new KenoListTenantConfigsUseCase(),
  [GameProduct.Lotto535]: new Lotto535ListTenantConfigsUseCase(),
  [GameProduct.Mega645]: new Mega645ListTenantConfigsUseCase(),
  [GameProduct.Power655]: new Power655ListTenantConfigsUseCase(),
  [GameProduct.Max3d]: new Max3dListTenantConfigsUseCase(),
  [GameProduct.Max3dpro]: new Max3dproListTenantConfigsUseCase(),
  [GameProduct.Bingo18]: new Bingo18ListTenantConfigsUseCase(),
};

/** Bắt compiler khi `GameProduct` thêm entry mới mà 2 map trên chưa có. */
function assertKnownGame(game: GameProduct): asserts game is keyof typeof getUseCases & keyof typeof listUseCases {
  if (!(game in getUseCases) || !(game in listUseCases)) {
    throw AppException.internal(`Game không được hỗ trợ: ${String(game)}`);
  }
}

/** Map 1 `TenantConfigEntity` sang `ConfigItem[]` — cùng contract `getGameConfig`. */
function describeTenantConfig(config: TenantConfigShape): TenantConfigRow {
  return {
    tenantId: config.tenantId,
    items: [
      item(
        "commissionRate",
        "Hoa hồng đại lý (override riêng)",
        config.commissionRate,
        "ratio",
        "Override RIÊNG đại lý này — khác mặc định hệ thống ở getGameConfig section rates.",
      ),
      item("isEnabled", "Đại lý được phép chơi game này", config.isEnabled, "flag"),
    ],
  };
}

export class GetTenantGameConfigDispatchUseCase extends UseCase<
  GetTenantGameConfigDispatchInput,
  GetTenantGameConfigDispatchOutput
> {
  protected async execute(input: GetTenantGameConfigDispatchInput): Promise<GetTenantGameConfigDispatchOutput> {
    const { game, tenantId } = input;
    assertKnownGame(game);

    const rows: TenantConfigRow[] = [];

    if (tenantId === undefined) {
      const { configs } = await listUseCases[game].run();
      rows.push(...configs.map(describeTenantConfig));
    } else {
      // Chưa từng override KHÔNG phải lỗi — nghĩa là đại lý đang dùng mặc định hệ thống.
      // Bắt riêng mã lỗi này để trả rows: [] thay vì để throw lan lên safeRun() thành error.
      try {
        const { config } = await getUseCases[game].run({ tenantId });
        rows.push(describeTenantConfig(config));
      } catch (error) {
        const isNotFound = error instanceof AppException && error.code === "TENANT_CONFIG_NOT_FOUND";
        if (!isNotFound) {
          throw error;
        }
      }
    }

    return {
      meta: {
        game,
        gameLabel: GAME_LABELS[game],
        tenantId,
        count: rows.length,
        fetchedAt: new Date().toISOString(),
      },
      rows,
    };
  }
}
