---
name: ""
overview: ""
todos: []
isProject: false
---

# p1-01 — Hub shell: 1 query, derive client-side, Zone 2 hai khối, Day Flow

> **Phase:** P1 · **Status:** ⏳ pending · **Phụ thuộc:** p0-03 · **Chặn:** p1-02
> **UI chuẩn:** [`ops-hub-page-layout.guideline.md`](./ops-hub-page-layout.guideline.md) §1.3–1.4, §2–4, §6–8
> **Scope:** Keno only. Bingo18 ở [p1-04](./p1-04-bingo18-port.plan.md)
> **Ràng buộc số 1:** đúng **1 query** cho toàn trang. Không zone nào tự fetch.
> **Ràng buộc số 2:** mọi phép dẫn xuất trạng thái nằm trong **1 hàm pure duy nhất**, chạy **1 lần/tick**.

## 0. Bản này khác bản trước ở đâu

| Bản trước | Sửa |
|---|---|
| Zone 2 là **1 dải 6 KPI card** đồng nhất | **Hai khối 2:1** — (A) phễu vận hành, (B) tiền đang bán (guideline §3). Hai nhóm kỳ khác bản chất, không nhồi 1 dải |
| `summary` đọc từ server | **Server không còn `summary`** (p0-03 §5.3). FE derive toàn bộ KPI từ `rows` — 1 nguồn sự thật |
| Không có Zone 3 | **Day Flow 2 tầng + brush** (guideline §4, §1.4) — thứ duy nhất trả lời "cả ngày có ổn không" |
| `Date.now()` cho mọi so sánh thời gian | **Clock offset từ `serverNow`** — laptop lệch giờ phân loại sai cả trang mà không có triệu chứng |
| `refetchOnWindowFocus: false` | **`true` + `staleTime = pollSeconds`** (guideline §7.1) — workflow 2 tab, tắt là xem dữ liệu cũ |
| `exposurePct` từ server | Bỏ. Hiện `exposureRaw` + nhãn `(chưa cap)`, **không** so `exposureWarnPct` (guideline §3.4) |
| Không nói gì về chi phí derive | **§5: ngân sách CPU mỗi tick** — đây là phần dễ giết trang nhất khi N ≈ 160 |

## 1. Mục tiêu

Trang `/games/keno/operations-hub` chạy được với **1 query**, hiện Zone 1–4 (header, hai khối
Zone 2, Day Flow, alert banner). Zone 5A/5B (bảng) ở p1-02.

Kết thúc plan: mở trang thấy phễu chặng đúng số, Day Flow 150 cột không cuộn ngang, poll đúng nhịp,
có `304` khi không đổi, và **không** re-render toàn trang mỗi giây.

## 2. Nav registry

`apps/backoffice/src/lib/nav-registry.ts` là nguồn chân lý duy nhất cho path + param.

Đã verify shape thật: `NavPage` là const-object, `NAV_REGISTRY` là `Record<NavPage, NavPageDefinition>`
**toàn phần** → thêm key mà quên định nghĩa là **lỗi compile** (đúng thiết kế, không cast).

Entry mẫu là `NavPage.GameOperations` (dòng 417-430):

```ts
[NavPage.GameOperationsHub]: {
  pathTemplate: "/games/:gameKey/operations-hub",
  label: "Trung tâm vận hành",
  group: NavGroupKey.Game,
  segments: [GAME_KEY_SEGMENT],
  params: {
    // Tab lọc chặng của bảng 5A (p1-02) + cửa sổ Focus Rail (§4).
    gate: { urlKey: "gate", kind: NavParamKind.Enum, values: HUB_GATE_TABS, hint: "..." },
    focus: DRAW_ID_PARAM,
    span: { urlKey: "span", kind: NavParamKind.Text, hint: "Số card Focus Rail (7-21)." },
  },
  autoNavigate: true,
  intent: "Trung tâm vận hành ĐA KỲ — theo dõi ~119 kỳ/ngày, chốt sổ/kết sổ theo lô. " +
    "KHÁC `GameOperations` (1 kỳ, chi tiết sâu): hub không có heatmap/live feed.",
},
```

Param `gate`/`focus`/`span` khai **ngay từ p1-01** dù p1-02 mới dùng: registry là nơi duy nhất mô tả
URL contract, thêm sau sẽ quên. Icon `Layers` (phân biệt với `Activity` của trang 1 kỳ).

**Không** hardcode path trong component — import từ registry.

## 3. `page.tsx` — chỉ Suspense + provider

Theo `operations-page-ui.mdc` §13:

```tsx
export default function KenoOperationsHubPage() {
  return (
    <Suspense fallback={<HubSkeleton />}>
      <HubProvider>
        <HubPageHeader />
        <HubOverviewSection />   {/* Zone 2: hai khối 2:1 (§4) */}
        <HubDayFlow />           {/* Zone 3: dải 2 tầng + brush (§5) */}
        <HubAlertBanner />       {/* Zone 4 (§6) */}
        {/* Zone 5A/5B — p1-02 */}
      </HubProvider>
    </Suspense>
  );
}
```

`HubSkeleton` khớp **chiều cao** layout thật (2 khối Zone 2 ~140px + Day Flow 48px + gap). Skeleton
lệch chiều cao gây layout shift (`vercel-react-best-practices` §1.5) — trang monitor 8 tiếng thì mỗi
lần nhảy là một lần mỏi mắt.

## 4. Query — 1 query, và ngân sách hiệu năng của vòng poll

### 4.1 Sự thật phải biết trước khi cấu hình poll: **ETag gần như KHÔNG bao giờ khớp**

p0-03 §7 đặt cược lớn vào `304` ("phần lớn nên là 304"). Với mô hình bán cả ngày (guideline §0.1),
**giả định đó sai phần lớn thời gian**:

- ETag ghép `max(stats.updatedAt)`. Có **hàng trăm kỳ đang nhận cược** → worker `$inc` stats liên tục
  → `max(updatedAt)` đổi **mỗi vài giây**.
- Nghĩa là trong giờ cao điểm, ETag đổi nhanh hơn nhịp poll → **mọi** lần poll đều `200`.
- `304` chỉ thực sự xảy ra ban đêm / lúc không có cược mới.

