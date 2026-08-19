/**
 * AI Chat — registry map route (pathname) → gợi ý mở đầu theo trang đang xem.
 *
 * Dùng chung giữa AI Panel (Surface A) và trang `/ai` tương lai (p1-01) — KHÔNG đặt logic
 * panel-specific ở đây.
 *
 * Route + filters vẫn được đính cho model qua `clientContext` trong `prepareSend`, nhưng
 * KHÔNG hiển thị thành chip trong composer nữa (16/08: staff thấy dòng `/games/lotto535/...`
 * là nhiễu, không phải thông tin họ cần thao tác).
 *
 * ⚠️ BA TIÊU CHÍ BẮT BUỘC KHI THÊM/SỬA GỢI Ý (chốt 19/08 sau khi rà chi phí từng tool):
 *
 * 1. **Phải trả về trong MỘT lượt tra rẻ.** Gợi ý là câu ĐẦU TIÊN staff bấm — nó định nghĩa cảm
 *    nhận "Mira nhanh hay chậm". Chỉ dùng câu dẫn tới tool 1 query (`getFinancialByGame`,
 *    `getSystemOutstanding`, `getGameConfig`, `searchAuditLogs`, `getDrawDetail`). TUYỆT ĐỐI
 *    tránh câu dẫn tới `getDrawsOverview` (7 game × 3 = 21 query) hoặc `getPlayerInsight`
 *    (~9 query, riêng phần vé treo đã là 7 query trên 7 collection).
 * 2. **Phải đủ tham số để không bị hỏi lại.** Câu thiếu game/khoảng ngày làm Mira phải hỏi lại —
 *    staff bấm một nút rồi nhận về một câu hỏi là trải nghiệm tệ nhất của empty state. Với gợi ý
 *    theo route thì route đã cấp `gameKey`/`accountId` qua `clientContext`, nên câu không cần
 *    nhắc tên game.
 * 3. **Phải dạy một năng lực KHÔNG lấy được bằng cách nhìn trang.** Dashboard đã hiện outstanding
 *    và jackpot rất to; gợi ý hỏi lại đúng mấy số đó chỉ dạy staff "Mira đọc hộ cái tôi đang
 *    thấy". Ưu tiên thứ bị chôn sâu: số cấu hình (nằm trong 4-6 tab form mỗi game), lịch sử
 *    thao tác, so sánh nhiều ngày.
 *
 * ĐÃ BỎ (đừng đưa lại): "Hôm nay hệ thống có gì bất thường?" và "Có kỳ quay nào đang chờ settle
 * lâu không?". Cả hai là câu ĐIỀU TRA, không phải tra cứu: câu một kích hoạt skill điều tra rồi
 * quét cross-game + hạ tầng, câu hai gọi thẳng tool đắt nhất. Chúng vẫn là câu hỏi hợp lệ và Mira
 * trả lời tốt — chỉ không được làm gợi ý mở đầu.
 */

interface RouteContextEntry {
  suggestions: readonly string[];
}

/**
 * Bộ chung — dùng cho `/ai` và mọi route chưa khai báo riêng.
 *
 * Ba câu này phủ ba năng lực khác nhau (số liệu nhiều ngày · tiền đang treo · số cấu hình) thay vì
 * ba biến thể của cùng một việc, và mỗi câu đúng 1 query.
 */
const DEFAULT_SUGGESTIONS: readonly string[] = [
  // `getFinancialByGame` — 1 aggregate trên collection đã pre-aggregate. Dashboard chỉ có số HÔM
  // NAY, nên bảng 7 ngày × 7 game là thứ staff không lấy được bằng cách nhìn trang.
  "Doanh thu 7 ngày qua, chia theo từng game",
  // `getSystemOutstanding` — 1 query snapshot, KHÔNG tham số ⇒ không thể bị hỏi lại.
  "Tiền đang treo mỗi game bao nhiêu?",
  // `getGameConfig` — 1 query (còn qua cache). Giá trị cao nhất trong ba câu: số cấu hình bị chôn
  // trong nhiều tab form, tra tay phải điều hướng rồi đọc bảng; Mira trả một dòng.
  "Keno trả thưởng bao nhiêu cho chọn 5 trúng 5?",
];

/**
 * Khớp theo `pathname.startsWith(prefix)` — sắp theo thứ tự ưu tiên (DÀI → NGẮN), vì `find` lấy
 * match đầu tiên: prefix cụ thể phải đứng trước prefix bao trùm nó.
 */
const ROUTE_REGISTRY: ReadonlyArray<{
  prefix: string;
  entry: RouteContextEntry;
}> = [
  {
    prefix: "/reports/settle",
    entry: {
      // Cả ba đều 1 query: `getFinancialDailyOverview` (theo ngày) và `getFinancialByGame` (theo
      // game). Đã bỏ "Ngày nào tỷ lệ trả thưởng bất thường?" — câu điều tra, kéo theo nhiều lượt tra.
      suggestions: [
        "Tóm tắt tài chính 7 ngày gần nhất",
        "So sánh doanh thu 7 ngày qua theo game",
        "Lợi nhuận tháng này so với tháng trước",
      ],
    },
  },
  {
    prefix: "/reports/outstanding",
    entry: {
      suggestions: ["Tiền đang treo tập trung ở game nào?", "Vì sao game này còn treo nhiều?"],
    },
  },
  {
    prefix: "/accounts/players",
    entry: {
      // KHÔNG đặt câu hỏi tài chính người chơi ở đây: `getPlayerInsight` là ~9 query. Hai câu này
      // dùng `getPlayerAccountInfo` (1 query identity) và `searchAuditLogs` (1 query có index).
      suggestions: ["Tra hồ sơ người chơi theo username", "Ai vừa thao tác lên tài khoản này?"],
    },
  },
  {
    prefix: "/audit-logs",
    entry: {
      // `searchAuditLogs` — 1 query, đã có trần 31 ngày / lookback 90 ngày nên không sợ full-scan.
      suggestions: ["Ai sửa cấu hình game trong 24 giờ qua?", "Có thao tác nào thất bại hôm nay?"],
    },
  },
  {
    // Mọi trang trong `/games/<gameKey>/...`. Câu KHÔNG nhắc tên game — `clientContext.route` đã
    // cấp `gameKey`, nhắc lại chỉ làm gợi ý sai khi staff đang ở game khác.
    prefix: "/games/",
    entry: {
      // `getDrawDetail` (1-2 query) và `getGameConfig` (1 query). KHÔNG dùng `getDrawsOverview`.
      suggestions: [
        "Kỳ hiện tại của game này đang bán thế nào?",
        "Mệnh giá và hoa hồng hiện tại là bao nhiêu?",
        "Bảng giải của game này ra sao?",
      ],
    },
  },
];

/** Gợi ý mở đầu (`AiEmptyState`) — route lạ dùng bộ gợi ý chung. */
export function getRouteSuggestions(pathname: string): readonly string[] {
  return ROUTE_REGISTRY.find((route) => pathname.startsWith(route.prefix))?.entry.suggestions ?? DEFAULT_SUGGESTIONS;
}
