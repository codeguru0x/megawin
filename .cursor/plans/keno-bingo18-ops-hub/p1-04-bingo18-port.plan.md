---
name: ""
overview: ""
todos: []
isProject: false
---

# p1-04 — Port toàn bộ Ops Hub sang Bingo18 (viết lại toàn diện 09/09)

> **Phase:** P1 · **Status:** 🔨 sẵn sàng code (viết lại theo trạng thái Hub Keno THẬT SAU p1-05→p1-10)
> **Scope:** `packages/game-bingo18`, `packages/game-bingo18-application`,
> `apps/backoffice/src/app/(main)/games/bingo18/operations-hub/`, `apps/backoffice/src/app/api/bingo18/`
> **Phạm vi loại trừ:** KHÔNG làm P2 (Auto-Pilot — `p2-01`…`p2-05`). Bản này chỉ port đủ để Bingo18 có
> đúng những gì Keno Hub đang có ở P1 (P0 tương đương coi là hạ tầng bắt buộc đi kèm, không tách rời).

## 0. Bản này khác bản trước ở đâu — vì sao viết lại lần 2

Bản trước (giữ ở lịch sử git) viết xong lúc Keno Hub mới có p0-03/p0-04/p1-01/p1-02/p1-03 — tức bản
**Day Flow Stepper + Focus Rail tách rời + KPI 4 card đếm việc + 3 bulk action + chưa có nhập KQ trong
Hub**. Từ đó tới nay Keno Hub đã qua **6 vòng chỉnh sửa thật** (`p1-05` redesign toàn diện → `p1-06`
nhập kết quả tuần tự → `p1-07` polish vòng 2 → `p1-08` đổi tab → `p1-09` redesign expand panel + KPI hoa
hồng → `p1-10` nhập KQ ngay trong Hub), sửa **hơn 15 bug thật** tìm thấy qua test UI, không phải qua đọc
code tĩnh. Port theo bản cũ = port lại đúng những cái đã bị coi là sai và sửa rồi.

| Bản cũ (P1-01→03) | Bản này (P1-01→10, thật, 09/09) | Vì sao đổi |
|---|---|---|
| Day Flow Stepper (mỗi kỳ 1 ô, 119/158 ô) + Focus Rail tách 2 khối | **1 `HubTimelineRail`** gộp, full-width, drag-scroll, nút "Về kỳ hiện tại" | `p1-05` — Stepper 158 ô Bingo18 sẽ TRÀN/CO ô nhỏ hơn Keno đã gặp |
| KPI 4 card đếm số kỳ theo tab (trùng tab bar) | **5 card tài chính** (Tổng tiền cược/Tổng số vé/Rủi ro chi trả/**Hoa hồng đại lý**/Doanh thu thuần), mỗi card có breakdown "tồn đọng" | `p1-07` + `p1-09` — card đếm việc bị bỏ vì trùng tab bar; card hoa hồng dùng SỐ THẬT `totals.commission`, không tự tính `revenue×20%` |
| 3 bulk action (settle/void/…) ở Action Bar | **3 action** (Settle/CloseSales/OpenSales) — **Void đã bỏ HẲN khỏi Hub** (bulk và cả single-row) | `p1-07` §10 mục 9 — huỷ kỳ cần review kỹ, không phải quick action |
| Detail: mở Sheet nhúng `DrawCommandCenter` | Inline expand 2-cột (Dòng thời gian / Tiền & rủi ro) + nút hành động dải A full-width | `p1-03` rồi `p1-09` redesign toàn bộ layout panel |
| Tab: không rõ / gộp "Cần xử lý" | **5 tab cố định**: Chờ mở bán · Chờ đóng bán · Chờ kết quả · Chờ kết sổ · Tất cả — mỗi tab = đúng 1 action | `p1-08` — tab gộp nhiều action dễ hiểu lầm khi bulk |
| Không có nhập kết quả trong Hub | Dialog `PublishResultAction` mount NGAY trong Hub (queue tuần tự "Xác nhận & Kỳ tiếp") | `p1-06` + `p1-10` |
| Selection: click từng dòng | **Shift+Click chọn dải** (kiểu Finder) + checkbox native (không Radix — bug perf mount) | `p1-09` fix 2 bug perf thật (re-render + mount cost) |
| Không có phím tắt | `j/k` di dòng, `x` toggle chọn, `Enter` mở tab mới, `1-5` nhảy tab, `←/→` Focus Rail, `r` refetch, `?` help | `p1-02i` |
| Bulk action trần cứng 50 kỳ (nút disable khi vượt) | **Không trần chọn** — vượt `BULK_MAX_DRAWS` tự chạy nhiều lô tuần tự qua `useBatchRunner` (đã generic, dùng lại được ngay) | `p1-09` §12 |
| — | `stageStartMs()` — mốc TUYỆT ĐỐI cho mọi counter sống, KHÔNG trộn `Date.now() − ageInStageSec×1000` | `p1-09` — bug thật: counter "đứng yên" |

**Hệ quả quan trọng nhất:** vì Keno Hub bây giờ đã là **bản ổn định, đã tìm-và-sửa hết các bug UI lớn**,
port Bingo18 lần này có thể COPY LOGIC 1:1 (không phải "port rồi tự thiết kế lại") — chỉ đổi tham số
game + màu theme + `GameProduct`. Đây là lý do bản này an toàn để làm ngay, không cần chờ thêm.

**Về điều kiện "chờ Keno chạy thật ≥ 1 tuần" ở `00-overview.md`:** đó là điều kiện cho 7 câu hỏi mở
(chủ yếu về ngưỡng/perf ở quy mô sản xuất) — không phải điều kiện cho "code đã đúng chưa". Theo yêu cầu
hiện tại là có plan để bắt đầu code ngay, plan này viết đủ chi tiết để làm — nhưng khi triển khai
thật, vẫn nên kiểm tra lại trạng thái 7 câu hỏi đó ở `00-overview.md` trước khi merge lên production.