Hệ quả **bắt buộc** cho thiết kế: không được coi ETag là lớp bảo vệ chính. Phải đo và siết **hai** thứ
khác — payload và chi phí DB. Vẫn giữ ETag (đêm, và lúc tab ẩn) nhưng ghi rõ trong PR rằng lợi ích của
nó là **có điều kiện**, để người sau không kết luận sai khi thấy `200` liên tục là "ETag hỏng".

### 4.2 Đo trước: cái gì thực sự đắt

| Thành phần | Chi phí thật cho 200 kỳ | Kết luận |
|---|---|---|
| Payload JSON | ~250 byte/dòng × 200 = **~50KB raw, ~7KB gzip** | **Không phải vấn đề.** Đừng tối ưu tên field |
| Query draws | 200 doc FETCH, doc ~2–5KB → **~0.6MB đọc** | Chấp nhận được ở P1 (§4.3) |
| **Query stats** | 200 doc FETCH, doc **~33KB** → **~6.6MB đọc/lần poll** | 🔴 **Đây là chi phí đắt nhất của cả trang** |
| Query alerts | vài chục doc | Không đáng kể |
| Derive client-side | 200 dòng × ~20 phép so | Không đáng kể **nếu** chạy 1 lần/tick (§5) |

Điểm phải hiểu về MongoDB: **`projection` KHÔNG làm giảm lượng đọc document.** Mongo fetch **nguyên**
doc 33KB vào memory rồi mới cắt field. Projection chỉ tiết kiệm **băng thông mạng**, không tiết kiệm
**I/O + WiredTiger cache**.

Với 3 staff cùng trực, poll 10s: `6.6MB × 3 × 6 lần/phút ≈ 120MB/phút` đọc từ cache chỉ để lấy
~1.6KB dữ liệu thật. Đây là chỗ phải sửa, không phải payload.

### 4.3 Hai việc BẮT BUỘC bổ sung vào p0-03 (amendment)

Hai mục dưới đây thuộc backend nhưng **phát sinh từ hành vi poll định nghĩa ở plan này**, nên chốt ở
đây và ghi cross-ref sang p0-03.

**(1) Covering index cho `getRowsByDrawIds` — biến `6.6MB` thành `0` doc đọc.**

Projection của p0-03 §3.2 gồm đúng 8 field, **tất cả đều là scalar** (không array → index không
multikey) nên query **covered được**:

```ts
{
  collection: KenoCollections.BettingStats,
  key: {
    drawId: 1,
    final: 1,
    updatedAt: 1,
    "totals.revenue": 1,
    "totals.entries": 1,
    "totals.sets": 1,
    "totals.largeBetCount": 1,
    "exposure.worstCaseTotal": 1,
  },
  options: { name: "idx_hub_row_covering" },
  purpose:
    "Ops Hub getRowsByDrawIds: COVERED query — doc stats ~33KB (numberFreq 80 số, byPlayType, " +
    "topPotential) nên FETCH 200 doc = ~6.6MB đọc MỖI lần poll MỖI staff. 8 field trong " +
    "projection đều nằm trong index này + `_id: 0` → IXSCAN + PROJECTION_COVERED, " +
    "totalDocsExamined = 0. Thứ tự key: drawId trước (equality $in), phần còn lại chỉ để phủ " +
    "projection nên thứ tự không quan trọng.",
}
```

Điều kiện để covered thật sự xảy ra — **cả ba** phải đúng, sai 1 là mất hoàn toàn lợi ích:

1. Projection có **`_id: 0`** (p0-03 đã có).
2. Projection **không** chứa field nào ngoài 8 field trong index. Thêm 1 field sau này = mất covered
   **âm thầm** → JSDoc method phải ghi cảnh báo này.
3. Filter chỉ `{ drawId: { $in } }`, không thêm điều kiện trên field ngoài index.

Chi phí ghi: worker `$inc` stats mỗi tick cho mỗi kỳ đang bán → mỗi lần ghi phải cập nhật 1 entry của
index này. ~150 kỳ / 10s ≈ **15 index-write/s**, mỗi entry ~100 byte. Không đáng kể so với 6.6MB/poll
tiết kiệm được. Nhưng **phải đo**, không suy luận (§8.2).

**Verify bắt buộc bằng `explain`**, không tin code review:

```js
db.kenoDrawBettingStats.find(
  { drawId: { $in: [/* 200 id */] } },
  { _id: 0, drawId: 1, final: 1, updatedAt: 1, "totals.revenue": 1, "totals.entries": 1,
    "totals.sets": 1, "totals.largeBetCount": 1, "exposure.worstCaseTotal": 1 },
).explain("executionStats");
```

Chấp nhận **chỉ khi**: `totalDocsExamined === 0` và winning plan có stage `PROJECTION_COVERED`.
`totalDocsExamined === 200` = index chưa cover, dừng lại tìm field lọt ra ngoài.

**(2) Cache TTL ngắn ở cấp module trong route — K staff chỉ tốn 1 lần đọc DB.**

Snapshot hub là **cùng một dữ liệu cho mọi staff** (không phân theo tenant/user — hub xem toàn bộ kỳ).
5 staff poll lệch nhau vài giây hiện đang tạo 5 lần đọc DB cho cùng nội dung.

```ts
/**
 * Cache snapshot hub ở cấp module — chia sẻ giữa các request đồng thời trên cùng instance.
 *
 * VÌ SAO an toàn: snapshot hub KHÔNG phụ thuộc user/tenant (hub đọc toàn bộ kỳ chưa hoàn
 * thành). Auth/permission vẫn kiểm TRƯỚC khi đọc cache — cache chỉ bỏ qua phần DB.
 *
 * TTL ngắn hơn nhịp poll nhiều lần: staff vẫn thấy dữ liệu tươi (lệch tối đa TTL), nhưng
 * K staff poll trong cùng cửa sổ TTL chỉ tốn 1 lần đọc DB.
 *
 * `React.cache()` KHÔNG dùng được ở đây — nó chỉ dedupe TRONG 1 request
 * (`vercel-react-best-practices` §3.3, §3.6). Cần cache CROSS-request.
 */
const HUB_SNAPSHOT_CACHE_TTL_MS = 2_000;
```

Ba điểm phải đúng:

1. **Auth/permission kiểm trước, luôn luôn.** Cache đặt sau guard, không trước. Đây là ranh giới an
   toàn, không phải chi tiết thứ tự code.
