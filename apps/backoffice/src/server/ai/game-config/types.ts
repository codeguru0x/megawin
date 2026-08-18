/**
 * `getGameConfig` — types riêng của domain cấu hình game (p1-02 §3.2/§3.3).
 *
 * `ConfigItem`/`ConfigUnit`/`item()` KHÔNG khai báo ở đây — chúng là contract chung mọi tool, sống
 * ở `../payload.ts`. File này chỉ chứa thứ đặc thù cấu hình: section, meta, input/output.
 *
 * Rename field ở entity domain làm ĐỎ COMPILE ngay tại descriptor (property access thật), KHÔNG
 * làm doc lệch âm thầm (xem `descriptors/*.ts`).
 */

import type { GameProduct } from "@megawin/game-core/entities";

import type { ConfigItem } from "../payload";

export type { ConfigItem, ConfigUnit } from "../payload";

/** Section của `GlobalConfigEntity` mà `getGameConfig` cho phép lọc — khớp §1.2 của plan. */
export const GameConfigSection = {
  /** Mệnh giá, betCount, board, kỳ, lịch quay. */
  Play: "play",
  /** Hoa hồng mặc định, companyRate (nếu có). */
  Rates: "rates",
  /** defaultPrizes / bảng giải riêng theo game. */
  Prizes: "prizes",
  /** CHỈ lotto535, mega645, power655. */
  Jackpot: "jackpot",
  /** Ngưỡng alert vận hành. */
  Ops: "ops",
} as const;
export type GameConfigSection = (typeof GameConfigSection)[keyof typeof GameConfigSection];

/** Section mặc định khi caller không truyền `sections` — bộ hay hỏi nhất, giữ turn rẻ. */
export const DEFAULT_GAME_CONFIG_SECTIONS: readonly GameConfigSection[] = [
  GameConfigSection.Play,
  GameConfigSection.Rates,
];

/**
 * `meta` của `getGameConfig` — model phải biết nó CHƯA có gì, để KHÔNG bịa (p1-02 §3.3).
 */
export interface GameConfigMeta {
  game: GameProduct;
  /** Từ `GAME_LABELS`, KHÔNG tự map lại. */
  gameLabel: string;
  /** `GlobalConfigEntity.version` — mốc để staff đối chiếu khi tranh luận số. */
  configVersion: number;
  /**
   * Lần cuối staff sửa config (ISO).
   *
   * `undefined` khi mốc này không dựng được thành thời điểm hợp lệ — giá trị đi qua L2 Redis nên
   * định dạng phụ thuộc phiên bản app đã ghi entry (xem `LoadedConfig.updatedAt` trong
   * `get-game-config-snapshot.ts`). Thiếu mốc hiển thị thì bỏ qua, KHÔNG làm đổ cả câu trả lời.
   */
  updatedAt?: string;
  /** Thời điểm tool đọc (ISO) — cơ sở cho rule chống dùng số cũ (§3.5). */
  fetchedAt: string;
  sectionsReturned: readonly GameConfigSection[];
  /** Section game này CÓ nhưng lần gọi này KHÔNG lấy → model phải gọi lại, không suy đoán. */
  sectionsNotFetched: readonly GameConfigSection[];
  /** Section game này KHÔNG có (vd `jackpot` với Keno) → model nói "không có", không bịa. */
  sectionsNotApplicable: readonly GameConfigSection[];
}

/** Output của `getGameConfig` — danh sách item đã gắn nhãn + `meta` tự giải thích. */
export interface GetGameConfigOutput {
  meta: GameConfigMeta;
  items: ConfigItem[];
}

/** Input của `getGameConfig` (đã qua Zod ở biên tool — xem `agent/tools/getGameConfig.ts`). */
export interface GetGameConfigInput {
  game: GameProduct;
  sections?: GameConfigSection[];
  /**
   * Chỉ có nghĩa với Keno `Prizes` — trả 1 hàng của ma trận `basicPrizes` (pick1..10) thay vì
   * toàn bảng (toàn bảng ~60 dòng, nổ token cho câu hỏi thường chỉ cần 1 pick size).
   */
  pickSize?: number;
}
