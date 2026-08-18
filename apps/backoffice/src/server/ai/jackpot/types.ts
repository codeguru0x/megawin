/**
 * `getGameJackpot` — types riêng của domain jackpot phía AI (p1-02 §3.4).
 *
 * TÁCH KHỎI `game-config/types.ts` (nơi chúng từng nằm) vì jackpot là số ĐANG TÍCH LUỸ, KHÔNG
 * phải cấu hình — không có `configVersion`, đọc lại sau vài phút là khác. Đặt chung với config
 * từng khiến `get-game-jackpot.ts` bị xếp lạc vào `game-config/` dù không đọc field config nào.
 *
 * RAW DTO của 3 game (`Mega645JackpotOutput`…) sống ở `../../use-cases/jackpot/types.ts` — tầng
 * dữ liệu dùng chung với dashboard. Ở đây chỉ có shape đã gắn nhãn cho model.
 */

import type { JackpotGameProduct } from "@megawin/game-core/entities";

import type { ConfigItem } from "../payload";

/** Input của `getGameJackpot`. Không truyền `game` → trả cả 3 game có jackpot. */
export interface GetGameJackpotInput {
  game?: JackpotGameProduct;
}

/** `meta` của 1 khối jackpot — mốc đọc số, KHÔNG có `configVersion` (đây không phải config). */
export interface JackpotMeta {
  game: JackpotGameProduct;
  gameLabel: string;
  /** Mốc đọc số jackpot (ISO) — số dư live, staff hỏi lại sau vài phút có thể đã khác. */
  asOf: string;
}

/** 1 khối jackpot đã gắn nhãn — Power 6/55 trả 2 khối (JP1, JP2) qua 2 entry riêng trong `blocks`. */
export interface JackpotBlock {
  meta: JackpotMeta;
  items: ConfigItem[];
}

/** Output của `getGameJackpot` — 1 khối/game (Power 6/55 = 2 khối JP1/JP2 phân biệt bằng `label`). */
export interface GetGameJackpotOutput {
  blocks: JackpotBlock[];
}