2. **`serverNow` lấy từ payload đã cache** → có thể cũ tới `TTL`. 2s là trong sai số cho phép của mọi
   phép dẫn xuất (ngưỡng nhỏ nhất là `MIN_SALES_WINDOW_SECONDS` = 60s). **Không** nâng TTL lên hàng
   chục giây: lúc đó `serverNow` bắt đầu nói dối.
3. **ETag tính từ payload đã cache** → client vẫn nhận `304` đúng.

**Không** dùng Redis/`@megawin/cache` cho việc này ở P1: TTL 2s trên cùng instance đã bắt trọn phần
lớn trùng lặp; thêm 1 network hop cho thứ sống 2 giây là lỗ.

**Query draws chưa cần covering index.** Doc draw nhỏ hơn stats một bậc độ lớn (~2–5KB), và index phủ
9 field sẽ nặng bảo trì trong khi doc draw đổi mỗi lần chuyển trạng thái. Đo `explain` trước; chỉ thêm
nếu `executionTimeMillis` của query 2 vượt ~40ms với 200 kỳ.

### 4.4 Cấu hình query

**File:** `_lib/use-hub-query.ts`

```ts
/**
 * Query DUY NHẤT của trang Ops Hub — mọi zone `select` slice từ đây.
 *
 * `refetchInterval` đọc `pollSeconds` từ server (`ops.stats.tickSeconds`), KHÔNG hardcode:
 * đổi nhịp tick trong Game Config phải có hiệu lực ngay, không cần deploy FE.
 *
 * `refetchOnWindowFocus: true` + `staleTime = pollSeconds` là một CẶP, không tách:
 * workflow thật là 2 tab (hub + trang chi tiết mở tab mới — guideline §7), quay lại tab hub
 * phải thấy dữ liệu mới. `staleTime` là thứ chặn burst: alt-tab 20 lần trong 1 nhịp cũng chỉ
 * fetch 1 lần. Tắt `refetchOnWindowFocus` (như plan cũ) làm staff đọc số cũ vài phút mà
 * không biết.
 */
export function useHubQuery() {
  return useQuery({
    queryKey: kenoKeys.opsHub(),
    queryFn: fetchOpsHubSnapshot,
    refetchInterval: (q) => (q.state.data?.pollSeconds ?? DEFAULT_POLL_SECONDS) * 1000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    staleTime: (q) => (q.state.data?.pollSeconds ?? DEFAULT_POLL_SECONDS) * 1000,
    // Giữ data cũ khi refetch → không nháy skeleton mỗi nhịp.
    placeholderData: keepPreviousData,
  });
}
```

1. **`queryKey` theo factory sẵn có.** Đã verify: `apps/backoffice/src/lib/query-keys/keno.ts` có
   `kenoKeys` với `opsSnapshot: (drawId) => [MODULE, "ops-snapshot", drawId]`. Thêm
   `opsHub: () => [MODULE, "ops-hub"] as const` vào **đúng file đó**, không khai key trong `_lib/`.
2. **`placeholderData: keepPreviousData`** bắt buộc. Không có nó, mỗi nhịp bảng nháy skeleton → trang
   không dùng được để monitor 8 giờ.
3. **`refetchIntervalInBackground: false`** (mặc định của React Query, ghi tường minh để không ai
   "sửa cho chạy nền").
4. `DEFAULT_POLL_SECONDS = 10` khai `as const`, chỉ là fallback trước tick đầu.

### 4.5 Chỉ báo tuổi dữ liệu — bắt buộc, và KHÔNG được re-render mỗi giây

Guideline §7.1 yêu cầu chip `Cập nhật 3s trước`, chuyển amber khi `> 3 × pollSeconds`.

Đã có **tiền lệ đúng** trong repo — dùng lại y hệt, không phát minh:
[`keno/operations/page.tsx:46-61`](../../../apps/backoffice/src/app/(main)/games/keno/operations/page.tsx)
`LastUpdatedBadge` đọc `qc.getQueryState(...)?.dataUpdatedAt` rồi ghi thẳng vào
`spanRef.current.textContent` trong `setInterval` — **0 re-render React**.

```tsx
// Ghi thẳng DOM qua ref, KHÔNG setState: badge này nhích mỗi giây, còn cây con dưới nó
// có Day Flow 150 cột. setState mỗi giây = re-render 150 cột mỗi giây để đổi 1 chữ số.
// Tiền lệ: `LastUpdatedBadge` của trang Operations 1 kỳ (page.tsx:46).
```

Đây là **quy tắc chung của cả trang**, không riêng badge này: xem §5.3.

## 5. Derive trạng thái — 1 hàm pure, 1 lần/tick, và cách KHÔNG tick mỗi giây

Đây là phần kỹ thuật khó nhất của p1-01. Làm sai thì trang vẫn "đúng" nhưng nóng máy và giật khi
người trực để mở 8 tiếng — loại lỗi không ai phát hiện lúc review.

### 5.1 Hàm pure duy nhất

**File:** `_lib/derive-draw-state.ts`

```ts
/**
 * Dẫn xuất trạng thái vận hành của 1 kỳ — HÀM PURE DUY NHẤT của cả trang.
 *
 * Implement ĐÚNG bảng dẫn xuất guideline §1.3, theo đúng thứ tự (match đầu tiên thắng).
 * Cấm rải `if (status === ...)` trong component: hai chỗ dẫn xuất là hai chỗ sẽ lệch nhau,
 * và lệch ở đây nghĩa là KPI nói 4 trong khi bảng có 17.
 *
 * `gate` và `stage` tính ĐỘC LẬP — hàm stage KHÔNG nhận `gate` làm input (guideline §1.3
 * điểm 1). Nhờ vậy test được từng bảng riêng, không có thứ tự phụ thuộc ngầm.
 *
 * @param nowMs - Giờ SERVER đã hiệu chỉnh (`Date.now() + clockOffsetMs`), KHÔNG phải
 *   `Date.now()` thô. Xem §5.2 — đây là tham số dễ truyền sai nhất và sai thì im lặng.
 */
export function deriveDrawState(
  row: OpsHubDrawRow,
  nowMs: number,
  thresholds: OpsHubThresholds,
  drawIntervalMinutes: number,
): DrawOpsState;

/** Kết quả dẫn xuất — 3 trục độc lập + mốc tuổi + lý do (hiện ở inline expand p1-03). */
export interface DrawOpsState {
  gate: SaleGate;
  stage: OpsStage;
  health: StageHealth;
  /** Tuổi trong chặng (giây). `null` với `Selling` (không có nghĩa). */
  ageInStageSec: number | null;
  /** Giây còn lại tới `closeAt` — CHỈ có nghĩa với `PendingOpen`/`Halted` (guideline §1.3). */
  remainingSec: number | null;
  /** Vì sao ra `stage`/`health` này — chuỗi ngắn, hiện ở inline expand. */
  reason: string;
}
```

