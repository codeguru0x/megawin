---
name: ""
overview: ""
todos: []
isProject: false
---

# p0-03 — Hub query foundation: repo batch + DTO raw + index

> **Phase:** P0 · **Status:** ✅ code done (07/09) · review + test UI trực tiếp 07/09 — đúng 4 query cố
> định, đã verify bằng API call thật (phát hiện + fix 1 bug `TypeError` khi draw chưa có bets, xem
> `betting-stats-repo.ts`); điểm 2-3 bảng "Câu hỏi mở" (index `explain()`) vẫn CHƯA đo ·
> **Phụ thuộc:** — (chạy song song p0-02 được) · **Chặn:** p1-01
> **Scope:** `game-keno-application` (Bingo18 làm ở p1-04)
> **Guideline UI:** [`ops-hub-page-layout.guideline.md`](./ops-hub-page-layout.guideline.md) — §1.3 (dẫn xuất trạng thái), §11 (bảng việc phải sửa)
> **Ràng buộc số 1:** số DB call **KHÔNG** tỷ lệ với số kỳ. 4 query cho 5 kỳ = 4 query cho 200 kỳ.
> **Ràng buộc số 2:** server trả **RAW + `serverNow`**, KHÔNG dẫn xuất `gate`/`stage`/`health`.

## 0. Bản này khác bản trước ở đâu

| Vấn đề bản trước | Sửa |
|---|---|
| Projection dùng `salesCloseTime` — **field KHÔNG tồn tại** trên `KenoDrawDoc` | Đúng là `sales.closeAt` (+ `sales.openAt`) — xem [`game-keno/src/entities/draw.ts:168`](../../../packages/game-keno/src/entities/draw.ts), field là `sales: DrawSales` |
| Thiếu `result.publishedAt` | **Bắt buộc có** — không có nó thì không phân biệt được `AwaitingResult` vs `AwaitingSettle`, và không phát hiện được `NeedsResettle` |
| Thiếu `updatedAt` của draw | **Bắt buộc có** — dùng làm mốc `ageInStage` cho `Settling`/`Voiding` |
| `summary` đếm theo `status` thô (`awaitingSettleCount = Published`, `sellingCount = SalesOpen`) | **Bỏ hẳn `summary`.** `status` thô không ánh xạ 1-1 sang `OpsStage`: `salesOpen` có thể là `Selling` **hoặc** `PendingClose` tuỳ `now` vs `closeAt`. Đếm ở server = đếm sai. |
| Câu hỏi mở "worstCaseTotal RAW hay capped?" | **Đóng** — là RAW, chưa cap. Xem §6.3 |
| `DEFAULT_HUB_LIMIT = 300` | Giữ 300 nhưng ghi rõ cơ sở: Bingo18 ~158 kỳ/ngày → 300 ≈ 2 ngày backlog. **Không** giảm dưới 200 |
| `exposurePct` tính ở server | **Bỏ** — cùng lý do như `summary`: FE derive được, và có 2 loại tỉ lệ khác nhau (§6.3) |

## 1. Vấn đề

`GetOpsSnapshotUseCase` (`use-cases/operations/get-ops-snapshot.ts`) phục vụ **đúng 1 kỳ**:

```
60|    const [config, drawStatuses, stats, newCount, criticalCount] = await Promise.all([...])
74|    const [topCombos, topAccounts, uniquePlayers] = stats ? await Promise.all([...]) : [[], [], 0]
```

Tổng 4-7 query cho 1 kỳ. Gọi nó N lần cho Hub = **7 × 158 = 1106 query mỗi lần poll**. Không dùng
được. Cần use-case mới đọc **nhiều kỳ trong số query cố định**.

### 1.1 Ba cái bẫy phải tránh

1. **Trần 500 doc im lặng của `findMany`.** JSDoc `listUnfinishedDrawIds` (`draw-repo.ts:183-185`) ghi
   rõ: *"`findMany` mặc định cắt 500 và **im lặng**"*. Với mô hình bán cả ngày (guideline §0.1), Keno
   ~119 kỳ và Bingo18 ~158 kỳ **luôn** nằm trong `rows` — không phải "chỉ khi backlog". Cộng backlog
   2 ngày là sát trần. Vượt trần = **mất kỳ khỏi Hub mà không có lỗi nào**, đúng thứ khó phát hiện
   nhất. Mọi query trong plan này **phải truyền `limit` tường minh** và trả kèm cờ `truncated`.
2. **Doc stats nặng ~33KB.** JSDoc `findNotFinal` (`betting-stats-repo.ts:70-71`) ghi *"không kéo doc
   33KB × D kỳ mỗi tick"*. 158 kỳ × 33KB = **~5MB** mỗi lần poll nếu đọc full doc. Bắt buộc projection
   mỏng.
3. **`alertCounts` hiện là GLOBAL, không theo kỳ.** `countByStatus(New)` và `countActiveCritical()`
   (dòng 66-67) đếm **toàn bộ** alert, không filter `drawId`. Snapshot 1 kỳ dùng được vì FE chỉ hiện 1
   badge tổng. Hub cần **alert theo từng kỳ** để tô đỏ đúng dòng → phải có method mới, **không** tái
   dùng 2 method này cho per-draw.

### 1.2 Cái bẫy thứ tư — dẫn xuất trạng thái ở server là SAI

Bản trước trả `summary.awaitingSettleCount = count(status === Published)` và
`summary.sellingCount = count(status === SalesOpen)`. Cả hai đều sai theo mô hình vận hành thật
(guideline §1.3):

