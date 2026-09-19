/**
 * Tone màu dùng chung cho mọi status badge (Draw/Ticket/Entry) trên 7 game.
 *
 * Định nghĩa MỘT LẦN — 17 file status-badge.tsx dẫn tới đây thay vì viết tay
 * `bg-{color}-100 text-{color}-700 dark:...` lặp lại. Giữ NGUYÊN status key/label
 * riêng từng game (khác biệt nghiệp vụ thật, không phải trùng lặp cần gộp).
 *
 * Giá trị dưới đây là LITERAL HIỆN TẠI copy nguyên từ code cũ (audit 19/09/2026) —
 * CHƯA đổi sang token semantic (`profit`/`warning`/`info`/`destructive`). Việc đổi
 * sang token là bước riêng ở track VISUAL (`p1-02-status-badge-unification.md`).
 *
 * Tone nhiều hơn 5 placeholder trong plan vì audit thấy green ≠ emerald, purple,
 * amber, orange-800/50 là literal riêng — gộp cưỡng ép sẽ đổi pixel.
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

const TONE_CLASS: Record<StatusBadgeTone, string> = {
  neutral: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  positive: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
  success: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300",
  warning: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300",
  progress: "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300",
  caution: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300",
  awaitResettle: "bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-300",
  published: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300",
  negative: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
  info: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
};

/** Class cho badge tone, kèm `animate-pulse` khi trạng thái đang diễn ra (drawing, settling...). */
export function statusBadgeToneClass(tone: StatusBadgeTone, pulse = false): string {
  return pulse ? `${TONE_CLASS[tone]} animate-pulse` : TONE_CLASS[tone];
}
