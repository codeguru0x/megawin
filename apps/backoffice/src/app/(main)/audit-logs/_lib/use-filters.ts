"use client";

import { useQueryStates, parseAsInteger, parseAsString, parseAsStringLiteral } from "nuqs";
import { subDays } from "date-fns";
import { todayVN, formatVNDate, TZDate, VN_TIMEZONE } from "@megawin/shared/utils";
import {
  AuditActorType,
  AuditCategory,
  AuditStatus,
  AuditTargetType,
} from "@megawin/audit/entities";

/**
 * URL state cho trang "Lịch sử thao tác" (audit-logs).
 *
 * Toàn bộ filter đẩy vào URL (`history: "push"`, `shallow: false`) → share được
 * link đã lọc, back/forward hoạt động. Đổi bất kỳ filter nào → reset về trang đầu.
 *
 * Pagination Prev/Next — chỉ giữ **cursor trang hiện tại** trong URL (không stack):
 * - `cursor` — token opaque (base64url) của trang đang xem; rỗng = trang đầu.
 * - `page` — số trang (1-based) chỉ để hiển thị "Trang N", KHÔNG dùng cho query.
 * - Next: `setState({ cursor: nextCursor, page: page + 1 })` → push history mới.
 * - Prev: `window.history.back()` → trình duyệt lùi về URL trang trước (cursor +
 *   page cũ). React Query cache render tức thì, không refetch.
 *
 * Vì mỗi Next là 1 history entry, nút "Trước" = back đúng ngữ nghĩa cursor trước
 * đó mà không cần lưu cả stack → URL luôn gọn (1 cursor duy nhất).
 *
 * Thêm state `detail` (audit record id) để mở drawer chi tiết mà không đụng list
 * params.
 *
 * Default range: today-6 → today (7 ngày gần nhất) — nằm trong retention 90 ngày,
 * cap 31 ngày/query (enforce ở server).
 */

const ACTOR_TYPE_VALUES = Object.values(AuditActorType) as [AuditActorType, ...AuditActorType[]];
const CATEGORY_VALUES = Object.values(AuditCategory) as [AuditCategory, ...AuditCategory[]];
const STATUS_VALUES = Object.values(AuditStatus) as [AuditStatus, ...AuditStatus[]];
const TARGET_TYPE_VALUES = Object.values(AuditTargetType) as [
  AuditTargetType,
  ...AuditTargetType[],
];

/** Reset về trang đầu — dùng chung khi đổi bất kỳ filter nào. */
const RESET_PAGE = { cursor: null, page: null, detail: null } as const;

export function useAuditLogFilters() {
  const today = todayVN();
  const sevenDaysAgo = formatVNDate(subDays(new TZDate(new Date(), VN_TIMEZONE), 6));

  const [state, setState] = useQueryStates(
    {
      from: parseAsString.withDefault(sevenDaysAgo),
      to: parseAsString.withDefault(today),
      actor: parseAsString.withDefault(""),
      actorType: parseAsStringLiteral(ACTOR_TYPE_VALUES),
      game: parseAsString.withDefault(""),
      category: parseAsStringLiteral(CATEGORY_VALUES),
      action: parseAsString.withDefault(""),
      targetType: parseAsStringLiteral(TARGET_TYPE_VALUES),
      targetId: parseAsString.withDefault(""),
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

  function setActor(actor: string) {
    void setState({ actor: actor.trim() || null, ...RESET_PAGE });
  }

  function setActorType(actorType: AuditActorType | null) {
    void setState({ actorType, ...RESET_PAGE });
  }

  function setGame(game: string) {
    void setState({ game: game || null, ...RESET_PAGE });
  }

  /** Đổi category → clear action (action phụ thuộc category). */
  function setCategory(category: AuditCategory | null) {
    void setState({ category, action: null, ...RESET_PAGE });
  }

  function setAction(action: string) {
    void setState({ action: action || null, ...RESET_PAGE });
  }

  function setTargetType(targetType: AuditTargetType | null) {
    void setState({ targetType, ...RESET_PAGE });
  }

  function setTargetId(targetId: string) {
    void setState({ targetId: targetId.trim() || null, ...RESET_PAGE });
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
    void setState({
      actor: null,
      actorType: null,
      game: null,
      category: null,
      action: null,
      targetType: null,
      targetId: null,
      status: null,
      ...RESET_PAGE,
    });
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
    actor: state.actor,
    actorType: state.actorType,
    game: state.game,
    category: state.category,
    action: state.action,
    targetType: state.targetType,
    targetId: state.targetId,
    status: state.status,
    cursor: state.cursor,
    page: state.page,
    detail: state.detail,
    setRange,
    setActor,
    setActorType,
    setGame,
    setCategory,
    setAction,
    setTargetType,
    setTargetId,
    setStatus,
    goNext,
    goPrev,
    resetFilters,
    openDetail,
    closeDetail,
  };
}