## 1. Nguyên tắc port (giữ nguyên từ bản cũ, vẫn đúng)

1. **Không copy-paste rồi find-replace `keno` → `bingo18`.** Rủi ro cụ thể: sót 1 string literal
   (collection name, query key, route path) → Hub Bingo18 đọc lẫn data Keno, lỗi im lặng. Cách đúng:
   mở file Keno, **viết lại** file Bingo18 theo đúng logic, đọc từng dòng.
2. **Không tạo base class / generic chia sẻ 2 game** ở tầng use-case/repo/DTO. Ngoại lệ ĐÃ chốt và giữ
   nguyên (không viết lại):
   - `drawOperationsHref(gameKey, drawId)` — hàm thuần dựng URL, nhận `GameProduct` làm param, đã generic.
   - `useBatchRunner` (`apps/backoffice/src/hooks/use-batch-runner.ts`) — engine chia lô tuần tự,
     domain-agnostic, ĐÃ viết để Bingo18 tái dùng (JSDoc `p1-09` §12 nói rõ điều này).
   - `getNextAction()` (`components/games/shared/draw-next-action.ts`) — ĐÃ generic cho cả 7 game.
   - `DrawIdLabel` (`components/games/shared/draw-id-label.tsx`) — generic, chỉ format `drawId`.
   - `GAME_COLORS` (`lib/game-colors.ts`) — đã có sẵn theme Bingo18 (lime), không cần thêm.
3. **Không đụng file Keno trong PR này.** Phát hiện bug Keno khi port → PR riêng.
4. **Không bỏ test vì "đã test ở Keno".** Bingo18 có collection riêng, index riêng, tham số riêng.
5. **Không giảm `DEFAULT_HUB_LIMIT`** dù Bingo18 có "chỉ" 158 kỳ/ngày — xem §2.2.
6. **Không copy giá trị số từ plan này** (danh sách status voidable, 158, 30, 6) — đọc lại từ code
   Bingo18 lúc code thật, phòng trường hợp ai đó sửa giữa lúc viết plan và lúc code.

## 2. Khác biệt tham số Bingo18 vs Keno — đã verify trong code (09/09)

| Tham số | Keno | Bingo18 | Nguồn verify | Ảnh hưởng Hub |
|---|---|---|---|---|
| `drawIntervalMinutes` | 8 | **6** | `packages/game-bingo18/src/rules/financials.ts:129` | `awaitingResultWarnSec`/`StuckSec` = 2×/4× chu kỳ → tự động đúng (đọc từ DTO, không hardcode) |
| Giờ chạy | 06:08–21:52 | **06:06–21:53** | cùng file | — |
| **Số kỳ/ngày** | 119 | **158** (+33%) | `financials.ts:132-133`, verify bằng `floor((21:53-06:06)/6)+1=158` | `DEFAULT_HUB_LIMIT`, ngưỡng test perf, bảng 5B nhiều dòng hơn |
| `salesCloseBeforeSeconds` | 60 | **30** | `financials.ts:128` | Cửa sổ `PendingOpen` hẹp hơn — `deriveDrawState` đã nhận field này từ DTO, không hardcode nên tự đúng |
| `VOIDABLE_STATUSES` | `{Scheduled, SalesClosed, Published}` (extract sang `void-draw-rules.ts`) | **Giống hệt giá trị**, nhưng **CHƯA extract** — hiện inline ở `void-draw.ts:14` | `packages/game-bingo18-application/src/use-cases/draws/void-draw.ts:14` | Phải tạo file `void-draw-rules.ts` mới (xem §4) — nhưng lưu ý: Void đã BỎ khỏi Hub UI (Hub KHÔNG dùng void — xem quyết định `p1-07`), file này chỉ để giữ đúng convention tách rule client-safe, không kéo theo bulk-void |
| Theme màu | sky/cyan (`#0284c7`) | **lime** (`#65a30d`) | `apps/backoffice/src/lib/game-colors.ts` — **ĐÃ CÓ SẴN**, không cần thêm | Dùng `GAME_COLORS[GameProduct.Bingo18]`, KHÔNG hardcode hex |
| Draw doc shape (`sales.closeAt/openAt`, `result.publishedAt`, `settledAt`, `updatedAt`) | — | **Tương thích 100%** với field Hub cần | `packages/game-bingo18/src/entities/draw.ts` | Repo method port thẳng, không cần transform field |
| Play type / number pool | 01–80, 10 pick + 2 side bet | 3 xúc xắc 1–6 | — | **Không ảnh hưởng Hub** — Hub không có heatmap/breakdown theo playType |
| Jackpot | Không | Không | — | Lý luận an toàn `p0-02` áp dụng y nguyên |

### 2.1 `salesCloseBeforeSeconds = 30` — điểm dễ sai nhất khi port

Bingo18 đóng bán chỉ **30 giây** trước giờ quay. `deriveDrawState` (client, `derive-draw-state.ts`) nhận
`salesCloseBeforeSeconds` từ chính DTO snapshot (không hardcode ở FE) — nên phần này **tự đúng miễn**:

- [ ] Route `hub-snapshot` của Bingo18 trả `salesCloseBeforeSeconds` đọc từ **config Bingo18 thật**
      (`GetGlobalConfigUseCase` của package `game-bingo18-application`), KHÔNG copy giá trị `60`.
- [ ] Test riêng ngưỡng `PendingOpen` với `salesCloseBeforeSeconds = 30` — không tái dùng số liệu test Keno.

### 2.2 158 kỳ/ngày — ảnh hưởng UI thật

