"use client";

import { useQueryState, parseAsString } from "nuqs";
import { getFinancialDate } from "@megawin/shared/utils/financial-date";
import { subDays, format } from "date-fns";

/**
 * Tính ngày tài chính hôm nay (YYYY-MM-DD) — 11:00 VN cutoff.
 * Dùng làm default value cho financialDate filter.
 */
function todayFinancialDate(): string {
  return getFinancialDate(new Date());
}

/**
 * Quản lý financialDate filter cho dashboard qua URL query string.
 *
 * `fd` persist trên URL — hard refresh vẫn xem đúng ngày đã chọn.
 * Default = ngày tài chính hôm nay (partial data nhưng ưu tiên thông tin hiện tại).
 *
 * Trend % chỉ hiển thị khi fd < todayFd (ngày đã đóng, dữ liệu hoàn chỉnh).
 * compareDate = fd - 7 ngày (cùng thứ tuần trước).
 */
export function useDashboardFilters() {
  const todayFd = todayFinancialDate();

  const [fd, setFd] = useQueryState("fd", parseAsString.withDefault(todayFd));

  // Ngày đã đóng = trước hôm nay → hiển thị trend %
  const isClosedDay = fd < todayFd;

  // So sánh với cùng thứ tuần trước — chỉ khi ngày đã đóng
  const compareDate = isClosedDay
    ? format(subDays(new Date(fd + "T12:00:00"), 7), "yyyy-MM-dd")
    : undefined;

  return {
    fd,
    setFd,
    todayFd,
    isClosedDay,
    compareDate,
  };
}
