"use client";

import { useQueryStates, parseAsString, parseAsStringLiteral } from "nuqs";
import { subDays } from "date-fns";
import { todayVN, formatVNDate, TZDate, VN_TIMEZONE } from "@megawin/shared/utils";
import { TxLogStatus, TxLogEventType } from "@megawin/tenant-gateway/entities";

/**
 * URL state cho trang Nhật ký giao dịch (transactions/api-logs).
 *
 * 2 mode filter:
 * - **By tx**: chỉ có `tx` → ignore date range + status + eventType.
 * - **By range**: `from` + `to` + `status` + `eventType` (tất cả optional trừ from/to).
 *
 * Thêm state `detail` để mở drawer 1 log cụ thể, không ảnh hưởng list params.
 *
 * Default range: today-7 → today (7 ngày gần nhất). Tất cả trong phạm vi
 * retention 90 ngày, max 31 ngày/query (enforce ở server).
 */

const STATUS_VALUES = [TxLogStatus.Success, TxLogStatus.Failed] as const;
const EVENT_TYPE_VALUES = [TxLogEventType.Transaction, TxLogEventType.BatchTransaction] as const;

export function useTxLogFilters() {
  const today = todayVN();
  const sevenDaysAgo = formatVNDate(subDays(new TZDate(new Date(), VN_TIMEZONE), 6));

  const [state, setState] = useQueryStates(
    {
      tx: parseAsString.withDefault(""),
      from: parseAsString.withDefault(sevenDaysAgo),
      to: parseAsString.withDefault(today),
      status: parseAsStringLiteral(STATUS_VALUES),
      eventType: parseAsStringLiteral(EVENT_TYPE_VALUES),
      detail: parseAsString.withDefault(""),
    },
    { history: "push", shallow: false },
  );

  const isTxMode = !!state.tx;

  /** Set `tx` — clear các field khác để tránh URL dirty. */
  function setTx(tx: string) {
    const trimmed = tx.trim();
    void setState({
      tx: trimmed || null,
      status: null,
      eventType: null,
      detail: null,
    });
  }

  function setRange(from: string, to: string) {
    void setState({ from, to, tx: null, detail: null });
  }

  function setStatus(status: TxLogStatus | null) {
    void setState({ status, detail: null });
  }

  function setEventType(eventType: TxLogEventType | null) {
    void setState({ eventType, detail: null });
  }

  function openDetail(tx: string) {
    void setState({ detail: tx || null }, { history: "push" });
  }

  function closeDetail() {
    void setState({ detail: null }, { history: "push" });
  }

  return {
    tx: state.tx,
    from: state.from,
    to: state.to,
    status: state.status,
    eventType: state.eventType,
    detail: state.detail,
    isTxMode,
    setTx,
    setRange,
    setStatus,
    setEventType,
    openDetail,
    closeDetail,
  };
}