| Chỗ | Keno (119) | Bingo18 (158) | Cần làm |
|---|---|---|---|
| Bảng 5A (Ended/PendingOpen/Halted) | vài chục dòng | tương tự, nhịp nhanh hơn 1.33× | Không đổi code |
| Bảng 5B Lớp 3 (bung full) | ~110 dòng | **~150 dòng** | `SellingFullTable` đã có ô search theo `drawNo`, đủ dùng — không cần virtualization ngay, đo lại nếu chậm thật |
| `HubTimelineRail` | 119 card | **158 card** | Component đã `drag-scroll` + không cố định width theo tổng số kỳ (không phải Stepper cố định ô) — tự chịu được, verify UI thật |
| `DEFAULT_HUB_LIMIT` | 300 (đã tính luôn cho cả Bingo18, xem JSDoc constant) | **300 — GIỮ NGUYÊN** | Không cần sửa file — hằng số này định nghĩa ở `get-ops-hub-snapshot.ts`, dùng chung cho use-case Keno; khi tạo bản Bingo18, JSDoc constant PHẢI copy nguyên văn giải thích (đã viết CHO CẢ 2 game — "Bingo18 ~158 kỳ/ngày... Keno ~119") |
| Payload snapshot | N=119 | N=158 (+33% bytes) | Verify ETag/304 vẫn hiệu quả, không cần đổi cơ chế |

**`DEFAULT_HUB_LIMIT` không đặt bằng số kỳ/ngày.** Kỳ chưa xong có thể tràn sang ngày trước — đặt limit
= 158 sẽ CẮT ÂM THẦM đúng những kỳ tồn đọng mà Hub tồn tại để hiển thị. Giữ 300 (≈ 2 ngày backlog Bingo18).

## 3. Checklist tổng — thứ tự thực thi bắt buộc

Bingo18 **hiện KHÔNG CÓ** bất kỳ hạ tầng Hub/bulk action nào (đã verify bằng Grep, 0 kết quả cho
`bulk-*` và `operations-hub` trong `packages/game-bingo18*` và `apps/backoffice/.../bingo18/`). Vì vậy
plan này gộp cả phần "P0 tương đương" (data foundation) làm điều kiện tiên quyết, thứ tự **PHẢI** theo
đúng dependency graph dưới — làm sai thứ tự sẽ code trên API chưa tồn tại:

```
[A] void-draw-rules.ts (client-safe, KHÔNG phụ thuộc gì)
        │
[B] hub.types.ts + hub-snapshot.dto.ts (copy shape, đổi game-specific field nếu có)
        │
[C] Repo methods (betting-stats-repo / draw-repo / ops-alert-repo) — cần [B]
        │
[D] bulk-limits.ts + bulk-runner.ts + dto/bulk-draw-action.dto.ts (generic, không phụ thuộc Bingo18 cụ thể)
        │
[E] bulk-trigger-settle.ts / bulk-void-draw.ts (KHÔNG PORT void — xem §6.4) / bulk-close-sales.ts / bulk-open-sales.ts — cần [D] + use-case đơn lẻ đã có
        │
[F] get-ops-hub-snapshot.ts — cần [B] + [C]
        │
[G] API routes (hub-snapshot, bulk-*) — cần [E] + [F]
        │
[H] query-keys/bingo18.ts (thêm opsHub key) — cần [G] tồn tại để biết đúng shape
        │
[I] Frontend _lib (types, derive, context, url-params, preferences-store, interval-registry,
    relative-duration) — cần [G] + [H]
        │
[J] Frontend sections/queue (table, row, expand-panel, bulk-bar, confirm-dialog, selling-section,
    keyboard, mutations) — cần [I]
        │
[K] page.tsx + wiring (nav-registry HUB_GAME_KEY_SEGMENT, sidebar đã có sẵn) — cần [J]
        │
[L] Test toàn diện theo checklist §9
```

## 4. [A] `void-draw-rules.ts` — tách rule client-safe

**Vấn đề hiện tại:** `packages/game-bingo18-application/src/use-cases/draws/void-draw.ts` khai
`VOIDABLE_STATUSES` **inline trong cùng file** với `VoidDrawUseCase` (import nặng: repo, audit, DB
client...). Nếu FE Bingo18 import trực tiếp từ đây để check "draw này có void được không" ở client →
kéo theo toàn bộ backend bundle vào FE (Next.js sẽ lỗi build hoặc bundle phình to bất thường).

**Việc cần làm:** tạo `packages/game-bingo18-application/src/use-cases/draws/void-draw-rules.ts` mirror
đúng cấu trúc `packages/game-keno-application/src/use-cases/draws/void-draw-rules.ts`:

```typescript
/**
 * Rule xác định trạng thái nào của draw Bingo18 được phép void.
 *
 * File này CHỈ import `DrawStatus` — KHÔNG import repo/audit/DB client — để FE có thể
 * import an toàn (check `isVoidable` ở client mà không kéo theo backend bundle).
 */
import { DrawStatus } from "@megawin/game-bingo18/entities";

// ĐỌC LẠI giá trị thật từ void-draw.ts lúc code — không copy nguyên văn từ plan.
export const VOIDABLE_STATUSES: ReadonlySet<DrawStatus> = new Set([
  DrawStatus.Scheduled,
  DrawStatus.SalesClosed,
  DrawStatus.Published,
]);

export function isVoidable(status: DrawStatus): boolean {
  return VOIDABLE_STATUSES.has(status);
}
```

Sau đó sửa `void-draw.ts` để import `VOIDABLE_STATUSES`/`isVoidable` từ file mới này thay vì khai lại
— giữ đúng convention Keno (§5 code-quality: không định nghĩa lại type/const đã có).

**Lưu ý quan trọng:** Hub UI (bulk action bar, queue row, expand panel) **KHÔNG dùng void** — đã bị bỏ
khỏi Hub từ `p1-07` §10 mục 9 bên Keno (huỷ kỳ cần review kỹ, không hợp quick-action). File
`void-draw-rules.ts` vẫn nên tạo (tách đúng convention, ai cần check ở nơi khác vẫn dùng được) nhưng
**KHÔNG kéo theo `bulk-void-draw.ts` + `bulk-void/route.ts` cho Bingo18** — xem §6.4.

