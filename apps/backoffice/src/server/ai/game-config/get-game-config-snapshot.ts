/**
 * Use Case: Get Game Config Snapshot (app-level, gộp 7 game — p1-02 §3.1)
 *
 * Điểm truy cập DUY NHẤT để tool `getGameConfig` đọc `GlobalConfigEntity` — dispatch theo
 * `GameProduct` sang `GetGlobalConfigUseCase` của game tương ứng, rồi map qua descriptor
 * dereference field thật (`descriptors/<game>.ts`) thành danh sách `ConfigItem` tự giải thích
 * (`label`/`unit`/`note`) theo `GameConfigSection` được yêu cầu.
 *
 * `game-core-application` KHÔNG phụ thuộc 7 package `game-*-application` → use-case gộp PHẢI
 * sống ở tầng app (`app-use-case-layering.mdc` §1), không đặt được ở game-core. Đặt dưới
 * `server/ai/` vì payload `ConfigItem` (label/unit/note) tồn tại CHỈ để model đọc — không route
 * Next.js nào dùng shape này.
 *
 * `tryLoad` bọc lời gọi `GetGlobalConfigUseCase` — game lỗi (DB down, bug) không giết cả
 * response; lỗi được log kèm `source` là tên game.
 *
 * Dispatch bằng `switch` trên `GameProduct` (thay vì `Record<GameProduct, any>`) để mỗi
 * nhánh giữ type thật của `GlobalConfigEntity`/descriptor riêng — KHÔNG cần `any`/cast.
 * `default: return assertNever` bắt compiler khi `GameProduct` thêm entry mới mà quên nhánh.
 */

import { UseCase } from "@megawin/app-core/use-cases";
import { GetGlobalConfigUseCase as Bingo18GetConfigUseCase } from "@megawin/game-bingo18-application/use-cases/game-config";
import { GameProduct } from "@megawin/game-core/entities";
import { GAME_LABELS } from "@megawin/game-core/labels";
import { GetGlobalConfigUseCase as KenoGetConfigUseCase } from "@megawin/game-keno-application/use-cases/game-config";
import { GetGlobalConfigUseCase as Lotto535GetConfigUseCase } from "@megawin/game-lotto535-application/use-cases/game-config";
import { GetGlobalConfigUseCase as Max3dGetConfigUseCase } from "@megawin/game-max3d-application/use-cases/game-config";
import { GetGlobalConfigUseCase as Max3dproGetConfigUseCase } from "@megawin/game-max3dpro-application/use-cases/game-config";
import { GetGlobalConfigUseCase as Mega645GetConfigUseCase } from "@megawin/game-mega645-application/use-cases/game-config";
import { GetGlobalConfigUseCase as Power655GetConfigUseCase } from "@megawin/game-power655-application/use-cases/game-config";
import { AppException } from "@megawin/shared/errors";
import { tryLoad } from "@megawin/shared/utils";

import type { ConfigItem } from "../payload";
import * as bingo18Descriptor from "./descriptors/bingo18";
import * as kenoDescriptor from "./descriptors/keno";
import * as lotto535Descriptor from "./descriptors/lotto535";
import * as max3dDescriptor from "./descriptors/max3d";
import * as max3dproDescriptor from "./descriptors/max3dpro";
import * as mega645Descriptor from "./descriptors/mega645";
import * as power655Descriptor from "./descriptors/power655";
import {
  DEFAULT_GAME_CONFIG_SECTIONS,
  type GameConfigMeta,
  GameConfigSection,
  type GetGameConfigInput,
  type GetGameConfigOutput,
} from "./types";

/** Label dùng cho log khi 1 game lỗi bất thường. */
const SCOPE = "GetGameConfigSnapshot";

const kenoUseCase = new KenoGetConfigUseCase();
const lotto535UseCase = new Lotto535GetConfigUseCase();
const mega645UseCase = new Mega645GetConfigUseCase();
const power655UseCase = new Power655GetConfigUseCase();
const max3dUseCase = new Max3dGetConfigUseCase();
const max3dproUseCase = new Max3dproGetConfigUseCase();
const bingo18UseCase = new Bingo18GetConfigUseCase();

/** Config đã đọc + descriptor tương ứng — kết quả trung gian của {@link loadConfigAndDescriptor}. */
interface LoadedConfig {
  version: number;
  /**
   * Khai `Date | string` CÓ CHỦ ĐÍCH, dù entity khai `updatedAt: Date`.
   *
   * Giá trị này đi qua L2 Redis. `@megawin/cache` đã giữ được kiểu `Date` qua JSON (codec
   * `json-date-codec`), nhưng KHÔNG có gì đảm bảo entry đang nằm trong Redis do phiên bản nào ghi:
   * entry ghi trước khi codec lên vẫn sống tới hết TTL, và app khác chưa deploy vẫn ghi định dạng
   * cũ (mọi app đều là writer vì cache là read-through). Khai `Date` trần ở đây là tự lừa compiler —
   * đúng cái đã gây crash `updatedAt.toISOString is not a function` hôm 17/08.
   */
  updatedAt: Date | string;
  applicableSections: readonly GameConfigSection[];
  describe(section: GameConfigSection, pickSize?: number): ConfigItem[];
}

