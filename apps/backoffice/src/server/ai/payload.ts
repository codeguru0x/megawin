/**
 * AI payload contract — đơn vị hiển thị chung cho MỌI tool trả số cho model (p1-02 §3.2).
 *
 * TÁCH RA FILE RIÊNG (không để trong `game-config/types.ts`) vì đây là contract **trung lập với
 * domain**: `getGameConfig` (cấu hình), `getGameJackpot` (số tích luỹ live), và mọi tool payload
 * sau này đều dùng cùng `ConfigItem`. Để nó nằm trong `game-config/` buộc tool jackpot phải import
 * xuyên domain chỉ để lấy `item()` — đúng lý do trước đây `get-game-jackpot.ts` bị đặt lạc chỗ
 * trong `game-config/`.
 *
 * Nguyên tắc trung tâm: payload PHẢI tự giải thích — model đọc `label`/`unit`/`note` đi kèm giá
 * trị, KHÔNG suy nghĩa từ tên field. Vì vậy `label` ở đây là **prompt engineering**: sửa nó là
 * điều chỉnh cách model hiểu số, KHÔNG phải đổi nghiệp vụ. Đây là lý do `server/ai/**` tách khỏi
 * `server/use-cases/**` (raw data contract, đổi là breaking) — 2 nhịp thay đổi khác nhau.
 *
 * Tool KHÔNG được trả nguyên object DB: luôn map qua `item()` để mỗi số có nhãn + đơn vị.
 */

/** Đơn vị của một giá trị trong payload — model KHÔNG phải suy từ tên field. */
export const ConfigUnit = {
  /** Tiền, integer VND. */
  Vnd: "vnd",
  /** Số thập phân 0..1 — model PHẢI ×100 khi nói phần trăm. */
  Ratio: "ratio",
  /** Số lượng (board, kỳ, line, bộ, người). */
  Count: "count",
  Minutes: "minutes",
  Seconds: "seconds",
  /** Giờ trong ngày, dạng "HH:mm". */
  TimeOfDay: "time",
  Timezone: "timezone",
  /** true/false. */
  Flag: "flag",
  /** Chuỗi không phải số/tiền/tỷ lệ (vd danh sách ngày trong tuần). */
  Text: "text",
} as const;
export type ConfigUnit = (typeof ConfigUnit)[keyof typeof ConfigUnit];

/**
 * Một giá trị đã gắn nhãn/đơn vị/ghi chú — đơn vị hiển thị nhỏ nhất của mọi payload tool AI.
 * KHÔNG trả nguyên object DB.
 */
export interface ConfigItem {
  /** Đường dẫn field trong entity nguồn — dùng cho traceability, KHÔNG phải nguồn nghĩa. */
  key: string;
  /** Nhãn tiếng Việt — ĐÂY là nguồn nghĩa cho model. VD "Mệnh giá 1 line". */
  label: string;
  value: number | string | boolean;
  unit: ConfigUnit;
  /** Ghi chú nghiệp vụ khi giá trị dễ bị hiểu sai (snapshot, seed vs current, override…). */
  note?: string;
}

/** Helper dựng {@link ConfigItem} — tránh lặp shape ở descriptor/mapper của mọi tool. */
export function item(
  key: string,
  label: string,
  value: number | string | boolean,
  unit: ConfigUnit,
  note?: string,
): ConfigItem {
  return note === undefined ? { key, label, value, unit } : { key, label, value, unit, note };
}
