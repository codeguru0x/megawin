/**
 * Mirror `HUB_GATE_TAB_*` từ queue-types — tránh hardcode label tiếng Việt rải trong spec.
 *
 * PHẢI khớp
 * `apps/backoffice/src/app/(main)/games/keno/operations-hub/_lib/sections/queue/queue-types.ts`.
 */

export const HubGateTab = {
  PendingOpen: "pending_open",
  Ended: "ended",
  AwaitingResult: "awaiting_result",
  AwaitingSettle: "awaiting_settle",
  All: "all",
} as const;
export type HubGateTab = (typeof HubGateTab)[keyof typeof HubGateTab];

export const HUB_GATE_TAB_ORDER: readonly HubGateTab[] = [
  HubGateTab.PendingOpen,
  HubGateTab.Ended,
  HubGateTab.AwaitingResult,
  HubGateTab.AwaitingSettle,
  HubGateTab.All,
];

export const HUB_GATE_TAB_LABELS: Record<HubGateTab, string> = {
  [HubGateTab.PendingOpen]: "Chờ mở bán",
  [HubGateTab.Ended]: "Chờ đóng bán",
  [HubGateTab.AwaitingResult]: "Chưa có KQ",
  [HubGateTab.AwaitingSettle]: "Chờ kết sổ",
  [HubGateTab.All]: "Tất cả",
};

/**
 * `DrawIdLabel` mode compact hiện `#NNN · DD/MM` (không phải drawId đầy đủ).
 * Sentinel fixture `2999-01-15.00N` → `#00N` + badge `15/01`.
 */
export const FIXTURE_DRAW_LABEL_BY_GATE: Record<Exclude<HubGateTab, "all">, string> = {
  [HubGateTab.PendingOpen]: "#004",
  [HubGateTab.Ended]: "#003",
  [HubGateTab.AwaitingResult]: "#002",
  [HubGateTab.AwaitingSettle]: "#001",
};

/** Kỳ đang bán (Zone 5B) — chứng minh mock khi tab không chứa full drawId. */
export const FIXTURE_SELLING_LABEL = "#005";

/** Nút bulk — label gốc; UI append ` (N)`. */
export const PRIMARY_ACTION_BY_GATE: Record<Exclude<HubGateTab, "all">, string> = {
  [HubGateTab.PendingOpen]: "Mở bán",
  [HubGateTab.Ended]: "Đóng bán",
  [HubGateTab.AwaitingResult]: "Công bố kết quả",
  [HubGateTab.AwaitingSettle]: "Kết sổ",
};

/**
 * `aria-label` trên production (landmark) — test dùng `getByRole("region", { name })`.
 * Khớp `hub-queue-table` / `hub-bulk-action-bar` (Keno + Bingo18).
 */
export const HUB_QUEUE_REGION = "Hàng chờ kỳ quay";
export const HUB_BULK_BAR_REGION = "Thao tác hàng loạt";
