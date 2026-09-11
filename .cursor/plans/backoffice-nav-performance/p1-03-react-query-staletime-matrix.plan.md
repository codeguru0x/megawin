# p1-03 — Chuẩn hoá & audit ma trận `staleTime` theo use-case

> **Phase:** P1 · **Status:** ⏳ pending · **Phụ thuộc:** không (làm song song `p1-01`/`p1-02`
> được), nhưng nên **xong trước hoặc cùng lúc** `p1-02` vì `p1-02` cần đọc đúng `staleTime` hiện có
> để prefetch không phá tính "tươi" của dữ liệu (xem `p1-02` §4).
> **Rủi ro dữ liệu:** 🟡 Trung — đây là plan duy nhất trong `p1-*` có thể **sửa** giá trị `staleTime`
> thật, không chỉ thêm cơ chế mới. Đọc kỹ §5 "Nguyên tắc không nới lỏng" trước khi sửa bất kỳ số nào.

## 1. Phát hiện quan trọng — codebase ĐÃ có chiến lược `staleTime` khá tốt, đây là AUDIT không phải viết lại

Grep toàn bộ `staleTime` trong `apps/backoffice/src` (10/09/2026) cho thấy team đã tự phát triển
convention khá nhất quán theo loại màn hình — **không phải** tình trạng "mỗi nơi tự bịa số" như có
thể giả định trước khi đọc code. Plan này **không viết lại từ đầu** — chỉ:

1. Document lại ma trận đã có thành 1 nguồn tham chiếu chính thức (hiện rải trong ~25 file).
2. Audit và sửa **đúng 1 điểm lệch cụ thể đã tìm thấy** (§3).
3. Bổ sung comment JSDoc cho vài nơi thiếu giải trình "vì sao số này" (theo
   `code-quality-standards.mdc` §2-3 — mọi field/số đặc biệt phải có JSDoc/comment giải thích).

## 2. Ma trận `staleTime` hiện có (document lại — nguồn: đọc trực tiếp code 10/09/2026)

| Loại màn hình | `staleTime` | `refetchInterval` | Ví dụ | Đúng thiết kế? |
|---|---|---|---|---|
| **Live poll — Ops Hub** (snapshot toàn cảnh, nhiều kỳ) | `pollSeconds × 1000` (server trả, fallback `DEFAULT_POLL_SECONDS`) | = `staleTime` | `use-hub-query.ts` (keno + bingo18) | ✅ Đúng — cặp `refetchOnWindowFocus: true` + `staleTime = pollSeconds` là 1 cặp không tách (đã có JSDoc giải thích) |
| **Live poll — Operations summary** (KPI 1 kỳ đang mở) | `30_000` (cố định, không theo `pollSeconds`) | `30_000` | 7 game `use-operations.ts` (dòng ~60-70) | ✅ Hợp lý — summary không cần nhanh hơn 30s |
| **Live feed — ticket/bet stream 1 kỳ đang mở** | `pollMs × 0.8` (derive từ `pollSeconds` server, fallback `LIVE_FEED_FALLBACK_MS`) | `pollMs` | keno, lotto535, mega645, power655 | ✅ Đúng — `× 0.8` để staleTime luôn ngắn hơn refetchInterval 1 chút, tránh race dedupe |
| **Live feed — cùng chức năng nhưng khác game** | `8_000` / `25_000` **hardcoded**, `refetchInterval: enabled ? 10_000/30_000 : false` | cố định | bingo18 (`8_000`/`10_000`), max3d/max3dpro (`25_000`/`30_000`) | ⚠️ **LỆCH** — xem §3, không derive theo `pollSeconds` server như 4 game còn lại |
| **Đã settled (kỳ đóng, dữ liệu không đổi nữa)** | `Infinity` | `false`/tắt | tất cả 7 game (`isSettled ? Infinity : ...`) | ✅ Đúng — 0 request cho dữ liệu không bao giờ đổi |
| **Danh sách/lịch sử ít đổi trong session** (draws list, jackpot) | `60_000` – `5×60_000` | không poll hoặc poll dài | jackpot 3 game, draws list, `use-tenant-options.ts` | ✅ Hợp lý |
| **Dashboard KPI hôm nay** (partial, đổi liên tục khi settle) | `60_000` | `120_000` | `useDashboardKpis` | ✅ Đúng — đã có JSDoc giải thích |
| **Dashboard live strip** (jackpot/draws/outstanding cross-game) | `0` (luôn coi stale) | `30_000` | `useDashboardJackpots/Draws/Outstanding` | ✅ Đúng — outstanding/tiền treo không được cache "tươi giả" |
| **Outstanding theo account** (tiền treo 1 player) | `0` | — | `accounts/players/[accountId]/_shared/queries.ts` | ✅ Đúng, có JSDoc giải thích rõ lý do |
| **Audit log / activity / api-logs / dispatch / workers / resultfeed** | `10_000`–`15_000` | tuỳ trang | `audit-logs`, `me/activity`, `reports/transactions/**`, `system/workers`, `resultfeed` | ✅ Hợp lý cho màn theo dõi, không phải tiền trực tiếp |
| **Danh mục tenant dropdown** (`use-tenant-options.ts`) | `60_000` | không poll | filter component dùng chung | ✅ Hợp lý |