Ba điều bắt buộc:

1. **Parse timestamp 1 lần.** `row.*` là string ISO. `new Date(iso).getTime()` cho 200 dòng × 5 field
   = 1000 lần parse **mỗi tick**. Parse trong cùng `useMemo` dựng `rows`, cache kết quả dưới dạng
   `number` (epoch ms) — sau đó mọi phép so là so số (`vercel-react-best-practices` §7.4).
2. **`switch` trên union phải exhaustive** — Biome `nursery/useExhaustiveSwitchCases` (error) sẽ bắt
   nếu thiếu case `DrawStatus`. Thêm status mới vào enum thì compiler chỉ ra đây. Đó là tính năng.
3. **`SaleGate`/`OpsStage`/`StageHealth` khai `const object as const` + type dẫn xuất**
   (`code-quality-standards.mdc` §5.3), **không** union string literal trần. So sánh luôn qua member
   (`OpsStage.PendingClose`), không viết `"pending_close"`.

### 5.2 Clock offset — điểm sai im lặng

```ts
/**
 * Lệch giờ giữa server và máy staff (ms). `serverNow − Date.now()` lúc fetch.
 *
 * BẮT BUỘC dùng `Date.now() + clockOffsetMs` cho MỌI phép dẫn xuất. Toàn bộ `gate`/`stage`
 * dựa trên so `now` với `closeAt`/`drawTime`; laptop lệch 5 phút sẽ phân loại SAI cả trang
 * (hiện `Ended` cho kỳ đang bán, hoặc ngược lại) mà KHÔNG có triệu chứng nào khác —
 * không lỗi, không cảnh báo, chỉ là số sai.
 *
 * Tính lại mỗi lần fetch thành công. Giữ ở `useRef`, KHÔNG state: nó không dùng để render,
 * chỉ là tham số của phép tính (`vercel-react-best-practices` §5.12).
 */
const clockOffsetMsRef = useRef(0);
```

Cảnh báo phòng ngừa: nếu `|offset| > 60_000` → hiện chip amber `Giờ máy lệch 5p12s so với server`.
Không tự sửa gì (đã dùng offset nên vẫn đúng), nhưng người trực cần biết vì mọi công cụ khác trên máy
họ đang hiển thị sai giờ.

**Checklist grep bắt buộc:** `rg -n 'Date\.now\(\)' apps/backoffice/src/app/\(main\)/games/keno/operations-hub`
— chỉ được có match ở **1 chỗ**: nơi tính `nowMs`. Mọi match khác là bug.

### 5.3 KHÔNG tick mỗi giây — dùng lịch biên (boundary scheduling)

Bản trước ghi *"`nowTick` nhích mỗi 1s qua `startTransition`"*. Với 200 dòng + Day Flow 158 cột, tick
1s nghĩa là **re-render toàn cây 3600 lần/giờ** để đổi vài chữ số.

Nhận xét then chốt: **`gate`/`stage`/`health` KHÔNG đổi liên tục — chúng đổi tại các thời điểm ĐÃ
BIẾT TRƯỚC.** Một kỳ chuyển `Selling → PendingClose` chính xác tại `closeAt`, chuyển `warn → stuck`
chính xác tại `ageInStage = stuckSec`. Tất cả đều tính được.

Kiến trúc đúng — **hai đồng hồ tách biệt**:

| Đồng hồ | Nhịp | Ai dùng | Cơ chế |
|---|---|---|---|
| **Boundary** | Bất định — hẹn đúng mốc tiếp theo | `gate`/`stage`/`health`, phễu Zone 2, Day Flow, sort bảng | `setTimeout` tới `nextBoundaryAt`, tự hẹn lại |
| **Tick 1s** | 1s | Chỉ **chữ số đếm** (`còn 12p`, `treo 47p`, `Cập nhật 3s trước`) | Ghi DOM qua `ref`, **0 re-render** |

```ts
/**
 * Thời điểm gần nhất mà BẤT KỲ kỳ nào đổi `gate`/`stage`/`health`.
 *
 * Tính cùng lúc với `deriveDrawState`: mỗi kỳ trả về mốc đổi tiếp theo của nó
 * (`closeAt`, `drawTime`, `stageStart + warnSec`, `stageStart + stuckSec`), lấy `min` toàn
 * bộ — theo `vercel-react-best-practices` §7.10 (loop 1 vòng, KHÔNG sort để tìm min).
 *
 * Hẹn `setTimeout` tới đúng mốc đó thay vì tick 1s: với 200 kỳ + 158 cột Day Flow, tick 1s
 * là 3600 lần re-render toàn cây mỗi giờ để đổi vài chữ số. Mốc đổi trạng thái thực tế
 * cách nhau 6–8 phút (1 kỳ chốt cược) → ~10 lần re-render/giờ.
 *
 * Clamp `[1s, 60s]`: cận dưới chống bão timeout nếu nhiều mốc trùng nhau; cận trên bảo đảm
 * vẫn tự tỉnh nếu logic tính mốc có sai sót — an toàn hơn là treo mãi.
 */
function scheduleNextBoundary(nextBoundaryAtMs: number, nowMs: number): number;
```

Số liệu để thấy khoảng cách: tick 1s = **3600 re-render/giờ**; boundary scheduling ≈ **10–15
re-render/giờ** (mỗi kỳ chốt cược + vài lần đổi health). Chênh **~250 lần**.

`startTransition` cho lần re-render theo boundary (`vercel-react-best-practices` §5.11) — nó không cấp
bách, không được chặn click của người dùng.

### 5.4 Chữ số đếm — 1 listener duy nhất, ghi DOM

