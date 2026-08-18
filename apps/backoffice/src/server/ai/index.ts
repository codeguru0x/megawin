/**
 * Barrel tầng AI server-side — điểm import DUY NHẤT cho `agent/tools/*`.
 *
 * MỌI thứ trong `server/ai/**` tồn tại CHỈ vì agent: payload gắn nhãn (`ConfigItem`), use-case
 * gom dữ liệu rồi map sang shape model đọc được. Không route Next.js nào dùng các shape này —
 * route dùng RAW DTO ở `server/use-cases/**`.
 *
 * HƯỚNG PHỤ THUỘC MỘT CHIỀU: `server/ai/**` → `server/use-cases/**`, KHÔNG BAO GIỜ ngược lại.
 * Raw facade phải giữ trung lập với consumer (dashboard + AI dùng chung); nhét `ConfigItem` vào đó
 * là ép route Next.js nhận contract dành cho model. Cưỡng chế bằng
 * `pnpm --filter @megawin/backoffice check:server-boundary`.
 *
 * Thêm tool mới cần payload gắn nhãn: tạo `server/ai/<domain>/`, tái dùng `item()` từ `./payload`,
 * export ở đây. Tool chỉ passthrough use-case của package (như `getFinancialByGame`) KHÔNG cần file
 * nào ở đây — import thẳng `@megawin/*-application` trong tool.
 */

export { GetGameConfigSnapshotUseCase } from "./game-config/get-game-config-snapshot";
export type {
  GameConfigMeta,
  GetGameConfigInput,
  GetGameConfigOutput,
} from "./game-config/types";
export { DEFAULT_GAME_CONFIG_SECTIONS, GameConfigSection } from "./game-config/types";
export { GetGameJackpotUseCase } from "./jackpot/get-game-jackpot";
export type { GetGameJackpotInput, GetGameJackpotOutput, JackpotBlock, JackpotMeta } from "./jackpot/types";
export type { ConfigItem, ConfigUnit } from "./payload";
export { item } from "./payload";
export type { ToolResult } from "./tool-result";
export { toToolResult } from "./tool-result";