## 3. Điểm lệch tìm thấy — live feed 3/7 game không derive theo `pollSeconds` server

**Bằng chứng (đọc trực tiếp code):**

```typescript
// keno, lotto535, mega645, power655 — ĐÚNG pattern, đọc pollSeconds thật từ server
const pollMs = pollSeconds ? pollSeconds * 1000 : LIVE_FEED_FALLBACK_MS;
// ...
refetchInterval: isSettled ? false : pollMs,
staleTime: isSettled ? Infinity : pollMs * 0.8,
```

```typescript
// bingo18/_lib/use-operations.ts dòng 217-218 — hardcode, KHÔNG đọc pollSeconds
refetchInterval: enabled ? 10_000 : false,
staleTime: 8_000,

// max3d/_lib/use-operations.ts dòng 259-260, max3dpro dòng 262-263 — tương tự, hardcode 30_000/25_000
refetchInterval: enabled ? 30_000 : false,
staleTime: 25_000,
```

**Vì sao đây là lệch cần sửa (không phải "để vậy cũng được"):** nếu vận hành đổi `pollSeconds` cấu
hình cho Bingo18/Max3D/Max3DPro ở tầng server (ví dụ do tải cao, cần giảm tần suất), 4 game
kia sẽ tự thích nghi (đọc `pollSeconds` mới), còn 3 game này **vẫn cố định** — tick UI không khớp
thực tế server, có thể lệch (hardcode NHANH hơn server cho phép → gọi API thừa; hoặc CHẬM hơn →
staff thấy dữ liệu cũ hơn server đã có).

**Việc phải làm:** đổi 3 game (bingo18, max3d, max3dpro) sang cùng pattern đọc `pollSeconds` từ
response, dùng chung `LIVE_FEED_FALLBACK_MS` (kiểm tra hằng số này đã tồn tại ở đâu — nếu mỗi game tự
khai riêng, gộp về 1 nơi chung theo §5 `code-quality-standards.mdc`, tránh 4 bản hằng số trùng ý
nghĩa).

**Đây là SIẾT chặt/CHUẨN HOÁ, không phải nới lỏng** — tick vẫn đúng tick, chỉ đổi từ "đoán cố định"
sang "đọc giá trị thật server báo", đúng nguyên tắc §3 mục 3 của `00-overview.md`.

## 4. Bổ sung JSDoc còn thiếu

Theo `code-quality-standards.mdc` §2, field/số đặc biệt phải có JSDoc giải thích "vì sao số này".
Rà lại danh sách grep ở §2 — hầu hết đã có comment (`use-hub-query.ts`, `use-dashboard-queries.ts`,
`queries.ts` outstanding), nhưng vài nơi số trần không giải thích:

