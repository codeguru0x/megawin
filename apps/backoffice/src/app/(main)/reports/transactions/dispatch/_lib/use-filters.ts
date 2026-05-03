"use client";

import { useQueryStates, parseAsString, parseAsStringLiteral } from "nuqs";
import { subDays } from "date-fns";
import { todayVN, formatVNDate, TZDate, VN_TIMEZONE } from "@megawin/shared/utils";
import { DispatchOrderStatus, DispatchSourceKind } from "@megawin/tenant-dispatch/entities";

/**
 * URL state cho trang "Lệnh gửi đại lý".
 *
 * 2 mode filter:
 * - **Identity lookup mode** (universal search): có 1 trong `tx` / `batchKey`
 *   / `accountId` / `username` → ignore date range + dimension filters.
 * - **Range mode**: `from` + `to` + filter tuỳ chọn (tenant/status/sourceKind).
 *
 * Thêm `detail` để mở drawer 1 order cụ thể.
 *
 * ## Rationale
 *
 * Các filter `gameId`, `retryMode`, `stuckMinRetry` đã **bỏ** khỏi UI:
 * - `gameId`: ít dùng độc lập, batchKey đã prefix gameId (VD `keno.settle...`).
 * - `retryMode`: thay bằng KPI click-to-filter (click "Cần chú ý" → stuck).
 * - `stuckMinRetry`: ops config, hardcode = RETRY_ALERT_THRESHOLD.
 *
 * Default range: today-7 → today.
 */

const STATUS_VALUES = Object.values(DispatchOrderStatus) as [
  DispatchOrderStatus,
  ...DispatchOrderStatus[],
];
const KIND_VALUES = Object.values(DispatchSourceKind) as [
  DispatchSourceKind,
  ...DispatchSourceKind[],
];
const RETRY_MODES = ["fresh", "retrying", "stuck"] as const;

export type DispatchRetryMode = (typeof RETRY_MODES)[number];

export function useDispatchFilters() {
  const today = todayVN();
  const sevenDaysAgo = formatVNDate(subDays(new TZDate(new Date(), VN_TIMEZONE), 6));

  const [state, setState] = useQueryStates(
    {
      // ── Identity lookup (universal search) ───────────────────────────────
      tx: parseAsString.withDefault(""),
      batchKey: parseAsString.withDefault(""),
      accountId: parseAsString.withDefault(""),
      username: parseAsString.withDefault(""),

      // ── Dimension filters ────────────────────────────────────────────────
      tenantId: parseAsString,
      status: parseAsStringLiteral(STATUS_VALUES),
      sourceKind: parseAsStringLiteral(KIND_VALUES),
      retryMode: parseAsStringLiteral(RETRY_MODES),

      // ── Range + detail ───────────────────────────────────────────────────
      from: parseAsString.withDefault(sevenDaysAgo),
      to: parseAsString.withDefault(today),
      detail: parseAsString.withDefault(""),
    },
    { history: "push", shallow: false },
  );

  /** True nếu có bất kỳ identity lookup active — các dimension filter bị bypass. */
  const isIdentityMode = !!(state.tx || state.batchKey || state.accountId || state.username);
  /** Legacy alias — giữ cho backward compat với các component chưa update. */
  const isTxMode = isIdentityMode;

  /**
   * Set identity lookup — đặt đúng 1 field (theo kind) và xoá 3 field còn lại
   * + xoá mọi dimension filter để URL sạch.
   */
  function setIdentity(
    kind: "tx" | "batchKey" | "accountId" | "username" | null,
    value: string,
  ) {
    const trimmed = value.trim();
    void setState({
      tx: kind === "tx" && trimmed ? trimmed : null,
      batchKey: kind === "batchKey" && trimmed ? trimmed : null,
      accountId: kind === "accountId" && trimmed ? trimmed : null,
      username: kind === "username" && trimmed ? trimmed.toLowerCase() : null,
      tenantId: null,
      status: null,
      sourceKind: null,
      retryMode: null,
      detail: null,
    });
  }

  /** Clear tất cả identity lookup fields. */
  function clearIdentity() {
    void setState({
      tx: null,
      batchKey: null,
      accountId: null,
      username: null,
      detail: null,
    });
  }

  function setRange(from: string, to: string) {
    void setState({
      from,
      to,
      tx: null,
      batchKey: null,
      accountId: null,
      username: null,
      detail: null,
    });
  }

  function setTenantId(tenantId: string | null) {
    void setState({ tenantId: tenantId || null, detail: null });
  }

  function setStatus(status: DispatchOrderStatus | null) {
    // Set status sẽ override retryMode (2 filter conflict semantically khi
    // KPI click — user click "Dispatched" → reset retryMode).
    void setState({ status, retryMode: null, detail: null });
  }

  function setSourceKind(sourceKind: DispatchSourceKind | null) {
    void setState({ sourceKind, detail: null });
  }

  function setRetryMode(retryMode: DispatchRetryMode | null) {
    // Retry mode mặc định chỉ match Pending orders (stuck/retrying/fresh đều
    // là sub-partition của Pending) → auto set status=pending khi user chọn.
    void setState({
      retryMode,
      status: retryMode ? DispatchOrderStatus.Pending : state.status,
      detail: null,
    });
  }

  function reset() {
    void setState({
      tx: null,
      batchKey: null,
      accountId: null,
      username: null,
      tenantId: null,
      status: null,
      sourceKind: null,
      retryMode: null,
      detail: null,
    });
  }

  function openDetail(tx: string) {
    void setState({ detail: tx || null }, { history: "push" });
  }

  function closeDetail() {
    void setState({ detail: null }, { history: "push" });
  }

  return {
    // Identity lookup
    tx: state.tx,
    batchKey: state.batchKey,
    accountId: state.accountId,
    username: state.username,
    isIdentityMode,
    isTxMode,
    setIdentity,
    clearIdentity,
    // Legacy alias — backward compat
    setTx: (tx: string) => setIdentity(tx ? "tx" : null, tx),

    // Dimension
    tenantId: state.tenantId,
    status: state.status,
    sourceKind: state.sourceKind,
    retryMode: state.retryMode,
    setTenantId,
    setStatus,
    setSourceKind,
    setRetryMode,

    // Range + detail
    from: state.from,
    to: state.to,
    detail: state.detail,
    setRange,
    reset,
    openDetail,
    closeDetail,
  };
}