- `status = salesOpen` là `Selling` khi `now < closeAt`, nhưng là **`PendingClose`** khi `now >= closeAt`.
  Cùng một `status`, hai chặng khác nhau, **phân biệt bằng `now`**.
- `status = scheduled` là `PendingOpen` khi `now < closeAt`, nhưng là **`NeverOpened`** (kỳ trắng, phải
  void) khi `now >= closeAt`.
- `status = published` là `AwaitingSettle`, nhưng nếu `settledAt < result.publishedAt` thì là
  **`NeedsResettle`** — phải so 2 timestamp, không đọc `status`.

Đếm theo `status` ở server sẽ cho ra con số **không khớp** với bảng mà người vận hành đang nhìn. Đó là
kiểu bug tệ nhất cho một trang vận hành: KPI nói 4, bảng có 17.

**Chốt: server trả RAW timestamp + `serverNow`. FE derive `gate`/`stage`/`health` bằng 1 hàm pure duy
nhất** (guideline §1.3, implement ở p1-01). Server **không** biết gì về `SaleGate`/`OpsStage`.

## 2. Thiết kế: 4 query cố định

`GetOpsHubSnapshotUseCase` — file mới `use-cases/operations/get-ops-hub-snapshot.ts`.

| # | Nguồn | Query | Trả về | Index |
|---|---|---|---|---|
| 1 | `GetGlobalConfigUseCase` | cache in-memory | thresholds, `tickSeconds`, `drawIntervalMinutes`, `salesCloseBeforeSeconds` | — (cache) |
| 2 | `DrawRepository` | `findManyAsDocuments({status: $in})` + projection | N dòng draw mỏng | `idx_status_drawId_desc` |
| 3 | `BettingStatsRepository` | `findManyAsDocuments({drawId: $in})` + projection | N dòng stats mỏng | `idx_drawId_unique` |
| 4 | `OpsAlertRepository` | `aggregate` group by `drawId` | Map drawId → counts | `idx_drawId_status` (MỚI, có điều kiện) |

**Cố định 4, bất kể N.** Query 3 và 4 đều nhận `drawIds` từ query 2 nên **không** song song hoàn toàn
được — đây là waterfall 2 tầng có chủ đích:

```
tầng 1:  [config, draws]        ← Promise.all
tầng 2:  [stats, alertCounts]   ← Promise.all, cần drawIds từ tầng 1
```

2 round-trip tuần tự. Đúng pattern `get-ops-snapshot.ts` đang dùng (dòng 60 rồi 74), không phát minh
kiểu khác.

### 2.1 Vì sao KHÔNG dùng `$lookup` để gộp thành 1 query

Gộp draws + stats + alerts bằng `$lookup` nghe rẻ hơn (1 round-trip) nhưng:

- `$lookup` trên collection 33KB/doc buộc Mongo materialize doc trước khi projection → mất đúng cái
  lợi của projection mỏng.
- Pipeline phức tạp khó đọc `explain()`, khó biết đang IXSCAN hay COLLSCAN.
- Vi phạm `mongodb.mdc` — aggregate phức tạp phải có lý do rõ; ở đây 2 round-trip index-only rẻ hơn 1
  round-trip materialize.

**Chốt: 2 tầng `Promise.all`, không `$lookup`.**

### 2.2 Query 1 phải trả thêm 2 field cấu hình play

`drawIntervalMinutes` và `salesCloseBeforeSeconds` (Keno `8`/`60`, Bingo18 `6`/`30` — xem
[`game-keno/src/rules/financials.ts:231-232`](../../../packages/game-keno/src/rules/financials.ts))
**bắt buộc** vào response vì:

- Ngưỡng `awaitingResultWarnSec` = ~2 × chu kỳ kỳ (guideline §8.3) → FE phải biết chu kỳ.
- Focus Rail (guideline §1.4.6) cần biết khoảng cách giữa các kỳ để render trục.
- Cả hai **cấu hình per-tenant** → hardcode ở FE là bug chờ nổ.

## 3. Repo methods mới

### 3.1 `DrawRepository.listUnfinishedDrawRows(limit)`

**File:** `packages/game-keno-application/src/infras/repos/draw-repo.ts`

```typescript
  /**
   * Danh sách kỳ chưa hoàn thành kèm các field Hub cần — thin query cho Ops Hub.
   *
   * Vì sao KHÔNG dùng `getUnfinishedDraws`: nó map full `DrawEntity` (có `financial`,
   * `settleSummary`, `result` đầy đủ, `vietlottRef`…). Hub hiển thị 120-160 dòng → kéo full
   * doc là hàng MB mỗi lần poll. Ở đây chỉ lấy các field dựng được 1 dòng bảng + dẫn xuất
   * trạng thái.
   *
   * Vì sao KHÔNG dùng `listUnfinishedDrawIds`: nó chỉ trả `drawId`, Hub cần các timestamp
   * để dẫn xuất chặng — gọi thêm query thứ 2 để lấy phần còn lại là vô nghĩa.
   *
   * Index `idx_status_drawId_desc` = `{ status: 1, drawId: -1 }`: `status $in` là equality
   * prefix, sort `drawId` desc khớp chiều index → IXSCAN. KHÔNG covered (projection có
   * `drawTime`, `sales.*`, `settledAt`… ngoài index) nên vẫn FETCH document — chấp nhận được
   * vì projection cắt phần lớn payload.
   *
   * @param limit - Trần số kỳ. `findMany` mặc định cắt 500 và IM LẶNG — truyền tường minh.
   *   Caller PHẢI so `rows.length >= limit` để biết có bị cắt (xem `truncated` ở DTO).
   */
  async listUnfinishedDrawRows(limit: number): Promise<HubDrawRow[]>
```