- `audit-logs/_lib/use-queries.ts:43`, `me/activity/_lib/use-queries.ts:36`,
  `reports/transactions/api-logs/_lib/use-queries.ts` (3 chỗ `10_000`) — thêm 1 dòng comment ngắn:
  lý do 10s (màn theo dõi log, không cần nhanh hơn nhịp người đọc).
- `reports/transactions/dispatch/_lib/use-queries.ts:185` — đã có comment giải thích 60s cho tenant
  list, giữ nguyên, dùng làm mẫu cho các file thiếu comment ở trên.

**Không đổi giá trị** ở bước này — chỉ thêm comment, rủi ro = 0.

## 5. Nguyên tắc không nới lỏng — nhắc lại (§3 mục 3 `00-overview.md`)

Với ĐÚNG duy nhất thay đổi giá trị thật ở plan này (§3 — bingo18/max3d/max3dpro), review PHẢI:

1. Lấy giá trị `pollSeconds` **mặc định thật** đang cấu hình server cho 3 game này (đọc use-case
   backend tương ứng, KHÔNG đoán) — đảm bảo sau khi đổi sang derive, hành vi runtime ở cấu hình
   HIỆN TẠI **giống hệt** hardcode cũ (nếu server đang trả đúng 10s cho bingo18, đổi code không được
   làm staleTime lệch khỏi 8000ms ở THỜI ĐIỂM audit — chỉ khác ở khả năng thích nghi tương lai).
2. Nếu phát hiện `pollSeconds` server thật ≠ giá trị hardcode hiện tại (ví dụ server đã đổi từ lâu mà
   code chưa theo) → đây là **bug ẩn đang chạy sai**, phải báo cáo riêng trong PR, không âm thầm sửa
   luôn — theo nguyên tắc code tài chính/vận hành đọc bằng mắt, không suy đoán
   (`gitnexus-code-graph.mdc` §4).

## 6. Test/Review

1. Đọc use-case backend trả `pollSeconds` cho bingo18/max3d/max3dpro (grep `pollSeconds` trong
   `packages/game-{bingo18,max3d,max3dpro}-application`) — ghi lại giá trị thật vào PR description.
2. Sửa `use-operations.ts` 3 game theo pattern §3, dùng chung `LIVE_FEED_FALLBACK_MS`.
3. `pnpm --filter @megawin/backoffice check-types` xanh.
4. Test tay: mở trang operations 1 kỳ đang mở của mỗi 3 game, Network tab xác nhận nhịp poll thật
   (khoảng cách giữa 2 request) **khớp** với `pollSeconds` server trả — so với hành vi TRƯỚC khi sửa
   (chụp Network tab trước/sau, phải giống nhau nếu server chưa đổi `pollSeconds`).
5. Thêm JSDoc theo §4 — không cần test runtime (chỉ đổi comment).
6. `pnpm lint` xanh.
7. Document ma trận §2 vào cuối `docs/analytics/backoffice-navigation-performance.md` (thêm mục mới
   "Ma trận staleTime — chốt sau p1-03", hoặc file riêng nếu bảng quá dài — quyết định lúc viết PR).

## 7. Rủi ro

| Rủi ro | Mức | Giảm thiểu |
|---|---|---|
| Đổi hardcode → derive làm lệch tick NGAY tại thời điểm merge nếu `pollSeconds` server thật khác hardcode | 🟡 | Bước §6.1 bắt buộc đọc backend trước, so sánh, báo cáo nếu lệch — không tự sửa im lặng |
| Gộp `LIVE_FEED_FALLBACK_MS` về 1 hằng số chung có thể đổi giá trị cho game khác nếu copy sai | 🟢 | Đặt hằng số ở `game-core` hoặc giữ riêng từng game nếu giá trị fallback khác nhau theo game — xác nhận từng game có fallback khác nhau hay giống nhau trước khi gộp |

## 8. Rollback

Revert 3 file `use-operations.ts` (bingo18/max3d/max3dpro) về hardcode cũ. Việc thêm JSDoc (§4) và
document ma trận (§2) không cần rollback — vô hại nếu giữ lại.
