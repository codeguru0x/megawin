/**
 * Tone màu dùng chung cho mọi status badge (Draw/Ticket/Entry) trên 7 game.
 *
 * Định nghĩa MỘT LẦN — 17 file status-badge.tsx dẫn tới đây thay vì viết tay
 * `bg-{color}-100 text-{color}-700 dark:...` lặp lại. Giữ NGUYÊN status key/label
 * riêng từng game (khác biệt nghiệp vụ thật, không phải trùng lặp cần gộp).
 *
 * Rollout P1-02 (visual) đã hoàn tất 19/09/2026 — cả 17 call site đã chuyển sang
 * token semantic và được duyệt ảnh before/after (xem `p1-02-status-badge-unification.md`).
 * Map `TONE_CLASS_LEGACY` (literal cũ) + param `useSemantic` dùng trong lúc rollout
 * dần theo game đã được xoá ở bước dọn code cuối — chỉ còn 1 map duy nhất dưới đây.
 *
 * Mapping tone → token (đã hỏi ý kiến user 19/09/2026, chọn "extend-tokens" —
 * thêm 4 token mới `status-active/pending/progress/published` vào globals.css
 * thay vì gộp ép vào 4 token financial cũ, để giữ đủ 9 sắc thái phân biệt
 * được bằng màu — gộp ép sẽ làm 2 status khác nghĩa hiện cùng 1 màu):
 * - neutral → muted (slate ~ muted, khớp gần nguyên bản)
 * - positive (green: salesOpen/paid) → status-active (token MỚI — tách khỏi
 *   success/emerald để "đang diễn ra" và "đã hoàn tất" không cùng màu)
 * - success (emerald: settled/completed) → profit (khớp chính xác, đã dùng
 *   cho "tích cực hoàn tất" toàn app)
 * - warning (yellow: salesClosed/pending) → status-pending (token MỚI —
 *   tách khỏi warning/amber để không lẫn với caution)
 * - progress (orange: settling/refunded) → status-progress (token MỚI)
 * - caution (amber: partial) → warning (khớp chính xác, amber có sẵn)
 * - awaitResettle (orange-800/50 overlay, đậm hơn progress) → status-progress
 *   nhưng dùng foreground đậm hơn qua `/25` opacity riêng (xem TONE_CLASS_
 *   SEMANTIC.awaitResettle) — vẫn cùng hue orange, chỉ khác độ đậm để phân
 *   biệt "đang kết sổ" (progress) với "chờ kết sổ lại" (awaitResettle).
 * - published (purple: drawn) → status-published (token MỚI)
 * - negative (red: void/cancelled) → destructive (khớp chính xác)
 * - info (blue: drawing/active) → info (khớp chính xác)
 */

export const StatusBadgeTone = {
  /** slate — scheduled / draft / chờ */
  Neutral: "neutral",
  /** green — salesOpen / paid */
  Positive: "positive",
  /** emerald — settled / completed */
  Success: "success",
  /** yellow — salesClosed / pending */
  Warning: "warning",
  /** orange-700 — settling / refunded */
  Progress: "progress",
  /** amber — partial (Power655 ticket) */
  Caution: "caution",
  /** orange-800/50 — awaiting resettle overlay */
  AwaitResettle: "awaitResettle",
  /** purple — published / drawn */
  Published: "published",
  /** red — void / cancelled */
  Negative: "negative",
  /** blue — drawing / active */
  Info: "info",
} as const;
export type StatusBadgeTone = (typeof StatusBadgeTone)[keyof typeof StatusBadgeTone];

/** Token semantic (P1-02) — xem mapping tone → token ở JSDoc đầu file. */
const TONE_CLASS: Record<StatusBadgeTone, string> = {
  neutral: "bg-muted text-muted-foreground",
  positive: "bg-status-active/15 text-status-active dark:bg-status-active/25",
  success: "bg-profit/15 text-profit dark:bg-profit/25",
  warning: "bg-status-pending/15 text-status-pending dark:bg-status-pending/25",
  progress: "bg-status-progress/15 text-status-progress dark:bg-status-progress/25",
  caution: "bg-warning/15 text-warning dark:bg-warning/25",
  awaitResettle: "bg-status-progress/25 text-status-progress dark:bg-status-progress/35",
  published: "bg-status-published/15 text-status-published dark:bg-status-published/25",
  negative: "bg-destructive/15 text-destructive dark:bg-destructive/25",
  info: "bg-info/15 text-info dark:bg-info/25",
};

/** Class cho badge tone, kèm `animate-pulse` khi trạng thái đang diễn ra (drawing, settling...). */
export function statusBadgeToneClass(tone: StatusBadgeTone, pulse = false): string {
  const base = TONE_CLASS[tone];
  return pulse ? `${base} animate-pulse` : base;
}