Projection **đúng và đủ** — mỗi field có lý do, không field nào thừa:

| Field | Vì sao cần |
|---|---|
| `drawId` | Khoá join sang stats/alerts, và là param của mọi action |
| `drawNo` | Hiển thị ngắn trên card Focus Rail và cột `Kỳ` |
| `status` | Đầu vào dẫn xuất `gate`/`stage` (guideline §1.3) |
| `drawTime` | Mốc `AwaitingResult` (`now >= drawTime` mà chưa có kết quả) |
| **`sales.closeAt`** | **Trục chính của cả trang** — biên chốt cược, phân chia `Open` vs `Ended` |
| **`sales.openAt`** | Mốc tính `ageSinceOpen` cho outlier "kỳ chết không ai cược" (guideline §9.2). Optional trên doc (`openAt?: Date`) |
| **`result.publishedAt`** | Phân biệt `AwaitingResult` vs `AwaitingSettle`, **và** phát hiện `NeedsResettle` (`settledAt < result.publishedAt`) |
| `settledAt` | Cùng cặp với `result.publishedAt` cho `NeedsResettle` |
| **`updatedAt`** | Mốc `ageInStage` cho `Settling`/`Voiding` — hai chặng không có timestamp riêng, chỉ có lần ghi cuối |

```typescript
    const docs = await this.findManyAsDocuments(
      { status: { $in: [...DRAW_UNFINISHED_STATUSES] } },
      {
        projection: {
          _id: 0,
          [f("drawId")]: 1,
          [f("drawNo")]: 1,
          [f("status")]: 1,
          [f("drawTime")]: 1,
          [f("sales.closeAt")]: 1,
          [f("sales.openAt")]: 1,
          [f("result.publishedAt")]: 1,
          [f("settledAt")]: 1,
          [f("updatedAt")]: 1,
        },
        sort: { drawId: -1 },
        limit,
      },
    );
```

Ba điểm bắt buộc:

1. **Dot-path qua `docPath<DrawDoc>()`** (helper `f()` — repo này đã có pattern đó), **không** string
   trần. `mongodb.mdc` yêu cầu, và đây chính là loại lỗi vừa xảy ra: bản plan trước viết
   `salesCloseTime: 1` — một field **không tồn tại** — Mongo trả về im lặng thiếu field, TS không bắt
   được vì projection là plain object. `docPath` biến lỗi này thành lỗi compile.
2. **`sales.openAt` là optional** (`openAt?: Date` trong `DrawSales` —
   [`game-core/src/types/draw.ts`](../../../packages/game-core/src/types/draw.ts)) → `HubDrawRow.openAt`
   cũng phải optional/nullable. Kỳ `scheduled` chưa từng mở bán **không có** `openAt`.
3. **`result` là optional** (`result?: DrawResult`) → `result.publishedAt` có thể thiếu cả nhánh. Map
   sang `publishedAt: string | null`, **không** `undefined` (§5).

`HubDrawRow` khai ở `infras/repos/types/` theo `mongodb.mdc` (type tách khỏi repo class).

### 3.2 `BettingStatsRepository.getRowsByDrawIds(drawIds)`

**File:** `packages/game-keno-application/src/infras/repos/betting-stats-repo.ts`

```typescript
  /**
   * Stats mỏng cho nhiều kỳ — nguồn số liệu bảng Ops Hub.
   *
   * Projection SIÊU MỎNG vì cùng lý do `findNotFinal`: doc stats ~33KB (heatmap 80 số,
   * exposure theo playType, topPotential, topCombos…). Hub ~158 kỳ × 33KB ≈ 5MB mỗi poll nếu
   * đọc full — không dùng được.
   *
   * `exposure.worstCaseByPlayType` (map theo playType) KHÔNG lấy — chỉ cần khi mở trang chi
   * tiết 1 kỳ, lúc đó `GetOpsSnapshotUseCase` đọc full doc như cũ.
   *
   * `updatedAt` lớn nhất trong tập trả về là MỘT THÀNH PHẦN của ETag ở route — không phải
   * toàn bộ (xem §7: chỉ `updatedAt` là không đủ).
   *
   * @param drawIds - Lấy từ `listUnfinishedDrawRows`. Rỗng → trả `[]`, KHÔNG gọi DB.
   */
  async getRowsByDrawIds(drawIds: string[]): Promise<HubStatsRow[]>
```

Projection: `drawId`, `final`, `updatedAt`, `totals.revenue`, `totals.entries`, `totals.sets`,
`totals.largeBetCount`, `exposure.worstCaseTotal`.

Điểm phải làm đúng:

- **`limit: drawIds.length`** — chặn trần 500 im lặng. `$in` đúng N id nên không thể quá N.
- Dùng `docPath<KenoDrawBettingStatsDoc>()` cho mọi dot-path (helper `f()` đã có sẵn ở `applyDelta`
  dòng 124), không string trần.
- **Kỳ chưa có stats doc** (chưa ai cược) sẽ **không** có dòng trả về. Use-case merge bằng `Map` và
  coi thiếu = zeros, **không** để `undefined` lọt ra DTO (§6.2).

### 3.3 `OpsAlertRepository.countByDrawIds(drawIds)`

**File:** `packages/game-keno-application/src/infras/repos/ops-alert-repo.ts`

