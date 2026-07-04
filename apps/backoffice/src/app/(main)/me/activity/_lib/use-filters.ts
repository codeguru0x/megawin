"use client";

import { useQueryStates, parseAsInteger, parseAsString, parseAsStringLiteral } from "nuqs";
import { subDays } from "date-fns";
import { todayVN, formatVNDate, TZDate, VN_TIMEZONE } from "@megawin/shared/utils";
import { AuditStatus, SELF_ACTIVITY_ACTIONS } from "@megawin/audit/entities";

/**
 * URL state cho trang "Nhật ký của tôi" (`/me/activity`) — nhật ký BẢO MẬT cá nhân.
 *
 * CHỈ giữ filter có ý nghĩa cho security activity: date range, loại action
 * (whitelist trong `SELF_ACTIVITY_ACTIONS` — auth/account), kết quả. BỎ
 * actor/game/category/target vì view self-scoped và chỉ gồm nhóm action security.
 *
 * Cơ chế URL giữ nguyên: filter đẩy vào URL (`history: "push"`, `shallow: false`)
 * → share link, back/forward chạy đúng; đổi filter → reset trang đầu. Pagination
 * Prev/Next chỉ giữ cursor trang hiện tại (không stack). `detail` mở drawer chi
 * tiết mà không đụng list params.
 *
 * Default range: today-6 → today (7 ngày gần nhất) — trong retention 90 ngày,
 * cap 31 ngày/query (enforce ở server).
 */

const STATUS_VALUES = Object.values(AuditStatus) as [AuditStatus, ...AuditStatus[]];
const ACTION_VALUES = SELF_ACTIVITY_ACTIONS as readonly [string, ...string[]];

/** Reset về trang đầu — dùng chung khi đổi bất kỳ filter nào. */
const RESET_PAGE = { cursor: null, page: null, detail: null } as const;

export function useMyActivityFilters() {
  const today = todayVN();
  const sevenDaysAgo = formatVNDate(subDays(new TZDate(new Date(), VN_TIMEZONE), 6));

  const [state, setState] = useQueryStates(
    {
      from: parseAsString.withDefault(sevenDaysAgo),
      to: parseAsString.withDefault(today),
      action: parseAsStringLiteral(ACTION_VALUES),
      status: parseAsStringLiteral(STATUS_VALUES),
      cursor: parseAsString.withDefault(""),
      page: parseAsInteger.withDefault(1),
      detail: parseAsString.withDefault(""),
    },
    { history: "push", shallow: false },
  );

  function setRange(from: string, to: string) {
    void setState({ from, to, ...RESET_PAGE });
  }

  function setAction(action: string) {
    void setState({ action: action || null, ...RESET_PAGE });
  }

  function setStatus(status: AuditStatus | null) {
    void setState({ status, ...RESET_PAGE });
  }

  /**
   * Sang trang kế: set `cursor` = `nextCursor` trang hiện tại, tăng `page`.
   * Push history mới → nút "Trước" back về đúng cursor trước đó.
   */
  function goNext(next: string) {
    void setState({ cursor: next, page: state.page + 1, detail: null });
  }

  /** Về trang trước: lùi history → URL trang trước (cursor + page cũ) tự khôi phục. */
  function goPrev() {
    window.history.back();
  }

  /** Reset toàn bộ filter về mặc định (giữ nguyên range mặc định 7 ngày). */
  function resetFilters() {
    void setState({ action: null, status: null, ...RESET_PAGE });
  }

  function openDetail(id: string) {
    void setState({ detail: id || null }, { history: "push" });
  }

  function closeDetail() {
    void setState({ detail: null }, { history: "push" });
  }

  return {
    from: state.from,
    to: state.to,
    action: state.action,
    status: state.status,
    cursor: state.cursor,
    page: state.page,
    detail: state.detail,
    setRange,
    setAction,
    setStatus,
    goNext,
    goPrev,
    resetFilters,
    openDetail,
    closeDetail,
  };
}