```tsx
/**
 * Hiện thời lượng trôi theo giây (`treo 47p12s`) mà KHÔNG re-render React.
 *
 * Ghi `textContent` qua ref trong 1 interval DÙNG CHUNG cấp trang — không phải mỗi ô một
 * `setInterval` (200 dòng × 1 interval = 200 timer, §4.1 `vercel-react-best-practices` về
 * dedupe listener toàn cục).
 *
 * Tiền lệ trong repo: `LastUpdatedBadge` (keno/operations/page.tsx:46-61).
 */
function RelativeDuration({ sinceMs }: { sinceMs: number }) { ... }
```

Một `IntervalRegistry` cấp trang: các `RelativeDuration` đăng ký `ref` + `sinceMs` vào một `Set`, 1
`setInterval(1000)` lặp qua `Set` ghi `textContent`. Hủy đăng ký khi unmount.

### 5.5 Một vòng lặp duy nhất cho MỌI thứ dẫn xuất

```ts
/**
 * Dẫn xuất TẤT CẢ trong 1 lần lặp qua `rows` — KHÔNG nhiều `.filter()` liên tiếp.
 *
 * Cần cùng lúc: state từng dòng, phễu Zone 2 (5 chặng × {count, revenue}), tổng khối (B),
 * median theo gate (outlier §9.2 guideline), biên chốt cược, `nextBoundaryAt`, dữ liệu
 * Day Flow. Viết 8 lần `rows.filter(...)` là 8 lần lặp 200 phần tử
 * (`vercel-react-best-practices` §7.6: gộp nhiều lần lặp thành 1).
 *
 * Median: thu `revenue[]` theo gate trong cùng vòng lặp rồi `toSorted()` MỘT lần mỗi gate
 * (không `sort()` — mutate mảng thuộc React Query cache, §7.12).
 */
const derived = useMemo(() => { /* 1 vòng for, trả về mọi thứ */ },
  [rows, boundaryTick, thresholds, drawIntervalMinutes]);
```

Dependency là **`boundaryTick`** (số nguyên tăng mỗi lần chạm mốc), **không** `nowMs`, và **không**
`Date.now()`. Truyền `nowMs` trực tiếp vào dependency là bug: nó đổi mỗi render → `useMemo` vô nghĩa.

**Biên chốt cược** (guideline §1.4.1) tính trong cùng vòng: kỳ có `closeAt` lớn nhất mà `closeAt <= now`.
Loop 1 vòng tìm max, **không** sort (`vercel-react-best-practices` §7.10).

## 6. Provider + context

**File:** `_lib/use-hub-context.tsx`

Theo `vercel-composition-patterns` §2.2-2.3: context có `state`/`actions`/`meta`, provider là nơi
**duy nhất** biết state được quản lý thế nào. React 19 → dùng `use(HubContext)`, không `useContext`.

```tsx
/** Giá trị context Ops Hub — UI component chỉ đọc interface này, không biết nguồn state. */
interface HubContextValue {
  state: {
    /** `undefined` khi đang load lần đầu. */
    snapshot: OpsHubSnapshotOutput | undefined;
    /** Dòng kỳ ĐÃ kèm state dẫn xuất — thứ mọi zone render. */
    rows: readonly DerivedRow[];
    /** Phễu Zone 2 khối (A): 5 chặng × {count, revenue}. */
    funnel: OpsFunnel;
    /** Tổng khối (B) + median theo gate + danh sách outlier. */
    selling: SellingSummary;
    /** `drawId` của kỳ ở biên chốt cược. `null` khi chưa có kỳ nào qua `closeAt`. */
    boundaryDrawId: string | null;
    isFetching: boolean;
    error: Error | null;
  };
  actions: {
    /** Refetch thủ công — nút "Làm mới" + phím `r`. */
    refresh: () => void;
  };
  meta: {
    /** Giờ server hiệu chỉnh lúc derive gần nhất — cho component cần mốc so. */
    nowMs: number;
    /** Lệch giờ máy (ms) — để hiện cảnh báo §5.2. */
    clockOffsetMs: number;
  };
}
```

`DerivedRow = OpsHubDrawRow & DrawOpsState` — gộp một lần, không để component tự gọi
`deriveDrawState`. Selection/filter/sort thêm ở p1-02; khai interface sao cho mở rộng được mà không
phải sửa mọi consumer.

## 7. Zone 1–4

### 7.1 Zone 1 — PageHeader

Tái dùng `PageHeader` sẵn có. Nội dung: icon gradient + title "Trung tâm vận hành" + subtitle
"Keno · ~119 kỳ/ngày"; chip tuổi dữ liệu (§4.5); chip cảnh báo lệch giờ (§5.2, chỉ khi có); nút
"Chi tiết kỳ" → `/games/keno/operations` (path từ nav-registry); nút "Làm mới" (disable khi
`isFetching`).

**KHÔNG có `DrawSelector`** — hub xem tất cả kỳ. Ghi comment giải thích để người sau không "thêm cho
đủ" (trang Operations có, hub cố ý không).

Hiện **ngày tài chính** đang xem: nó là mốc mà `pendingCloseStuckSec` bám vào (guideline §8.3 — kỳ lọt
sang ngày sau làm sai rollup, xem p0-01).

### 7.2 Zone 2 — hai khối 2:1 (guideline §3)

**Khối (A) — phễu vận hành.** Chỉ kỳ `gate = Ended`. 5 đoạn đúng thứ tự dòng chảy
`PendingClose → AwaitingDraw → AwaitingResult → AwaitingSettle → Settling/Voiding`.

1. Mỗi đoạn **3 dòng**: nhãn chặng · số kỳ (`text-2xl tabular-nums`) · **tổng doanh thu chặng**
   (`text-xs tabular-nums`). Không bao giờ count trơ — mọi thẻ đếm số phải kèm số tiền.
2. **Chiều rộng tỉ lệ số kỳ** (`flex-grow` + `min-w`) → phễu phình ở `Chờ kết sổ` = backlog, nhận ra
   bằng **hình dạng** không cần đọc số.
3. **Màu chỉ cho chặng có `health ≠ ok`.** `PendingClose`/`AwaitingDraw` = slate **kể cả khi đông** —
   đông ở đây là bình thường (batch 1 giờ). Đoạn 0 kỳ → chữ mờ, **giữ chỗ**, không ẩn (ẩn làm layout
   nhảy mỗi boundary tick).