```typescript
  /**
   * Đếm alert đang mở theo TỪNG kỳ — 1 aggregate cho N kỳ.
   *
   * Vì sao KHÔNG tái dùng `countByStatus`/`countActiveCritical`: 2 method đó đếm GLOBAL
   * (không filter `drawId`), phục vụ badge tổng trên trang Operations 1 kỳ. Hub cần biết
   * kỳ NÀO có alert để tô đỏ đúng dòng → phải group theo `drawId`.
   *
   * Vì sao 1 aggregate thay vì N lần `countDocuments`: N kỳ × 1 count = N round-trip, vi
   * phạm ràng buộc "số query không tỷ lệ với số kỳ".
   *
   * Chỉ đếm alert CHƯA resolved (`status $in [New, Ack]`) — alert đã resolved không hiện
   * trên Hub (hub là bảng việc đang mở, không phải lịch sử).
   *
   * @returns Map `drawId` → `{ open, critical }`. Kỳ không có alert KHÔNG xuất hiện trong Map.
   */
  async countByDrawIds(drawIds: string[]): Promise<Map<string, HubAlertCounts>>
```

```typescript
    if (drawIds.length === 0) {
      return new Map();
    }

    const rows = await this.aggregate([
      {
        $match: {
          drawId: { $in: drawIds },
          status: { $in: [OpsAlertStatus.New, OpsAlertStatus.Ack] },
        },
      },
      {
        $group: {
          _id: "$drawId",
          open: { $sum: 1 },
          critical: {
            $sum: { $cond: [{ $eq: ["$severity", OpsAlertSeverity.Critical] }, 1, 0] },
          },
        },
      },
    ]);
```

So sánh **phải** dùng member của const-object (`OpsAlertStatus.New`, `OpsAlertSeverity.Critical`),
**không** literal `"new"`/`"critical"` — `code-quality-standards.mdc` §5.3.

> **Đã verify khi lập plan:** `OpsAlertBase`
> ([`packages/game-core/src/types/ops-alert.ts:42-59`](../../../packages/game-core/src/types/ops-alert.ts))
> có `drawId: string` **required** — mọi alert đều gắn 1 kỳ, không có alert global. `severity:
> OpsAlertSeverity`, `status: OpsAlertStatus` đúng tên như dùng ở trên. Không cần zone riêng cho alert
> global.

## 4. Index mới — đo trước, thêm sau

`packages/game-keno/src/indexes/index.ts` hiện có 2 index cho `KenoCollections.OpsAlerts`:

| Index | Key | Dùng cho |
|---|---|---|
| `idx_status_createdAt` | `{ status: 1, createdAt: -1 }` | list/count theo status (badge global) |
| `idx_drawId_dedupeKey_unique` | `{ drawId: 1, dedupeKey: 1 }` | chống bắn trùng |

`countByDrawIds` filter `{ drawId: $in, status: $in }`. Index nào phục vụ?

- `idx_status_createdAt`: `status $in` là prefix → IXSCAN, nhưng **không** lọc được `drawId` trong
  index → phải FETCH mọi alert đang mở rồi filter ở tầng sau.
- `idx_drawId_dedupeKey_unique`: `drawId $in` là prefix → IXSCAN theo drawId, nhưng `status` không có
  trong index → FETCH từng doc để đọc `status`.

Cả hai đều FETCH. Số alert đang mở thường nhỏ (vài chục), nên **có thể** chấp nhận không thêm index.

**Đo bằng `explain()` trước:**

```javascript
db.kenoOpsAlerts.explain("executionStats").aggregate([
  { $match: { drawId: { $in: [/* 158 id */] }, status: { $in: ["new", "ack"] } } },
  { $group: { _id: "$drawId", open: { $sum: 1 } } },
]);
```

Đọc `totalDocsExamined` vs `nReturned`. Nếu `totalDocsExamined` > ~500 → thêm index:

```typescript
  {
    collection: KenoCollections.OpsAlerts,
    key: { drawId: 1, status: 1 },
    options: { name: "idx_drawId_status" },
    purpose:
      "Ops Hub countByDrawIds: đếm alert đang mở theo từng kỳ cho N kỳ trong 1 aggregate. " +
      "ESR: drawId $in là equality prefix, status $in lọc tiếp trong index → không FETCH. " +
      "KHÔNG dùng idx_drawId_dedupeKey_unique được vì thiếu status; KHÔNG dùng idx_status_createdAt " +
      "được vì drawId không nằm trong index.",
  },
```

**Không thêm index theo cảm giác** — `mongodb.mdc` yêu cầu mỗi index có `purpose` giải trình được, và
index thừa làm chậm mọi lần ghi alert (evaluator upsert nhiều lần/phút × D kỳ).

Draws và stats **không cần index mới**: `idx_status_drawId_desc` và `idx_drawId_unique` đã phục vụ đúng.

## 5. DTO — RAW, không dẫn xuất

**File mới:** `packages/game-keno-application/src/use-cases/operations/dto/hub-snapshot.dto.ts`

### 5.1 Một dòng kỳ quay

