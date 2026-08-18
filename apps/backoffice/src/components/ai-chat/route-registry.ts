/**
 * AI Chat — registry map route (pathname) → gợi ý mở đầu theo trang đang xem.
 *
 * Dùng chung giữa AI Panel (Surface A) và trang `/ai` tương lai (p1-01) — KHÔNG đặt logic
 * panel-specific ở đây.
 *
 * Route + filters vẫn được đính cho model qua `clientContext` trong `prepareSend`, nhưng
 * KHÔNG hiển thị thành chip trong composer nữa (16/08: staff thấy dòng `/games/lotto535/...`
 * là nhiễu, không phải thông tin họ cần thao tác).
 */

interface RouteContextEntry {
  suggestions: readonly string[];
}

const DEFAULT_SUGGESTIONS: readonly string[] = [
  "Hôm nay hệ thống có gì bất thường?",
  "Tóm tắt tài chính 7 ngày gần nhất",
  "Có kỳ quay nào đang chờ settle lâu không?",
];

/** Khớp theo `pathname.startsWith(prefix)` — sắp theo thứ tự ưu tiên (dài → ngắn). */
const ROUTE_REGISTRY: ReadonlyArray<{
  prefix: string;
  entry: RouteContextEntry;
}> = [
  {
    prefix: "/reports/settle",
    entry: {
      suggestions: ["Tóm tắt tài chính 7 ngày", "Ngày nào tỷ lệ trả thưởng bất thường?", "So sánh doanh thu theo game"],
    },
  },
];

/** Gợi ý mở đầu (`AiEmptyState`) — route lạ dùng bộ gợi ý chung. */
export function getRouteSuggestions(pathname: string): readonly string[] {
  return ROUTE_REGISTRY.find((route) => pathname.startsWith(route.prefix))?.entry.suggestions ?? DEFAULT_SUGGESTIONS;
}