4. `animate-pulse` chỉ trên **icon** của đoạn có `stuck > 0`.
5. **Dòng dưới cùng — bất thường rời rạc**: chip cho `gate ∈ {PendingOpen, Halted}` và
   `stage ∈ {NeedsResettle, NeverOpened}`. Bốn loại này số lượng cực nhỏ nhưng nghiêm trọng; để thành
   đoạn phễu thì bề rộng ~0px và biến mất. Chip `PendingOpen` kèm nút **Mở bán** (action nằm ở p1-02,
   p1-01 chỉ render chip + số).
6. **Bấm đoạn = set `gate`/`stage` trên URL** (nuqs) → p1-02 đọc để filter bảng 5A. p1-01 chỉ ghi URL,
   chưa có bảng để filter — đúng, và đó là cách 2 plan nối nhau không cần refactor.

**Khối (B) — tiền đang bán.** Kỳ `gate = Open`. Không có action → **không** count to, hiện **tiền** to:
`Σ revenue` (`text-3xl`); `Σ entries` vé · `Σ sets` bộ; `Σ exposureRaw` + nhãn **`(chưa cap)`**; chip
`⚠ N kỳ doanh thu bất thường`.

**Dòng "so cùng giờ hôm qua" — HOÃN sang P2.** Guideline §3.5 nêu 2 lựa chọn; chọn cái rẻ: P1 hiện
**`Doanh thu TB/kỳ`** tính từ chính `rows` (chi phí 0 query), vẫn bắt được lệch ở mức tổng. Lý do
hoãn: thêm 1 query đọc `system_settle_game_daily` sẽ phá ràng buộc "4 query cố định" của p0-03 ngay ở
plan đầu tiên của P1, và giá trị (nội suy xấp xỉ theo giờ) chưa đủ để đánh đổi.

**Exposure — cấm so `exposureWarnPct`.** `exposureRaw` chưa cap; `exposureWarnPct` là % của cap
(guideline §3.4). P1 chỉ hiện RAW + nhãn + tooltip giải thích. Hiện số sai kèm ngưỡng sai tệ hơn không
hiện ngưỡng.

### 7.3 Zone 3 — Day Flow (guideline §4 + §1.4)

p1-01 làm **tầng 1 (Overview) + tầng 2 (Stepper)**. **Tầng 3 (Focus Rail) hoãn sang p1-02** — nó click
để focus dòng bảng, mà bảng chưa tồn tại ở p1-01. Làm rail trước bảng là làm nút không có đích.

Ràng buộc kỹ thuật:

1. **1 kỳ = 1 cột `div`**, `flex-1 min-w-[3px]`, tổng cao ~48px (tầng chặng 20px + tầng tiền 28px).
   158 cột × ~6px ≈ 950px → vừa content width, **không cuộn ngang**. Cuộn ngang là mất toàn cảnh =
   mất lý do tồn tại của zone.
2. **Không SVG/canvas/chart lib.** `div` + flex. Chart lib là +40–80KB bundle cho thứ 158 `<div>` làm
   được (`vercel-react-best-practices` §2.1).
3. **Hover dùng `useRef` + CSS, KHÔNG setState.** 158 cột × mousemove với setState = bão render
   (§5.12). Dùng `onPointerEnter` ghi vào ref + ghi `textContent` của 1 tooltip dùng chung.
4. **`memo()` theo `[derived.dayFlow, boundaryTick]`** — không re-render khi selection/filter ở bảng
   đổi (p1-02).
5. **Cụm ≥3 cột cùng màu bất thường liền nhau** → vẽ **1 khối** kèm nhãn `112 kỳ chờ kết sổ`. Sự cố là
   một *khối*, phải đọc như một khối.
6. **Brush**: 1 `div bg-primary/15` + 2 handle, `pointer` event, **snap theo kỳ** không theo pixel
   (guideline §1.4.4). Ghi `focus`/`span` vào nuqs (`history: "replace"`).
7. **Auto-follow biên tắt ngay khi người dùng pan/zoom tay** (guideline §1.4.7), chỉ nút `Về biên` bật
   lại. Tự dịch khi người ta đang đọc là lỗi UX nghiêm trọng nhất của loại UI này.

### 7.4 Zone 4 — Alert Banner

Chỉ render khi có bất thường (banner luôn hiện = banner bị bỏ qua). Hiện **tất cả** điều kiện đúng
(stack dọc), mỗi cái là một việc khác nhau:

| Ưu tiên | Điều kiện | Style | Nút |
|---|---|---|---|
| 1 | `truncated === true` | destructive | — |
| 2 | `stage = NeedsResettle` có kỳ | destructive | `Xem N kỳ` |
| 3 | `stage = NeverOpened` có kỳ | destructive | `Xem N kỳ` |
| 4 | `health = stuck` có kỳ | destructive | `Xem N kỳ` |
| 5 | `gate = PendingOpen` có kỳ | amber | `Mở bán N kỳ` (p1-02) |
| 6 | `gate = Halted` có kỳ | amber | `Xem N kỳ` |

**`truncated` ưu tiên 1** vì nó nghĩa là *"số bạn đang xem không đầy đủ"* — nghiêm trọng hơn mọi cảnh
báo về dữ liệu đã thấy. Đây là hàng rào chống bẫy trần-500-im-lặng (p0-03 §1.1).

**Âm thanh (guideline §8.2):** 1 tiếng `ping` duy nhất khi `stuckCount` tăng **từ 0 lên > 0**, mặc
định **tắt**, lưu ở zustand. Không lặp, không ping cho warning. So `prevStuckCount` bằng `useRef`,
**không** `useEffect` + state.

## 8. State — nuqs / zustand (guideline §6)

**nuqs (URL):** `gate`, `stage`, `focus`, `span`. `history: "replace"` + `clearOnDefault: true`.

Bản plan cũ từ chối URL vì "history rác" — **tiền đề sai**: `nuqs` mặc định `replace`, không push
entry. Lý do phải vào URL: ca trực 8 tiếng, tab hub bị F5 / restore session là chuyện thường; mất
filter là mất ngữ cảnh sự cố. Và gửi link `?focus=2026-09-07.104` là cách báo sự cố nhanh nhất.