```typescript
/**
 * Một dòng kỳ quay trên Ops Hub — gộp draw + stats + alert counts.
 *
 * TOÀN BỘ field là RAW. Server KHÔNG dẫn xuất `gate`/`stage`/`health`/`ageInStage` —
 * xem JSDoc `OpsHubSnapshotOutput.serverNow` để biết vì sao.
 */
export interface OpsHubDrawRow {
  /** `YYYY-MM-DD.NNN`. Khoá của mọi action trên dòng này. */
  drawId: string;
  /** Số kỳ trong ngày (1-based), hiển thị ngắn trên card/cột `Kỳ`. */
  drawNo: number;
  /** Trạng thái kỳ (raw). Đầu vào dẫn xuất `SaleGate`/`OpsStage` ở FE. */
  status: DrawStatus;
  /** Giờ quay (ISO 8601). Mốc so `now` để biết đã qua giờ quay chưa. */
  drawTime: string;
  /**
   * Hết giờ nhận cược (ISO 8601) — KHOÁ CỨNG tự động, không phải mốc "phải đóng sổ".
   *
   * Đây là TRỤC CHÍNH của cả trang Hub: `now >= closeAt` là điều kiện duy nhất xác định
   * `SaleGate = Ended` (không phải `status`). Xem guideline §1.3.
   */
  closeAt: string;
  /**
   * Bắt đầu nhận cược (ISO 8601), `null` khi kỳ CHƯA TỪNG mở bán.
   *
   * `null` là thông tin nghiệp vụ, không phải thiếu dữ liệu: kỳ `scheduled` chưa mở bán
   * thì không có `openAt`. FE dùng `openAt` để tính `ageSinceOpen` cho outlier
   * "kỳ chết không ai cược" (guideline §9.2).
   */
  openAt: string | null;
  /**
   * Thời điểm publish kết quả (ISO 8601), `null` khi chưa có kết quả.
   *
   * Cặp với `settledAt` để phát hiện `NeedsResettle`: `settledAt < publishedAt` nghĩa là
   * kết quả đã bị sửa SAU khi kết sổ → tiền đã trả có thể sai, phải kết sổ lại.
   */
  publishedAt: string | null;
  /** Thời điểm kết sổ gần nhất (ISO 8601), `null` khi chưa kết sổ. */
  settledAt: string | null;
  /**
   * Lần ghi cuối vào doc kỳ (ISO 8601).
   *
   * Mốc DUY NHẤT để tính `ageInStage` cho `Settling`/`Voiding` — hai chặng này không có
   * timestamp riêng trên doc. Vì vậy field này BẮT BUỘC có, không phải "nice to have".
   */
  updatedAt: string;

  /** Doanh thu (VND). `0` khi kỳ chưa có cược nào. */
  revenue: number;
  /** Số vé. `0` khi chưa có cược. */
  entries: number;
  /** Số bộ số. `0` khi chưa có cược. */
  sets: number;
  /** Số cược lớn vượt ngưỡng `largeBetAmount`. `0` khi chưa có cược. */
  largeBetCount: number;
  /**
   * Exposure xấu nhất (VND) — **RAW, CHƯA cap** theo `payoutCaps`.
   *
   * Đây là giá trị đúng như lưu trong doc stats (`exposure.worstCaseTotal`). Cap chỉ được
   * áp lúc build response chi tiết 1 kỳ, và cần `worstCaseByPlayType` (map theo playType)
   * mà Hub KHÔNG lấy vì quá nặng (§6.3).
   *
   * UI BẮT BUỘC dán nhãn `(chưa cap)` và KHÔNG so với `exposureWarnPct` — ngưỡng đó là
   * % của cap, so với RAW là so hai mẫu số khác nhau (guideline §3.4).
   */
  exposureRaw: number;
  /** Số alert chưa resolved (`new` + `ack`). `0` khi không có. */
  alertsOpen: number;
  /** Số alert `critical` chưa resolved — quyết định tô đỏ dòng. `0` khi không có. */
  alertsCritical: number;
  /** `true` khi worker đã chốt stats (`final`) — số liệu không đổi nữa. */
  statsFinal: boolean;
}
```

Đặt tên `exposureRaw` (không phải `exposure`) là **có chủ đích**: tên field tự nó cảnh báo người đọc
code rằng số này chưa cap. Đổi tên là cách rẻ nhất để chặn lỗi so sai mẫu số lặp lại.

### 5.2 Snapshot

```typescript
/** Snapshot toàn bộ Ops Hub — 1 response cho 1 lần poll. */
export interface OpsHubSnapshotOutput {
  /** Các kỳ chưa hoàn thành, sort `drawId` GIẢM (kỳ mới nhất trước). */
  rows: OpsHubDrawRow[];
  /**
   * Giờ SERVER lúc tạo snapshot (ISO 8601) — BẮT BUỘC dùng thay `Date.now()` của client.
   *
   * Toàn bộ `SaleGate`/`OpsStage`/`StageHealth` dẫn xuất bằng cách so `now` với `closeAt`
   * và `drawTime`. Laptop staff lệch giờ 5 phút sẽ phân loại SAI cả trang (hiện `Ended`
   * cho kỳ đang bán, hoặc ngược lại) mà KHÔNG có triệu chứng nào khác.
   *
   * FE tính `offset = serverNow − Date.now()` một lần mỗi lần fetch, rồi dùng
   * `Date.now() + offset` cho mọi phép dẫn xuất. Xem guideline §1.3.
   */
  serverNow: string;
  /**
   * `true` khi số kỳ chưa hoàn thành VƯỢT trần `limit` → `rows` bị cắt.
   *
   * FE PHẢI hiện banner destructive (guideline §8.1). Im lặng bỏ sót kỳ là lỗi nặng nhất
   * của trang này: người vận hành thấy 300 kỳ và tưởng đó là tất cả.
   */
  truncated: boolean;
  /** Ngưỡng từ config để FE tô màu — KHÔNG hardcode ở FE. */
  thresholds: OpsHubThresholds;
  /** Nhịp poll (giây), từ `ops.stats.tickSeconds`. FE dùng làm `refetchInterval` + `staleTime`. */
  pollSeconds: number;
  /**
   * Khoảng cách giữa 2 kỳ (phút) — Keno 8, Bingo18 6, CẤU HÌNH ĐƯỢC per-tenant.
   *
   * FE cần để: (a) tính ngưỡng `awaitingResultWarnSec` ≈ 2 × chu kỳ (guideline §8.3);
   * (b) render trục Focus Rail. Hardcode ở FE là bug chờ nổ khi tenant đổi cấu hình.
   */
  drawIntervalMinutes: number;
  /** Số giây trước giờ quay mà `closeAt` được đặt — Keno 60, Bingo18 30. Cấu hình được. */
  salesCloseBeforeSeconds: number;
}
```