## 5. [B]→[F] Backend — Data Foundation (tương đương P0)

### 5.1 `hub.types.ts` — copy shape, kiểm tra field game-specific

Tạo `packages/game-bingo18-application/src/infras/repos/types/hub.types.ts`, mirror
`packages/game-keno-application/src/infras/repos/types/hub.types.ts` (`HubDrawRow`, `HubStatsRow`,
`HubAlertCounts`). Đọc kỹ từng field trong bản Keno và đối chiếu Draw entity Bingo18:

- `HubDrawRow`: các field `_id/status/sales.*/result.publishedAt/settledAt/updatedAt` — **verify từng
  field tồn tại đúng tên trong `packages/game-bingo18/src/entities/draw.ts`** trước khi copy. Nếu Keno
  có field Keno-only (ví dụ liên quan side-bet/combo), **KHÔNG** copy field đó — Bingo18 không có concept
  tương đương (3 xúc xắc, không có combo/side bet).
- `HubStatsRow`: nguồn từ betting-stats repo — kiểm tra collection thống kê Bingo18 có đủ field tổng hợp
  (`totalRevenue`, `totalEntries`, `totalExposure`, `commission` — field hoa hồng PHẢI tồn tại thật,
  không tự tính, xem §5.4.1) hay cần thêm field mới ở tầng aggregate.