/**
 * Đưa mốc thời gian từ cache về ISO string, nhận cả `Date` lẫn string (xem {@link LoadedConfig}).
 *
 * Trả `undefined` khi giá trị không dựng được thành thời điểm hợp lệ, thay vì để `toISOString()`
 * throw `RangeError`: đây chỉ là metadata "cập nhật lúc" hiển thị cho staff — không đáng để làm
 * đổ cả câu trả lời của trợ lý.
 */
function toIsoOrUndefined(value: Date | string): string | undefined {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

/**
 * Đọc `GlobalConfigEntity` đúng game + bind descriptor cùng game — mỗi `case` giữ type
 * thật (không union 7 shape khác nhau), nên `describe()` trả về closure đã đóng type.
 */
async function loadConfigAndDescriptor(game: GameProduct): Promise<LoadedConfig> {
  switch (game) {
    case GameProduct.Keno: {
      const config = await kenoUseCase.run();
      return {
        version: config.version,
        updatedAt: config.updatedAt,
        applicableSections: kenoDescriptor.APPLICABLE_SECTIONS,
        describe: (section, pickSize) => kenoDescriptor.describe(config, section, pickSize),
      };
    }
    case GameProduct.Lotto535: {
      const config = await lotto535UseCase.run();
      return {
        version: config.version,
        updatedAt: config.updatedAt,
        applicableSections: lotto535Descriptor.APPLICABLE_SECTIONS,
        describe: (section) => lotto535Descriptor.describe(config, section),
      };
    }
    case GameProduct.Mega645: {
      const config = await mega645UseCase.run();
      return {
        version: config.version,
        updatedAt: config.updatedAt,
        applicableSections: mega645Descriptor.APPLICABLE_SECTIONS,
        describe: (section) => mega645Descriptor.describe(config, section),
      };
    }
    case GameProduct.Power655: {
      const config = await power655UseCase.run();
      return {
        version: config.version,
        updatedAt: config.updatedAt,
        applicableSections: power655Descriptor.APPLICABLE_SECTIONS,
        describe: (section) => power655Descriptor.describe(config, section),
      };
    }
    case GameProduct.Max3d: {
      const config = await max3dUseCase.run();
      return {
        version: config.version,
        updatedAt: config.updatedAt,
        applicableSections: max3dDescriptor.APPLICABLE_SECTIONS,
        describe: (section) => max3dDescriptor.describe(config, section),
      };
    }
    case GameProduct.Max3dpro: {
      const config = await max3dproUseCase.run();
      return {
        version: config.version,
        updatedAt: config.updatedAt,
        applicableSections: max3dproDescriptor.APPLICABLE_SECTIONS,
        describe: (section) => max3dproDescriptor.describe(config, section),
      };
    }
    case GameProduct.Bingo18: {
      const config = await bingo18UseCase.run();
      return {
        version: config.version,
        updatedAt: config.updatedAt,
        applicableSections: bingo18Descriptor.APPLICABLE_SECTIONS,
        describe: (section) => bingo18Descriptor.describe(config, section),
      };
    }
    default: {
      const _exhaustive: never = game;
      throw AppException.internal(`Game không được hỗ trợ: ${String(_exhaustive)}`);
    }
  }
}

const ALL_SECTIONS: readonly GameConfigSection[] = Object.values(GameConfigSection);

export class GetGameConfigSnapshotUseCase extends UseCase<GetGameConfigInput, GetGameConfigOutput> {
  protected async execute(input: GetGameConfigInput): Promise<GetGameConfigOutput> {
    const { game, pickSize } = input;
    const sections = input.sections ?? DEFAULT_GAME_CONFIG_SECTIONS;

    const loaded = await tryLoad(() => loadConfigAndDescriptor(game), { scope: SCOPE, source: game });
    if (loaded === undefined) {
      throw AppException.internal(`Không đọc được cấu hình game ${game}.`);
    }

    const applicableSet = new Set(loaded.applicableSections);
    const sectionsToFetch = sections.filter((s) => applicableSet.has(s));
    const sectionsNotApplicable = sections.filter((s) => !applicableSet.has(s));
    const sectionsNotFetched = ALL_SECTIONS.filter((s) => applicableSet.has(s) && !sectionsToFetch.includes(s));

    const items = sectionsToFetch.flatMap((section) => loaded.describe(section, pickSize));

    const meta: GameConfigMeta = {
      game,
      gameLabel: GAME_LABELS[game],
      configVersion: loaded.version,
      updatedAt: toIsoOrUndefined(loaded.updatedAt),
      fetchedAt: new Date().toISOString(),
      sectionsReturned: sectionsToFetch,
      sectionsNotFetched,
      sectionsNotApplicable,
    };

    return { meta, items };
  }
}