### 5.3 KHÔNG có `summary` — quyết định quan trọng

Bản trước có `OpsHubSummary` với `awaitingSettleCount`, `sellingCount`, `stuckCount`… **Bỏ hoàn toàn.**

Lý do (§1.2): mọi con số đó phụ thuộc `now` và các phép so timestamp mà **chỉ FE mới có ngữ cảnh đầy
đủ** (clock offset đã hiệu chỉnh, ngưỡng per-chặng đã đọc từ `thresholds`). Đếm ở server bằng `status`
thô sẽ ra số **khác** với bảng người vận hành đang nhìn.

FE tính toàn bộ KPI từ `rows` trong **một** vòng `useMemo` (p1-01), theo
`vercel-react-best-practices` §7.6 (gộp nhiều lần lặp thành 1). Chi phí ~160 phần tử = không đáng kể.

Hệ quả tích cực: bớt một nguồn sự thật thứ hai. KPI và bảng **không thể** lệch nhau vì cùng derive từ
`rows`.

`OpsHubThresholds` gồm các ngưỡng per-chặng theo guideline §8.3: `pendingCloseWarnSec`,
`pendingCloseStuckSec`, `awaitingResultWarnSec`, `awaitingResultStuckSec`, `awaitingSettleWarnSec`,
`awaitingSettleStuckSec`, `processingStuckSec`, `largeBetAmount`, `exposureWarnPct`.
**Các field `*Sec` chưa có trong `OpsConfig`** → phải thêm (guideline §11 dòng `Config`). Nếu p0-03
merge trước khi config có, tạm dùng default `as const` trong use-case kèm `TODO` chỉ rõ plan config.

## 6. Use-case

```typescript
/**
 * Snapshot vận hành ĐA KỲ — nguồn duy nhất cho trang Ops Hub.
 *
 * Khác `GetOpsSnapshotUseCase` (1 kỳ, chi tiết sâu: heatmap, topCombos, topAccounts):
 * use-case này đọc NHIỀU kỳ nhưng MỎNG, chỉ đủ dựng 1 dòng bảng. Trang chi tiết 1 kỳ vẫn
 * gọi `GetOpsSnapshotUseCase` như cũ — không nhân bản logic.
 *
 * RÀNG BUỘC 1 — đúng 4 query, KHÔNG tỷ lệ với số kỳ. Với mô hình bán cả ngày, `rows` LUÔN
 * ~120-160 kỳ (không phải "chỉ khi backlog"). Mọi thay đổi làm số query phụ thuộc N là
 * regression, không phải "tối ưu sau".
 *
 * RÀNG BUỘC 2 — trả RAW + `serverNow`, KHÔNG dẫn xuất trạng thái. `status = salesOpen` là
 * `Selling` hay `PendingClose` phụ thuộc `now` vs `closeAt`; đếm ở server bằng `status` thô
 * cho ra số KHÔNG khớp bảng người vận hành đang nhìn. Xem plan §1.2.
 *
 * 2 tầng `Promise.all` (không phải 1): tầng 2 cần `drawIds` từ tầng 1. Không dùng `$lookup`
 * gộp thành 1 round-trip vì nó buộc materialize doc stats 33KB, mất lợi ích projection.
 */
export class GetOpsHubSnapshotUseCase extends UseCase<OpsHubSnapshotInput, OpsHubSnapshotOutput> {
```

### 6.1 `getData()` tách khỏi `execute()`

Y hệt `GetOpsSnapshotUseCase` (dòng 51-53) để route lấy được nguyên liệu ETag (max `updatedAt`,
`rows.length`, `oldestDrawId`) **trước khi** serialize response.

### 6.2 Merge bằng `Map`, thiếu = zeros

Kỳ chưa có stats doc **không** có dòng trong query 3 → điền `0`. Tuyệt đối **không** để `undefined`
lọt DTO (FE render `NaN`). Tương tự alert counts.

Xây `Map` một lần rồi lookup O(1), **không** `rows.map(r => stats.find(...))` — đó là O(N×M), với
N=160 và M=160 là 25.600 phép so cho mỗi lần poll (`vercel-react-best-practices` §7.2).

Ngoại lệ duy nhất được `null`: `openAt`, `publishedAt`, `settledAt` — `null` ở đây **có nghĩa nghiệp
vụ** (chưa mở bán / chưa có kết quả / chưa kết sổ), khác hẳn "thiếu dữ liệu".

### 6.3 Exposure — câu hỏi mở đã ĐÓNG: `worstCaseTotal` là RAW

Bản plan trước để ngỏ *"phải kiểm tra `worstCaseTotal` là RAW hay đã cap?"*. **Đã kiểm tra, có câu trả
lời trong code** (`packages/game-keno/src/entities/betting-stats.ts:116-117`):

> `Tổng worst-case RAW toàn kỳ (VND) = Σ worstCaseByPlayType (CHƯA cap)`
> Cap `maxPerDraw` cho pick8/9/10 **chỉ áp lúc BUILD RESPONSE / eval alert** qua
> `capExposureByPlayType`.

Hệ quả cho plan này:

1. Hub trả **`exposureRaw`** (tên field nói rõ), **không** gọi `capExposureByPlayType` — vì cap cần
   `worstCaseByPlayType` (map theo playType) mà projection không lấy.