**zustand + `persist`:** `soundOnCritical`, `dayFlowVisible`, `density` (p1-02 dùng). Có `version`
trong `persist` để migrate, và **bọc `try/catch`** khi đọc localStorage — `getItem` **throw** trong chế
độ ẩn danh (`vercel-react-best-practices` §4.4).

**KHÔNG persist:** clock offset (phải tính lại mỗi phiên), và selection (p1-02 — restore selection cũ
rồi bấm `Kết sổ` = kết sổ tập kỳ không ai chọn trong phiên này; đây là ranh giới an toàn tiền thật).

## 9. Test

### 9.1 Hàm derive — test đơn vị, không cần render

Đây là **nơi tập trung toàn bộ logic** của trang → test dày ở đây phủ cho mọi zone. Bảng test map 1-1
với bảng dẫn xuất guideline §1.3:

| Input | `gate` | `stage` |
|---|---|---|
| `salesOpen`, `now < closeAt` | `Open` | `Selling` |
| `salesOpen`, `now >= closeAt` | `Ended` | `PendingClose` |
| `scheduled`, `now < closeAt` | `PendingOpen` | `Selling` |
| `scheduled`, `now >= closeAt` | `Ended` | **`NeverOpened`** |
| `salesClosed`, `now < drawTime` | `Halted`/`Ended` theo `closeAt` | `AwaitingDraw` |
| `salesClosed`, `now >= drawTime` | `Ended` | `AwaitingResult` |
| `published`, `settledAt = null` | `Ended` | `AwaitingSettle` |
| `published`, `publishedAt > settledAt` | `Ended` | **`NeedsResettle`** |
| `settling` | `Ended` | `Settling` |
| `voiding` | `Halted`/`Ended` | `Voiding` |

Case biên **bắt buộc có**:

| Case | Kỳ vọng |
|---|---|
| `now === closeAt` chính xác | `Ended` (điều kiện là `>=`, không `>`) |
| `PendingOpen`, `remaining = 59s` | `health = stuck` (`< MIN_SALES_WINDOW_SECONDS` = 60) |
| `PendingOpen`, `remaining = 61s` | `health = warn` (`< 3 × 60`) |
| `PendingOpen`, `remaining = 200s` | `health = ok` |
| Kỳ `salesOpen` không có `openAt` | Không crash, `ageSinceOpen = null` |
| `settledAt === publishedAt` (bằng nhau) | **KHÔNG** `NeedsResettle` (điều kiện là `>`) |
| Thêm `DrawStatus` mới vào enum | **Lỗi compile** ở `switch` (exhaustive) |

Case cuối là test chống regression thiết kế: status mới xuất hiện phải buộc người thêm nó nghĩ về hub.

`MIN_SALES_WINDOW_SECONDS` **import** từ
[`game-core/src/utils/draw-schedule.ts`](../../../packages/game-core/src/utils/draw-schedule.ts),
không copy giá trị `60`. Nó là predicate duy nhất trả lời "kỳ này còn đáng mở bán không"
(`isDrawSlotCreatable`); hai định nghĩa lệch nhau = hub báo "còn kịp" trong khi phần tạo kỳ đã coi
slot đó hết hạn.

### 9.2 Backend performance — verify amendment §4.3

| Đo | Ngưỡng | Cách đo |
|---|---|---|
| `totalDocsExamined` query stats (200 kỳ) | **`0`** | `explain("executionStats")`, xác nhận `PROJECTION_COVERED` |
| `executionTimeMillis` query stats | < 30ms | cùng explain |
| `totalDocsExamined` query draws | ≤ 200 | explain (FETCH là chấp nhận được, ghi số vào PR) |
| 5 request đồng thời trong cửa sổ TTL | **1** lần đọc DB | spy trên repo |
| Ghi stats khi có index mới | so p95 write **trước/sau** | 🔴 phải đo, không suy luận |
| Payload gzip 200 kỳ | < 15KB | DevTools |
| p95 latency route | < 400ms | k6/autocannon staging |

Dòng "ghi stats" là điểm đánh đổi duy nhất của covering index — **bắt buộc đo và dán số vào PR**. Nếu
p95 write tăng > 20% → xét bỏ 3 field ít dùng nhất khỏi index (chấp nhận FETCH) và đo lại.

### 9.3 Frontend performance

| Đo | Ngưỡng |
|---|---|
| Số request khi load trang | **Đúng 1** (grep `useQuery` trong `operations-hub/` = 1 match) |
| Re-render/phút khi idle (React DevTools Profiler) | **≤ 2** (boundary + poll). **KHÔNG** 60 |
| Re-render khi chữ số đếm nhích | **0** (ghi DOM qua ref) |
| Render Day Flow 158 cột | < 16ms (1 frame) |
| Derive 200 dòng | < 5ms — `performance.mark` quanh `useMemo` |
| Số `setInterval` đang chạy | **1** (registry dùng chung, không 200) |
| Alt-tab ra/vào 10 lần trong 1 nhịp | **1** request (`staleTime`) |
| Tab ẩn 1 phút | **0** request |
| Đổi `tickSeconds` trong Game Config | Nhịp poll đổi **không cần** deploy FE |

Dòng "re-render/phút khi idle" là test cho quyết định §5.3 — **bắt buộc**, dán số Profiler vào PR. Nếu
thấy ~60 lần/phút thì đã lỡ implement tick 1s.

### 9.4 Component

| Case | Kỳ vọng |
|---|---|
| `snapshot === undefined` | Skeleton, không crash |
| `error !== null` | Thông báo + nút thử lại, **không** trang trắng |
| `rows: []` | Phễu 5 đoạn `0` giữ chỗ (không ẩn), Day Flow rỗng có nhãn, **không** banner |
| 1 kỳ `stuck` | Đoạn phễu đỏ + icon pulse + banner destructive + cột Day Flow đỏ |
| Có `PendingOpen` | Chip amber ở dòng dưới phễu **và** banner amber |
| `truncated = true` | Banner destructive đầu tiên |
| Mọi thứ bình thường | **Không** banner nào |
| Máy lệch giờ 5 phút (mock `Date.now`) | Phễu/Day Flow vẫn **đúng** + chip cảnh báo lệch giờ |
| 158 kỳ | Day Flow **không** cuộn ngang |

Case "lệch giờ" là test cho §5.2 — mock `Date.now()` lệch 5 phút, assert phân loại **không đổi**.

### 9.5 Layout shift