- `HubAlertCounts`: từ `ops-alert-repo` — Bingo18 cần có collection ops-alert riêng (đã tồn tại?
  verify — nếu Bingo18 chưa có concept "ops alert" nào (large bet/exposure threshold...) thì tạo tối
  thiểu, hoặc trả `{ critical: 0, warning: 0 }` tĩnh nếu Bingo18 chưa cần cảnh báo phức tạp như Keno.
  **Xác nhận với domain thật** — nếu Bingo18 3 xúc xắc không có concept "combo concentration"/"sidebet
  skew" (đặc thù Keno), phần alert type tương ứng bỏ qua, không port máy móc.

### 5.2 `hub-snapshot.dto.ts` — copy DTO, giữ nguyên field chung

Tạo `packages/game-bingo18-application/src/use-cases/operations/dto/hub-snapshot.dto.ts`, mirror
`OpsHubSnapshotInput`, `OpsHubDrawRow`, `OpsHubThresholds`, `OpsHubSnapshotOutput`. Field
`salesCloseBeforeSeconds` (xem §2.1) **PHẢI có mặt** trong `OpsHubSnapshotOutput` — đây là field mà FE
`deriveDrawState` cần để tính đúng ngưỡng `PendingOpen` cho Bingo18 (30s, không phải 60s như Keno).

`OpsHubThresholds` (ngưỡng cảnh báo `awaitingResultWarnSec/StuckSec`...) — **tính lại theo
`drawIntervalMinutes = 6`** của Bingo18, không copy số cứng từ `DEFAULT_STAGE_THRESHOLDS` của Keno
(vốn tính theo chu kỳ 8 phút). Xem use-case §5.4 để biết công thức chính xác.

### 5.3 Repo methods — [C]

Thêm method vào 3 repo tương ứng của `game-bingo18-application`:

| Repo | Method mirror từ Keno | File |
|---|---|---|
| `BettingStatsRepository` | `getRowsByDrawIds(drawIds)` | `packages/game-bingo18-application/src/infras/repos/betting-stats-repo.ts` |
| `DrawRepository` | `listUnfinishedDrawRows(limit)` | `packages/game-bingo18-application/src/infras/repos/draw-repo.ts` |
| `OpsAlertRepository` | `countByDrawIds(drawIds)` | `packages/game-bingo18-application/src/infras/repos/ops-alert-repo.ts` (tạo mới nếu chưa có repo này — verify trước) |

**Bắt buộc tạo `idx_hub_row_covering` cho Bingo18** — mirror index Keno ở `betting-stats-repo.ts`, đổi
tên collection tương ứng Bingo18. Đây là điểm hiệu năng CỰC QUAN TRỌNG (đã đo ở Keno: giảm đọc DB từ
~6.6MB → 0 nhờ covering index). Với Bingo18 có +33% số kỳ/ngày, thiếu index này sẽ NẶNG HƠN Keno tương ứng.

```typescript
// Ví dụ cấu trúc — TÊN COLLECTION/FIELD ĐỌC LẠI TỪ betting-stats-repo.ts THẬT của Bingo18 lúc code,
// không copy nguyên văn tên field từ Keno (schema có thể khác thứ tự/field phụ).
await collection.createIndex(
  { drawId: 1, /* các field khác mà getRowsByDrawIds SELECT — đọc projection thật */ },
  { name: "idx_hub_row_covering" },
);
```

**Checklist verify covering index (bắt buộc chạy, không suy đoán):**
1. Viết query thật của `getRowsByDrawIds` với `explain("executionStats")`.
2. Kiểm tra `totalDocsExamined` — phải bằng đúng số document trả về (không quét thừa).
3. Kiểm tra `executionStats.executionStages.stage` = `"PROJECTION_COVERED"` (Mongo xác nhận query được
   trả thẳng từ index, không cần fetch document) — nếu là `"FETCH"` thì index CHƯA cover đủ field.

### 5.4 `get-ops-hub-snapshot.ts` — use-case chính — [F]

Tạo `packages/game-bingo18-application/src/use-cases/operations/get-ops-hub-snapshot.ts`, mirror
`GetOpsHubSnapshotUseCase` của Keno. Giữ nguyên nguyên tắc **"4 query cố định"**:
1. `listUnfinishedDrawRows` (draw repo)
2. `getRowsByDrawIds` (betting-stats repo)
3. `countByDrawIds` (ops-alert repo)
4. `getGlobalConfig` (config use-case Bingo18 — lấy `salesCloseBeforeSeconds`, `drawIntervalMinutes`)

Merge 4 nguồn theo `drawId`, build `OpsHubSnapshotOutput`. `DEFAULT_HUB_LIMIT = 300` (giữ nguyên, xem
§2.2). JSDoc của constant này ở bản Keno **đã viết chung cho cả 2 game** — copy nguyên JSDoc đó khi
tạo hằng số Bingo18 (không cần viết lại, chỉ cần đối chiếu đúng nội dung còn khớp).

#### 5.4.1 `DEFAULT_STAGE_THRESHOLDS` — tính lại theo chu kỳ Bingo18

Đọc công thức thật trong `get-ops-hub-snapshot.ts` của Keno (thường là hệ số × `drawIntervalMinutes`,
VD `awaitingResultWarnSec = 2 × drawIntervalMinutes × 60`). Áp dụng ĐÚNG công thức đó nhưng thay
`drawIntervalMinutes = 6` (Bingo18) — **KHÔNG** copy số giây tuyệt đối từ Keno (số đó được tính từ 8
phút, sai hoàn toàn cho chu kỳ 6 phút). Nếu ngưỡng phụ thuộc trực tiếp `drawIntervalMinutes` từ config
(không hardcode) thì không cần sửa gì — verify code thật xem là hardcode hay đọc config để biết có
cần sửa hay không.

#### 5.4.2 KPI hoa hồng đại lý — commission field PHẢI có thật trong DB, không tự tính

`p1-09` bên Keno đã sửa lỗi: KPI "Hoa hồng" **không được tự tính `revenue × 20%`** (hardcode rate) mà
phải đọc field `commission` thật từ `HubStatsRow`/betting-stats aggregate — vì rate hoa hồng có thể
khác nhau theo tenant/config, tính cứng 20% sẽ SAI khi tenant có rate khác. Khi port Bingo18:
- [ ] Xác nhận collection betting-stats Bingo18 **đã có field `commission`** tổng hợp theo draw (nếu
      chưa có, đây là gap cần thêm ở tầng aggregate/settle trước khi port Hub KPI này — không tự chế
      công thức ở use-case Hub).
- [ ] Nếu Bingo18 chưa có hệ thống hoa hồng đại lý (khác Keno — cần xác nhận với domain), **bỏ card
      KPI hoa hồng** khỏi `hub-kpi-strip.tsx` bản Bingo18 thay vì hiển thị số sai/giả.

## 6. [D]→[G] Backend — Bulk Actions

### 6.1 `bulk-limits.ts`, `bulk-runner.ts`, `dto/bulk-draw-action.dto.ts`

Các file này **generic theo thiết kế** (không có logic đặc thù Keno) nhưng vẫn phải tạo **bản riêng
cho `game-bingo18-application`** (không import chéo package — vi phạm layering `app-use-case-layering`).
Copy 1:1 cấu trúc:
- `packages/game-bingo18-application/src/use-cases/draws/bulk-limits.ts` — `BULK_MAX_DRAWS`,
  `BULK_CONCURRENCY`. Đọc lại giá trị thật ở bản Keno lúc code (đừng copy số từ plan).
- `packages/game-bingo18-application/src/use-cases/draws/bulk-runner.ts` — `runBulkDrawAction<T>`.
- `packages/game-bingo18-application/src/use-cases/draws/dto/bulk-draw-action.dto.ts` —
  `BulkDrawActionResult`, `BulkDrawActionOutput`, input types.

### 6.2 Bulk use-cases — [E]

| Use-case | Mirror từ | Wrap use-case đơn lẻ Bingo18 nào |
|---|---|---|
| `BulkTriggerSettleUseCase` | `bulk-trigger-settle.ts` | `TriggerSettleUseCase` (Bingo18 — đã tồn tại, `p0-02` status đã align) |
| `BulkCloseSalesUseCase` | (tạo mới nếu Keno có `bulk-close-sales.ts` — verify path thật) | use-case đóng bán đơn lẻ Bingo18 |
| `BulkOpenSalesUseCase` | tương tự | use-case mở bán đơn lẻ Bingo18 |

Mỗi use-case bulk **ghi audit log** giống bản Keno — dùng đúng `AuditLogAction`/`AuditLogEntity` đã
định nghĩa cho Bingo18 trong `packages/audit/src/entities/audit-log.enums.ts` (nếu thiếu entry cho
Bingo18 bulk action, cần thêm — đọc file này trước khi code để biết convention enum).

### 6.3 API routes — [G]

Tạo 3 route dưới `apps/backoffice/src/app/api/bingo18/draws/`:
- `bulk-close-sales/route.ts`
- `bulk-open-sales/route.ts`
- `bulk-settle/route.ts`

Mỗi route: validate qua Zod schema (mirror `apps/backoffice/src/app/api/keno/draws/_lib/schema.ts` —
kiểm tra file schema Bingo18 tương ứng đã có sẵn draw-action schema chưa, tái dùng nếu có), gọi use-case
bulk, rồi **invalidate cache Hub snapshot Bingo18** (xem §6.5).

Route snapshot: `apps/backoffice/src/app/api/bingo18/operations/hub-snapshot/route.ts` — mirror ETag
caching TTL 2s như Keno. Schema tại `apps/backoffice/src/app/api/bingo18/operations/_lib/schema.ts`
(kiểm tra file `_lib/schema.ts` đã tồn tại cho `operations` Bingo18 chưa — nếu route `operations` đơn
lẻ Bingo18 đã có schema riêng, thêm schema hub-snapshot vào cùng file theo đúng convention, không tạo
file trùng mục đích).

### 6.4 KHÔNG tạo `bulk-void/route.ts` cho Bingo18 Hub

Vì Hub Keno đã bỏ void khỏi bulk action bar (`p1-07`), **không port `bulk-void-draw.ts` +
`bulk-void/route.ts`** trong phạm vi plan này. Nếu tương lai cần void đơn lẻ ngoài Hub, đó là use-case
đơn lẻ `VoidDrawUseCase` đã tồn tại sẵn ở `packages/game-bingo18-application/src/use-cases/draws/void-draw.ts`
— không liên quan Hub. (Rule client-safe ở §4 vẫn nên tạo cho đúng convention, độc lập với quyết định này.)

### 6.5 Cache invalidation — TTL 2s, key riêng Bingo18

Route Hub snapshot Keno dùng in-memory cache TTL 2s theo ETag. Bingo18 **PHẢI dùng cache key/store
riêng** (không share biến module với Keno — dù cùng pattern code, biến cache phải tách theo game để
tránh 1 game invalidate cache của game khác). Verify implementation thật ở route Keno để biết cache
lưu ở đâu (module-level `Map`? — nếu vậy, đặt tên biến rõ ràng `bingo18HubSnapshotCache` khi tạo bản mới).

## 7. [H]→[J] Frontend — toàn bộ `_lib/` (mirror 1:1 cấu trúc, đổi tham số + theme)

Tạo cây thư mục `apps/backoffice/src/app/(main)/games/bingo18/operations-hub/` mirror đúng cấu trúc
`apps/backoffice/src/app/(main)/games/keno/operations-hub/`. Danh sách file — cột "Đổi gì" chỉ những
khác biệt thật, phần còn lại **copy logic nguyên vẹn**, chỉ đổi import path/`GameProduct`.

### 7.0 [H] Query keys

`apps/backoffice/src/lib/query-keys/bingo18.ts` — thêm `opsHub` key mirror cấu trúc
`apps/backoffice/src/lib/query-keys/keno.ts`. Verify file `bingo18.ts` đã tồn tại các key khác chưa
(operations đơn lẻ, draws...) — thêm vào đúng namespace hiện có, không tạo file trùng.

### 7.1 `_lib/hub-types.ts`

Copy nguyên vẹn `DerivedRow`, `FunnelSegment`, `OpsFunnel`, `SellingOutlier`, `SellingSummary`,
`DayFlowColumn`, `HubDerived`. **Không có khác biệt game-specific** ở tầng type này — types này mô tả
cấu trúc derive chung, không chứa field riêng Keno. Nếu Bingo18 bỏ KPI hoa hồng (§5.4.2), field liên
quan trong `SellingSummary`/`HubDerived` (nếu Keno đã thêm `commission` sau `p1-09`) — **giữ field**
nhưng để `undefined`/`0` nếu Bingo18 không có data, không xoá field khỏi type (giữ type đồng nhất giữa
2 game giúp component dùng chung logic derive dễ audit hơn — nhưng KHÔNG tạo type chia sẻ, chỉ là 2
file riêng có field tương tự).

### 7.2 `_lib/derive-draw-state.ts` — CỰC KỲ QUAN TRỌNG, đọc kỹ `stageStartMs()`

Copy nguyên vẹn logic `deriveDrawState` (tính `SaleGate`/`OpsStage`/`StageHealth`) và **hàm
`stageStartMs()`** (fix bug counter đứng yên ở `p1-09`). Vì hàm này nhận `salesCloseBeforeSeconds` và
ngưỡng threshold từ tham số (không hardcode), port sẽ tự đúng miễn:
- [ ] Ngưỡng `StuckSec`/`WarnSec` truyền vào đúng từ `OpsHubThresholds` (đã tính theo `drawIntervalMinutes
      = 6` ở §5.4.1), không hardcode số Keno.
- [ ] `VOIDABLE_STATUSES`/`isVoidable` import từ `void-draw-rules.ts` Bingo18 (§4) — **nhưng vì Hub
      không hiển thị action void (§6.4), hàm `isVoidable` có thể KHÔNG được gọi ở Hub UI Bingo18** —
      verify component nào thực sự gọi `isVoidable` ở bản Keno hiện tại (có thể chỉ còn dùng ở trang
      operations đơn lẻ, không phải Hub) trước khi quyết định có cần import ở Hub hay không.

### 7.3 `_lib/derive-hub-summary.ts`

Copy nguyên vẹn — 1 pass qua toàn bộ raw rows, tính derived rows + funnel + selling summary + Day Flow
columns + boundary draw ID + `nextBoundaryAtMs`. Nếu bỏ KPI hoa hồng (§5.4.2), bỏ phần tính tổng
`commission` trong `SellingSummary`/KPI aggregate tương ứng — KHÔNG để lại code tính `0` giả vờ có ý
nghĩa (dễ gây hiểu lầm sau này khi đọc lại).

### 7.4 `_lib/use-hub-context.tsx`

Copy nguyên vẹn Provider — quản lý query, derive, clock offset, boundary scheduling, selected rows,
bulk action errors. Đổi `queryKey` sang `bingo18Keys.opsHub` (§7.0), đổi endpoint fetch sang
`/api/bingo18/operations/hub-snapshot`.

### 7.5 `_lib/use-hub-query.ts`

Copy nguyên vẹn — polling interval theo server data, `keepPreviousData`, `refetchOnWindowFocus`. Đổi
endpoint + queryKey.

### 7.6 `_lib/use-hub-url-params.ts`

Copy nguyên vẹn (dùng `nuqs`) — `gate`, `sort`, `dir`, `focus`, `span`. Không có khác biệt game-specific.

### 7.7 `_lib/hub-preferences-store.ts`

Copy nguyên vẹn cấu trúc Zustand store, **đổi tên key `localStorage`** (VD
`keno-ops-hub-preferences` → `bingo18-ops-hub-preferences`) để tránh 2 game đọc/ghi đè cùng 1 key khi
user mở cả 2 Hub trên các tab khác nhau của cùng browser.

### 7.8 `_lib/interval-registry.ts` + `_lib/relative-duration.tsx`

Copy nguyên vẹn — **KHÔNG chia sẻ registry giữa 2 Hub** (mỗi file là instance riêng theo route module,
Next.js tự tách theo route nên không cần lo runtime singleton bị lẫn — verify bằng cách đọc: registry
implement dạng module-level biến trong file này, và file này chỉ được import trong cây route
`bingo18/operations-hub`, nên tự nhiên tách biệt).

### 7.9 `_lib/hub-page-header.tsx`

Copy nguyên vẹn cấu trúc — đổi title "Trung tâm vận hành Keno" → "Trung tâm vận hành Bingo18", đổi màu
theo `GAME_COLORS[GameProduct.Bingo18]` (lime) thay vì hardcode màu Keno.

### 7.10 `_lib/hub-kpi-strip.tsx`

Copy cấu trúc 5 card. **Nếu giữ KPI hoa hồng** (§5.4.2 xác nhận có field `commission` thật) — copy
card nguyên vẹn. **Nếu bỏ** — xoá card đó, layout co về 4 card (kiểm tra CSS grid không để trống ô).

### 7.11 `_lib/hub-alert-banner.tsx`

Copy nguyên vẹn cấu trúc cảnh báo ưu tiên (`truncated data`, `needs resettle`, `never opened`, `stuck`,
`pending open`, `halted`) + sound notification. Nếu §5.1 xác nhận Bingo18 không có alert type phức tạp
kiểu Keno (combo/sidebet), phần đó tự nhiên rỗng (đến từ `ops-alert-repo` trả `0`), không cần sửa logic
banner — banner chỉ hiển thị khi count > 0.

### 7.12 `_lib/hub-timeline-rail.tsx`

Copy nguyên vẹn — component đã thiết kế cho số lượng draw động (drag-scroll, không cố định độ rộng
theo tổng số kỳ), tự chịu được 158 kỳ Bingo18 (xem §2.2). Verify UI thật sau khi có data — nếu card quá
dày đặc ở màn hình nhỏ, đó là bug UI cần fix riêng, không thuộc phạm vi port logic.

### 7.13 `_lib/sections/queue/*` — toàn bộ 12 file

| File | Đổi gì |
|---|---|
| `queue-types.ts` | `HUB_GATE_TAB_LABELS`, `OPS_STAGE_LABEL`, `SALE_GATE_LABEL` — copy nguyên vẹn (label tiếng Việt generic, không riêng Keno). `BulkActionKind` — bỏ `"void"` nếu Keno hiện đã bỏ (xác nhận enum thật, `p1-07` đã bỏ void khỏi UI nhưng cần xem type còn giữ `"void"` cho nơi khác dùng không) |
| `partition-by-action.ts` | Copy nguyên vẹn `hasAnyAction`, `getRowAccent`, `actionUnavailableReason` — logic partition dựa trên `SaleGate`/`OpsStage`, không có phần Keno-only |
| `filter-sort-rows.ts` | Copy nguyên vẹn `matchesTab`, `compareRows`, `countRowsByTab`, `defaultSortForTab`, `buildQueueTables` |
| `use-bulk-mutations.ts` | Copy nguyên vẹn `useBulkAction`/`useBulkBatchAction` — đổi API endpoint + query invalidation key sang Bingo18 |
| `hub-queue-table.tsx` | Copy nguyên vẹn — bao gồm state `PublishResultAction` mount ở đây (fix bug `p1-10`), `publishQueue` logic tìm anchor trong `state.rows` (fix bug `p1-10`). Import `PublishResultAction` từ `apps/backoffice/src/app/(main)/games/bingo18/operations/_lib/sections/draw-management/draw-actions/publish-result-action.tsx` — **ĐÃ TỒN TẠI SẴN** cho Bingo18 (xác nhận từ khảo sát: đã align P1-06), chỉ cần import đúng path |
| `queue-row.tsx` | Copy nguyên vẹn — **native `<input type="checkbox">`, KHÔNG dùng Radix Checkbox** (fix bug perf `p1-09`) |
| `hub-expand-panel.tsx` | Copy nguyên vẹn layout 2-cột (Dòng thời gian / Tiền & rủi ro), tích hợp `PublishResultAction` (`p1-10`). Bỏ card hoa hồng nếu §5.4.2 quyết định bỏ |
| `hub-selling-section.tsx` | Copy nguyên vẹn — outliers + full table + search theo `drawNo`. Verify search field tên đúng (`drawNo` hay field khác ở Bingo18 — đọc entity thật) |
| `bulk-confirm-dialog.tsx` | Copy nguyên vẹn — 3 action (Settle/CloseSales/OpenSales), KHÔNG có Void (đã bỏ ở Keno từ `p1-07`) |
| `hub-bulk-action-bar.tsx` | Copy nguyên vẹn — dùng `useBatchRunner` (đã generic, import trực tiếp từ `apps/backoffice/src/hooks/use-batch-runner.ts`, không copy file này) |
| `use-hub-keyboard.ts` | Copy nguyên vẹn — không có phần Keno-specific |
| `selling-outliers.ts` | Copy nguyên vẹn cấu trúc classify (critical alert/revenue spike/large bet/exposure spike) — nếu Bingo18 không có alert type nào đó (§5.1), nhánh tương ứng tự nhận `0`/rỗng từ data, không cần xoá code nhánh (giữ đối xứng cấu trúc, dễ maintain sau) |

### 7.14 [K] `page.tsx` + wiring

- Tạo `apps/backoffice/src/app/(main)/games/bingo18/operations-hub/page.tsx` mirror Keno — dùng
  `HubProvider`, keyboard shortcuts.
- Sửa `apps/backoffice/src/lib/nav-registry.ts`: thêm `GameProduct.Bingo18` vào
  `HUB_GAME_KEY_SEGMENT` (hiện chỉ có Keno — đây là điểm PHẢI sửa, đã xác nhận qua khảo sát).
- `apps/backoffice/src/navigation/sidebar/sidebar-items.ts` — **đã có sẵn** entry Bingo18 Hub trỏ đúng
  URL tương lai, không cần sửa gì (đã xác nhận qua khảo sát).
- Verify `drawOperationsHref` (generic, đã hỗ trợ `GameProduct` param) hoạt động đúng khi được gọi từ
  Bingo18 Hub (mở tab mới tới trang operations đơn lẻ Bingo18).

## 8. Component dùng chung (KHÔNG port, import trực tiếp)

Các file sau đã generic theo đúng nguyên tắc §1 mục 2 — Bingo18 Hub **import trực tiếp**, không tạo
bản riêng:

| File | Vai trò |
|---|---|
| `apps/backoffice/src/lib/nav-registry.ts` → `drawOperationsHref()` | Dựng URL trang operations đơn lẻ theo `GameProduct` |
| `apps/backoffice/src/hooks/use-batch-runner.ts` | Engine chia lô bulk action tuần tự khi vượt `BULK_MAX_DRAWS` |
| `apps/backoffice/src/components/games/shared/draw-next-action.ts` | Tính hành động tiếp theo cho 1 draw theo status |
| `apps/backoffice/src/components/games/shared/draw-id-label.tsx` | Format hiển thị `drawId` |
| `apps/backoffice/src/lib/game-colors.ts` → `GAME_COLORS` | Theme màu — Bingo18 đã có sẵn (lime) |

## 9. Checklist test — chạy trước khi coi port hoàn tất

### 9.1 Data foundation
- [ ] `explain("executionStats")` cho `getRowsByDrawIds` Bingo18 — `PROJECTION_COVERED`, không `FETCH`.
- [ ] Snapshot API trả đúng `salesCloseBeforeSeconds = 30` (không phải giá trị mặc định Keno).
- [ ] `OpsHubThresholds` tính đúng theo `drawIntervalMinutes = 6` (verify số giây thực tế trong response).
- [ ] Payload snapshot với 158 kỳ — đo kích thước response, so với Keno 119 kỳ (kỳ vọng ~+33%).
- [ ] ETag/304 hoạt động đúng khi gọi lại trong TTL 2s.

### 9.2 Bulk actions
- [ ] Bulk settle/close-sales/open-sales từng action riêng — verify partial success khi 1 draw trong
      batch lỗi (draw khác vẫn xử lý được, không rollback toàn bộ).
- [ ] Chọn > `BULK_MAX_DRAWS` draws — verify `useBatchRunner` tự chia nhiều lô, progress hiển thị đúng.
- [ ] Audit log ghi đúng entity/action cho Bingo18 (không lẫn entity Keno).
- [ ] Cache Hub snapshot bị invalidate đúng sau mỗi bulk action (không thấy data cũ trong 2s TTL).

### 9.3 Frontend UI/UX — đối chiếu 1:1 với Keno
- [ ] 5 tab cố định hiển thị đúng nhãn, đúng action tương ứng mỗi tab.
- [ ] `HubTimelineRail` hiển thị đủ 158 kỳ, drag-scroll mượt, nút "Về kỳ hiện tại" hoạt động.
- [ ] KPI strip hiển thị đúng 4-5 card (tuỳ quyết định §5.4.2), số liệu khớp tổng từ bảng.
- [ ] Shift+Click chọn dải nhiều dòng — verify hoạt động đúng cả khi đổi tab giữa lúc chọn.
- [ ] Checkbox native — verify KHÔNG có delay khi chuyển tab với ~150 dòng (so sánh bug đã fix ở Keno).
- [ ] `RelativeDuration` counter chạy liên tục, không "đứng yên" (verify bug `stageStartMs` đã fix đúng).
- [ ] Inline expand panel — layout 2 cột, verify data hiển thị đúng (không NaN/undefined) cho cả 158 kỳ.
- [ ] Nhập kết quả tuần tự trong Hub (`PublishResultAction` mount ở `HubQueueTable`) — verify dialog
      KHÔNG tự đóng khi bấm "Xác nhận & Kỳ tiếp" (bug đã fix `p1-10`), verify queue chỉ gồm draw có
      `drawId > anchor.drawId` (không lẫn draw cũ).
- [ ] Phím tắt `j/k/x/Enter/1-5/←/→/r/?` hoạt động đúng trên trang Bingo18 Hub.
- [ ] Alert banner hiển thị đúng khi có draw stuck/never-opened/halted (tạo data test giả lập nếu cần).
- [ ] Theme màu lime hiển thị đúng ở header, KPI card, timeline rail — không sót màu sky/cyan của Keno.
- [ ] `nav-registry.ts` — verify link từ Hub Bingo18 mở đúng trang operations đơn lẻ Bingo18 ở tab mới.
- [ ] Sidebar — click "Bingo18 Ops Hub" dẫn đúng route, không 404.

### 9.4 Kiểm tra chéo — KHÔNG được xảy ra
- [ ] Hub Bingo18 KHÔNG đọc/ghi nhầm collection Keno (kiểm tra bằng cách tạo draw test riêng từng game,
      xác nhận Hub Bingo18 chỉ hiển thị draw Bingo18).
- [ ] localStorage preferences 2 Hub không đè lẫn (mở cả 2 Hub, đổi density 1 bên, verify bên kia không đổi).
- [ ] Cache Hub snapshot 2 game độc lập (bulk action Keno không invalidate cache Bingo18 và ngược lại).
- [ ] `pnpm check-types` sạch trên toàn bộ file mới tạo.
- [ ] `pnpm lint` sạch, không cần thêm `biome-ignore` nào.

## 10. Ngoài phạm vi (không làm trong plan này)

- Toàn bộ P2 (`p2-01`…`p2-05` Auto-Pilot) — theo đúng yêu cầu user.
- Virtualization cho bảng 5B (150 dòng) — chỉ làm nếu đo thật thấy chậm, không làm phòng hờ.
- Thêm alert type mới đặc thù Bingo18 (nếu domain thật cần) — đó là tính năng mới, không phải port.
- Sửa bug Keno phát hiện trong lúc port — tách PR riêng.