2. **KHÔNG** tính `exposurePct` ở server. Có **hai** tỉ lệ khác nhau và trộn chúng là bug đã tồn tại
   trong guideline cũ (§3.4):
   - `exposureVsRevenuePct = worstCaseRaw / revenue` → chỉ để **đọc** ("bao nhiêu lần doanh thu").
   - `exposureVsCapPct = cappedWorstCase / Σ pickXMaxPerDraw` → thứ duy nhất được so `exposureWarnPct`.
3. P1 chỉ hiện RAW + nhãn `(chưa cap)` + tooltip. `exposureVsCapPct` để P2 nếu có nhu cầu thật —
   lúc đó thêm `worstCaseByPlayType` vào projection và chấp nhận payload lớn hơn.

**Hiện số sai kèm ngưỡng sai tệ hơn không hiện ngưỡng.**

### 6.4 `limit`

```typescript
/**
 * Trần số kỳ trả về mỗi lần poll.
 *
 * Cơ sở: Bingo18 ~158 kỳ/ngày (`drawIntervalMinutes = 6`), Keno ~119 (`= 8`). 300 ≈ 2 ngày
 * backlog — đủ rộng cho mọi tình huống vận hành thật đã gặp (sự cố lớn nhất ghi nhận là
 * 112 kỳ tồn trong 1 ngày).
 *
 * KHÔNG giảm dưới 200: một ngày Bingo18 bình thường đã 158 kỳ, giảm nữa là `truncated`
 * gần như luôn `true` → banner cảnh báo mất ý nghĩa vì lúc nào cũng hiện.
 */
const DEFAULT_HUB_LIMIT = 300;
```

Trả `truncated: rows.length >= limit`. Dùng `>=` chứ không `===` để an toàn nếu repo trả nhiều hơn
limit vì lý do nào đó.

## 7. Route + ETag

**File mới:** `apps/backoffice/src/app/api/games/keno/operations/hub-snapshot/route.ts`

Sao đúng pattern route snapshot 1 kỳ đang có (tìm bằng
`rg -n 'ops-snapshot' apps/backoffice/src/app/api`). Bắt buộc:

1. **ETag ghép 3 thành phần**: `max(stats.updatedAt)` + `rows.length` + `oldestDrawId`.
   Chỉ `updatedAt` của stats là **không đủ**: kỳ mới `Published` (chưa có cược → chưa có stats doc) sẽ
   không làm `updatedAt` đổi → client bị 304 và **không thấy kỳ mới**. Đây là case dễ sai nhất.

   Cân nhắc thêm `max(draw.updatedAt)` vào ETag: mọi chuyển trạng thái kỳ đều ghi `updatedAt` trên doc
   draw, nên nó bắt được cả thay đổi không liên quan stats (settle xong, void…). Rẻ vì đã có trong
   projection.

2. **`serverNow` làm ETag lệch mỗi lần** — cạm bẫy: nếu ghép `serverNow` vào ETag thì **không bao giờ**
   có 304. Đừng ghép. `serverNow` chỉ đi trong body; client nào nhận 304 thì dùng lại `serverNow` cũ +
   `Date.now()` để tự trôi thời gian (guideline §1.3 đã dùng offset nên vẫn đúng).

3. **Trả `304` khi `If-None-Match` khớp** — bỏ hẳn body. Với ~160 dòng, đây là khoản tiết kiệm lớn nhất
   của cả trang: poll 10s × 8 giờ = 2880 lần/staff, phần lớn nên là 304.

4. **`Cache-Control: private, no-store`** — dữ liệu vận hành, không cho CDN cache.

5. **Auth + permission** giống route operations hiện có, không tự phát minh.

## 8. Test

### 8.1 Unit use-case

| Case | Kỳ vọng |
|---|---|
| 0 kỳ chưa hoàn thành | `rows: []`, `truncated: false`, **không** gọi query 3/4 |
| 3 kỳ, cả 3 có stats | 3 dòng đúng số |
| 3 kỳ, 1 kỳ chưa có stats doc | Dòng đó `revenue/entries/sets/exposureRaw = 0`, **không** `undefined` |
| Kỳ `scheduled` chưa mở bán | `openAt === null` (không `undefined`, không chuỗi rỗng) |
| Kỳ chưa có kết quả | `publishedAt === null` |
| Kỳ chưa kết sổ | `settledAt === null` |
| Kỳ có `settledAt < publishedAt` | Cả 2 field có mặt để FE derive `NeedsResettle` |
| 1 kỳ có 2 alert (1 critical) | `alertsOpen: 2`, `alertsCritical: 1` |
| Kỳ không có alert | `alertsOpen: 0`, `alertsCritical: 0` (không thiếu field) |
| Số kỳ = `limit` | `truncated: true` |
| Số kỳ < `limit` | `truncated: false` |
| Mọi response | `serverNow` có mặt, ISO 8601 hợp lệ |
| Mọi response | `drawIntervalMinutes` + `salesCloseBeforeSeconds` khớp config, **không** hardcode |
| Response | **KHÔNG** có field `summary`, **KHÔNG** có `exposurePct`, **KHÔNG** có `gate`/`stage`/`health` |

Ba case cuối cùng là **test chống regression thiết kế**: nếu ai đó thêm lại `summary` hoặc derive
trạng thái ở server, test phải đỏ.

### 8.2 Performance — bắt buộc, đây là lý do plan tồn tại

Seed **200 kỳ** chưa hoàn thành + stats doc + alerts vào test DB, rồi:

| Đo | Ngưỡng |
|---|---|
| Số DB call | **Đúng 4** (đếm bằng spy trên repo, không đoán) |
| Payload response | < 250KB cho 200 kỳ (tăng từ 200KB vì DTO có thêm 4 timestamp/dòng) |
| p95 latency | < 400ms |
| `totalDocsExamined` mỗi query | Ghi lại `explain()` vào PR description |

So sánh trực tiếp: gọi `GetOpsSnapshotUseCase` 200 lần → ghi lại số query để chứng minh khoảng cách.

### 8.3 ETag

| Case | Kỳ vọng |
|---|---|
| Poll 2 lần, không có gì đổi | Lần 2 nhận `304`, không body |
| Có cược mới (stats `updatedAt` đổi) | `200` + ETag mới |
| Kỳ mới `Published`, chưa có cược | `200` + ETag mới (**case dễ sai nhất**) |
| Kỳ settle xong, rời danh sách | `200` + ETag mới |
| Kỳ chuyển `salesOpen → salesClosed`, chưa ai cược thêm | `200` + ETag mới (nhờ `draw.updatedAt` trong ETag) |
| Chỉ `serverNow` trôi, không có gì đổi | Vẫn `304` — chứng minh `serverNow` **không** nằm trong ETag |

Hai case cuối là test cho quyết định §7.1 và §7.2.

## 9. Review checklist

- [ ] Đúng **4** DB call, có test spy chứng minh (§8.2). Không tin đọc code.
- [ ] Projection dùng **`sales.closeAt`** và **`sales.openAt`** — grep xác nhận **không còn**
      `salesCloseTime` ở đâu: `rg -n 'salesCloseTime' packages apps .cursor`.
- [ ] Projection có đủ `result.publishedAt`, `settledAt`, `updatedAt` — thiếu 1 trong 3 là không derive
      được chặng.
- [ ] Mọi dot-path qua `docPath<T>()` / helper `f()`, **không** string trần (`mongodb.mdc`).
      Đây là rào chắn duy nhất chặn lặp lại lỗi `salesCloseTime`.
- [ ] Mọi `findMany*` truyền `limit` **tường minh**: `rg -n 'findMany' <file>` — không call nào thiếu.
- [ ] `truncated` được set và FE sẽ dùng (ghi rõ trong DTO JSDoc).
- [ ] **`serverNow` có trong response**, và **không** nằm trong ETag.
- [ ] **KHÔNG** có `summary`, **KHÔNG** có `exposurePct`, **KHÔNG** có `gate`/`stage`/`health` trong DTO.
- [ ] `exposureRaw` đặt đúng tên (không phải `exposure`), JSDoc ghi rõ **chưa cap**.
- [ ] `drawIntervalMinutes` + `salesCloseBeforeSeconds` đọc từ config, không hardcode.
- [ ] So sánh alert dùng `OpsAlertStatus.New` / `OpsAlertSeverity.Critical`, không literal string
      (`code-quality-standards.mdc` §5.3).
- [ ] Merge stats/alerts bằng `Map`, không `.find()` trong `.map()`.
- [ ] Không `undefined` lọt DTO. `null` chỉ ở `openAt`/`publishedAt`/`settledAt` và có JSDoc giải nghĩa.
- [ ] Đã đo `explain()` cho cả 3 query DB, dán kết quả vào PR.
- [ ] Index mới (nếu thêm) có `purpose` giải trình vì sao 2 index cũ không dùng được.
- [ ] Không đổi `GetOpsSnapshotUseCase` — Hub là use-case **mới**, trang Operations 1 kỳ không regress.
- [ ] `pnpm check-types` + `pnpm lint` xanh.

## 10. Rủi ro

| Rủi ro | Mức | Xử lý |
|---|---|---|
| Projection sai tên field (im lặng thiếu data) | 🔴 | `docPath<T>()` biến thành lỗi compile. Đã xảy ra thật với `salesCloseTime` — checklist grep |
| Trần 500 im lặng cắt mất kỳ | 🔴 | `limit` tường minh + `truncated` + FE banner + test §8.1 |
| Thiếu `updatedAt` → không tính được `ageInStage` cho `Settling` | 🔴 | Trong projection bắt buộc; test §8.1 |
| Ai đó thêm lại `summary` / derive ở server | 🟡 | Test chống regression §8.1 (3 case cuối) + JSDoc use-case ghi rõ RÀNG BUỘC 2 |
| `exposureRaw` bị so với `exposureWarnPct` | 🟡 | Tên field + JSDoc + checklist. Guideline §3.4 giải thích đầy đủ |
| Payload phình khi backlog lớn | 🟡 | Projection mỏng + đo §8.2 với 200 kỳ. Nếu > 250KB → giảm field, **không** tăng trần |
| ETag miss kỳ mới | 🟡 | Ghép `rows.length` + `oldestDrawId` + `max(draw.updatedAt)`. Test §8.3 case 3, 5 |
| `serverNow` lọt vào ETag → không bao giờ 304 | 🟡 | Test §8.3 case cuối |
| Ngưỡng `*Sec` chưa có trong `OpsConfig` | 🟡 | Default `as const` + `TODO` trỏ plan config. **Không** hardcode rải rác |
| Index mới làm chậm ghi alert | 🟢 | Đo trước, chỉ thêm khi `explain()` chứng minh cần |
| Ai đó "tối ưu" thành `$lookup` | 🟢 | JSDoc use-case ghi rõ lý do 2 tầng |

## 11. Rollback

Toàn bộ là **code mới** (use-case mới, repo method mới, route mới, DTO mới) — không sửa code đang chạy.
Revert commit là đủ, không có state cần dọn. Index mới (nếu tạo) có thể `dropIndex` an toàn vì không có
query nào khác dựa vào nó.