Load với throttle 3G: skeleton → data **không** nhảy chiều cao. Boundary tick (1 kỳ đổi chặng) **không**
làm layout nhảy (đoạn phễu 0 kỳ giữ chỗ).

## 10. Review checklist

- [ ] **Đúng 1** `useQuery` trong `operations-hub/`. Grep xác nhận.
- [ ] `refetchOnWindowFocus: true` **và** `staleTime = pollSeconds` — cặp, không tách.
- [ ] `refetchInterval` đọc `pollSeconds`; grep `15000`/`10000` — không có hardcode.
- [ ] `kenoKeys.opsHub` thêm vào `src/lib/query-keys/keno.ts`, không khai trong `_lib/`.
- [ ] Path từ `nav-registry.ts`; param `gate`/`focus`/`span` đã khai.
- [ ] **Covering index** `idx_hub_row_covering` đã tạo, `explain` cho `totalDocsExamined = 0` — dán vào PR.
- [ ] JSDoc `getRowsByDrawIds` cảnh báo: thêm field vào projection = **mất covered âm thầm**.
- [ ] Cache TTL đặt **sau** auth guard; TTL ≤ 2s; ETag tính từ payload đã cache.
- [ ] Đã đo p95 **write** stats trước/sau khi thêm index — dán số vào PR.
- [ ] `deriveDrawState` là **1 hàm pure duy nhất**; grep `status ===` trong component = 0 match.
- [ ] Hàm derive `stage` **không** nhận `gate` làm input (2 bảng độc lập).
- [ ] `SaleGate`/`OpsStage`/`StageHealth` là **`const object as const`**; không literal string trần.
- [ ] `switch` trên `DrawStatus` exhaustive (Biome `useExhaustiveSwitchCases`).
- [ ] `Date.now()` chỉ xuất hiện **1 chỗ** (tính `nowMs`). Grep xác nhận.
- [ ] `MIN_SALES_WINDOW_SECONDS` **import** từ `game-core`, không copy `60`.
- [ ] **Không tick 1s** cho state dẫn xuất — boundary scheduling. Profiler ≤ 2 re-render/phút idle.
- [ ] Chữ số đếm ghi DOM qua `ref`, **1** interval dùng chung cấp trang.
- [ ] Derive **1 vòng lặp**, không nhiều `.filter()` liên tiếp; `toSorted()` không `sort()`.
- [ ] Day Flow bằng `div`+flex, **không** SVG/canvas/chart lib; hover dùng `ref` không setState.
- [ ] Zone 2 là **hai khối 2:1**, không phải dải 6 KPI đồng nhất.
- [ ] Mọi thẻ đếm số **kèm số tiền**; đoạn 0 kỳ **giữ chỗ** không ẩn.
- [ ] `exposureRaw` có nhãn `(chưa cap)`, **không** so `exposureWarnPct`.
- [ ] Mọi tín hiệu màu **kèm icon** (a11y, guideline §9.3).
- [ ] `tabular-nums` mọi số. Không `text-[10px]`/`text-[11px]`.
- [ ] Banner tự ẩn khi bình thường; `truncated` ưu tiên 1; stack tất cả điều kiện đúng.
- [ ] nuqs `history: "replace"` + `clearOnDefault`; zustand `persist` có `version` + `try/catch`.
- [ ] **Không** persist clock offset.
- [ ] Đã verify `304` (ban đêm/không có cược mới) — và ghi rõ trong PR rằng `200` liên tục giờ cao
      điểm là **đúng thiết kế** (§4.1), không phải ETag hỏng.
- [ ] `pnpm check-types` + `pnpm lint` xanh.
- [ ] Trang `/games/keno/operations` **không** regress (mở kiểm tra bằng tay).

## 11. Rủi ro

| Rủi ro | Mức | Xử lý |
|---|---|---|
| **Query stats FETCH 200 doc × 33KB mỗi poll mỗi staff** | 🔴 | Covering index §4.3(1) + `explain` bắt buộc `totalDocsExamined = 0` |
| **Máy staff lệch giờ → phân loại sai cả trang, không triệu chứng** | 🔴 | Clock offset §5.2 + grep `Date.now()` + test §9.4 + chip cảnh báo |
| Dẫn xuất rải trong component → KPI lệch bảng | 🔴 | 1 hàm pure + grep checklist + test §9.1 |
| Tick 1s → 3600 re-render/giờ, trang nóng máy sau 8 tiếng | 🟡 | Boundary scheduling §5.3 + Profiler §9.3 |
| Covering index làm chậm ghi stats | 🟡 | Đo p95 write trước/sau; > 20% thì bỏ field ít dùng khỏi index |
| Cache TTL đặt trước auth → rò dữ liệu | 🔴 | Checklist + review bắt buộc; cache **sau** guard |
| `truncated` bị bỏ qua → tin số không đầy đủ | 🔴 | Banner ưu tiên 1 + test |
| Kỳ vọng sai về ETag (`200` liên tục bị coi là bug) | 🟡 | §4.1 ghi rõ + note trong PR |
| Zone 2 quay về dải 6 KPI khi implement | 🟡 | Checklist + guideline §3 là chuẩn |
| `exposureRaw` bị so `exposureWarnPct` | 🟡 | Tên field + JSDoc + checklist (guideline §3.4) |
| 200 `setInterval` cho chữ số đếm | 🟡 | Registry dùng chung + test đếm timer §9.3 |
| Day Flow cuộn ngang khi màn hình hẹp | 🟢 | `min-w-[3px]` + test 158 kỳ; hẹp quá thì ẩn zone (zustand), không cuộn |
| Thêm route key làm `tsc` báo lỗi hàng loạt | 🟢 | Xử lý từng case, **không** cast/`as any` |

## 12. Rollback

Trang mới, route mới. Code đang chạy chỉ bị chạm 2 chỗ: 1 entry `nav-registry.ts` và 1 key
`kenoKeys.opsHub`. Revert commit.

**Index mới** `idx_hub_row_covering`: `dropIndex` an toàn — không query nào khác dựa vào nó. Nhưng nếu
đã chạy production thì drop sẽ làm route hub chậm lại (FETCH thay vì covered), không làm nó sai.

Nếu chỉ muốn ẩn trang: xoá entry nav — route vẫn tồn tại nhưng không ai thấy link.