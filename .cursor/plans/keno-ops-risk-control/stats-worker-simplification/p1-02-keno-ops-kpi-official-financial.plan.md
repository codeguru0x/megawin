# p1-02 — KPI kỳ Settled hiển thị số chính thức từ settle (Phương án A — UI reconcile)

> **Nguồn:** `.cursor/analysis/keno-stats-worker-simplification.analysis.md` §5.3 mục "Sau kết sổ" +
> "Phương án A" (USER ĐÃ DUYỆT 02/08) · **Phase:** P1 · **Phụ thuộc:** — (độc lập backend, làm song song được).
> **Phạm vi:** CHỈ FE backoffice Keno (`apps/backoffice/.../games/keno/operations/_lib`). Zero request mới,
> zero thay đổi worker/backend/settle.

## Mục tiêu

Khi kỳ `Settled`, cùng màn hình Operations đang có 2 con số "Doanh thu" có thể lệch nhau: KPI strip
(ops stats — ảnh chụp giai đoạn live, có audit void-sau-cộng + rủi ro tồn dư watermark) vs
`FinancialSummary` (settle — aggregate thẳng từ entries, số chính thức). Hợp nhất: KPI strip ưu tiên
số chính thức khi Settled; ops stats vẫn là nguồn cho cơ cấu chi tiết (byPlayType/heatmap/combo —
thứ settle không có).

**Trang đã fetch sẵn cả 2 nguồn**: `useOpsSnapshot` (ops) và `useDrawDetail` (`GET /keno/draws/{id}` →
`result + financial + stats + settleSummary`, react-query cache `staleTime` 5 phút, `ResultSection`/
`DrawManagement` đã dùng cùng queryKey → dedupe). Việc còn lại thuần adapter + wiring section.

## Ma trận nguồn số (chốt trong analysis — KHÔNG tự chế thêm)

| KPI | Live / Settling | **Settled** | **Void** |
|---|---|---|---|
| Doanh thu | ops `totals.revenue` | **`financial.totalRevenue`** | ops |
| Hoa hồng ĐL | ops `totals.commission` | **`financial.totalAgentCommission`** | ops |
| Net (sau HH) | ops (revenue − commission) | **financial** (revenue − commission) | ops |
| Entries | ops `totals.entries` | **`DrawDoc.stats.ticketEntryCount`** (= totalSettled, đã loại void) | ops |
| Boards | ops `totals.boards` | ops — settle KHÔNG có boards | ops |
| Người chơi | ops `uniquePlayers` | ops — settle không có | ops |

Căn cứ đã kiểm trong analysis: settle chỉ ghi `ticketEntryCount/totalSalesAmount/totalPayoutAmount`
(KHÔNG có boards/players — quyết định KHÔNG mở rộng settle 7 game vì 1 ô dashboard); kỳ Void không có
`financial` (void flow không tính tài chính) → cột Void toàn fallback ops.

## 1. Adapter `toKpi` — `_lib/adapters.ts`

Chữ ký mới (guard nằm TRONG adapter — pure, test được):

```typescript
/** Số chính thức từ settle (DrawDoc) — slice tối thiểu adapter cần, KHÔNG kéo cả GetDrawDetailOutput. */
export interface OfficialFinancialSlice {
  /** `DrawDoc.financial` — undefined khi chưa settle / kỳ Void. */
  financial?: { totalRevenue: number; totalAgentCommission: number };
  /** `DrawDoc.stats.ticketEntryCount` — số entry chính thức (totalSettled, đã loại void). */
  ticketEntryCount?: number;
}

/**
 * KPI strip — hợp nhất 2 nguồn theo ma trận analysis stats-worker-simplification §5.3:
 * kỳ Settled ưu tiên số CHÍNH THỨC từ settle (financial/stats trên DrawDoc, aggregate
 * thẳng từ entries); live/Settling/Void dùng ops stats. Boards/uniquePlayers luôn từ
 * ops (settle không có).
 *
 * Guard: CHỈ override khi `status === Settled` VÀ `financial` tồn tại — `RESULT_SHOW`
 * gồm cả Published/Settling là lúc financial có thể CHƯA ghi; kỳ Void không bao giờ có
 * financial. Resettle ghi đè financial (idempotent overwrite) → vẫn đúng nguồn.
 */
export function toKpi(
  stats: Stats,
  uniquePlayers: number,
  status: DrawStatus | undefined,
  official: OfficialFinancialSlice | undefined,
): OpsKpi {
  const t = stats.totals;
  const useOfficial = status === DrawStatus.Settled && official?.financial !== undefined;

  const revenue = useOfficial ? official.financial.totalRevenue : t.revenue;
  const commission = useOfficial ? official.financial.totalAgentCommission : t.commission;

  return {
    totalRevenue: revenue,
    totalEntries: useOfficial ? (official.ticketEntryCount ?? t.entries) : t.entries,
    totalBoards: t.boards,          // settle không có boards — ops là nguồn duy nhất
    uniquePlayers,                  // settle không có — ops (số thật từ account_stats)
    totalCommission: commission,
    netRevenue: revenue - commission,
  };
}
```

Ghi chú thiết kế:

- `OpsKpi` (types.ts) KHÔNG đổi shape — KpiStrip render y nguyên. CÂN NHẮC (optional, đề xuất làm):
  thêm field `source: "ops" | "official"` vào `OpsKpi` để KpiStrip gắn badge nhỏ "số chính thức"
  khi Settled — giúp staff hiểu vì sao số nhảy nhẹ lúc kỳ vừa settle. Nếu thêm: sửa `KpiStrip`
  hiển thị badge, mặc định "ops" để các caller khác (nếu có) không gãy.
- `ticketEntryCount` fallback `?? t.entries` khi settle cũ chưa ghi field (doc lịch sử) — không hiển
  thị 0 sai.
- Import `DrawStatus` từ `@megawin/game-core/entities` (FE đã dùng ở `use-draw-context.tsx`).

## 2. Wiring — `_lib/sections/kpi/index.tsx`

Hiện tại:

```24:26:apps/backoffice/src/app/(main)/games/keno/operations/_lib/sections/kpi/index.tsx
  const { data: kpi, isLoading } = useOpsSnapshot<OpsKpi | null>(effectiveDrawId, isSettled, (s) =>
    s.stats ? toKpi(s.stats, s.uniquePlayers) : null,
  );
```

Sửa:

1. Lấy `status` từ `useDrawContext()` (context đã có `draw.status` — nếu context chưa expose `status`
   thô thì expose thêm, đang có sẵn biến `status` nội bộ trong `use-draw-context.tsx:96`).
2. Gọi `useDrawDetail(isSettled ? effectiveDrawId : undefined)` — cùng queryKey với `ResultSection`
   → react-query dedupe, **zero request mới** khi ResultSection đang hiển thị; kỳ live `enabled: false`
   không fetch gì.
3. Build slice + truyền vào adapter trong selector/`useMemo`:

```typescript
const { data: drawDetail } = useDrawDetail(isSettled ? effectiveDrawId : undefined);
const official: OfficialFinancialSlice | undefined = drawDetail?.draw
  ? {
      financial: drawDetail.draw.financial
        ? {
            totalRevenue: drawDetail.draw.financial.totalRevenue,
            totalAgentCommission: drawDetail.draw.financial.totalAgentCommission,
          }
        : undefined,
      ticketEntryCount: drawDetail.draw.stats?.ticketEntryCount,
    }
  : undefined;

const { data: kpi, isLoading } = useOpsSnapshot<OpsKpi | null>(effectiveDrawId, isSettled, (s) =>
  s.stats ? toKpi(s.stats, s.uniquePlayers, status, official) : null,
);
```

**LƯU Ý selector closure:** `useOpsSnapshot(select)` — select nhận dependency ngoài (`status`,
`official`) qua closure; kiểm implementation `useOpsSnapshot` (react-query `select` chỉ re-run khi
data/select identity đổi) → bọc select trong `useCallback([status, official])` hoặc memo `official`
để KPI cập nhật khi drawDetail về SAU snapshot. Đây là chỗ dễ sai nhất của plan — reviewer soi kỹ.

Khoảnh khắc chuyển trạng thái: kỳ vừa Settled nhưng `drawDetail` chưa fetch xong → guard fallback ops
(đúng thiết kế, số "nhảy" sang chính thức khi detail về — chấp nhận, có badge source thì user hiểu).

## 3. Danh sách file

| File | Việc |
|---|---|
| `_lib/adapters.ts` | §1 — `toKpi` mới + `OfficialFinancialSlice` |
| `_lib/types.ts` | (optional) `OpsKpi.source` |
| `_lib/sections/kpi/index.tsx` | §2 — wiring useDrawDetail + truyền status/official |
| `_lib/sections/kpi/kpi-strip.tsx` | (optional) badge "số chính thức" |
| `_lib/use-draw-context.tsx` | expose `status` nếu chưa có trong context value |

KHÔNG chạm: snapshot API/use-case (get-ops-snapshot đã cố ý KHÔNG kéo financial trên route poll 10s —
giữ nguyên quyết định đó, nguồn financial là useDrawDetail cache 5'), worker, settle, entity.

## 4. Đánh giá & verify

1. `pnpm --filter @megawin/backoffice check-types` + lint.
2. **Test thủ công trên dev theo ma trận** (mỗi ô 1 lần nhìn):
   - [ ] Kỳ LIVE: KPI = ops, không có request `/draws/{id}` phát sinh từ KPI section (Network tab).
   - [ ] Kỳ Settled: Doanh thu/Hoa hồng/Net/Entries khớp `FinancialSummary` bên dưới (cùng màn hình
     — đây chính là bug UX cần sửa); Boards/Người chơi vẫn số ops.
   - [ ] Kỳ Settled có lệch thật ops vs official (tạo bằng cách void 1 entry sau khi cược): KPI hiện
     số official, panel cơ cấu (playtype/heatmap) vẫn số ops — đúng thiết kế.
   - [ ] Kỳ Void: KPI = ops (không crash vì financial undefined).
   - [ ] Kỳ Settling/Published: chưa override (guard status).
   - [ ] Chọn kỳ lịch sử settled từ selector → KPI official sau khi detail về; số "nhảy" 1 lần, không loop.
3. Kiểm dedupe: mở kỳ Settled, đếm request `/keno/draws/{id}` = 1 (KPI + Result + DrawManagement chung cache).

## 5. Review code & rủi ro — từng bước

| # | Rủi ro | Mức | Kiểm khi review |
|---|---|---|---|
| 1 | Selector closure stale — `official` về sau nhưng select không re-run → KPI kẹt số ops vĩnh viễn tới refetch snapshot | 🔴 | §2 LƯU Ý. Test 4.2 dòng cuối. Đọc implementation `useOpsSnapshot` trước khi code |
| 2 | Override nhầm khi `Published/Settling` (financial chưa ghi xong → số 0/thiếu) | 🟠 | Guard `=== Settled && financial !== undefined` nằm TRONG adapter (pure) + unit-testable; không guard ở component |
| 3 | Kỳ Void hiện 0 thay vì số ops (đọc financial của kỳ void) | 🟠 | Ma trận: Void không có financial → guard tự fallback. Test 4.2 |
| 4 | KPI và FinancialSummary vẫn lệch vì FE đọc field khác nhau (VD KPI lấy `totalSalesAmount`, Summary lấy `totalRevenue`) | 🟡 | Cả 2 phải cùng đọc `financial.totalRevenue`/`totalAgentCommission` — đối chiếu `ResultSection` dòng 601-606 |
| 5 | Thêm request mới cho kỳ live (useDrawDetail enabled sai điều kiện) | 🟡 | `enabled` chỉ khi `isSettled`; Network tab test 4.2 |
| 6 | Ai đó "tiện tay" đưa financial vào snapshot API cho gọn | 🟡 | KHÔNG — route poll 10s cố ý projection thin (JSDoc get-ops-snapshot dòng 64-65). Diff không được chạm backend |

### 5.1. Kết quả review (02/08) — ✅ PASS

| # | Rủi ro | Kết quả | Bằng chứng |
|---|---|---|---|
| 1 | Selector closure stale → KPI kẹt số ops | ✅ | Đọc `queryObserver.js` v5.101.2 dòng 286-299: select chỉ được **bỏ qua** khi `data === prevResultState.data` **VÀ** `options.select === this.#selectFn`. `KpiSection` truyền **inline arrow** (identity mới mỗi render) → điều kiện thứ 2 luôn false → select LUÔN re-run với `status`/`official` tươi. `drawDetail` về ⇒ component re-render ⇒ KPI cập nhật ngay, không chờ refetch snapshot. Comment giải thích đã đặt tại chỗ (`kpi/index.tsx:40-41`) để người sau không "tối ưu" thành `useCallback` rồi gây lại bug |
| 2 | Override nhầm khi Published/Settling | ✅ | Guard nằm TRONG adapter pure: `status === DrawStatus.Settled ? official?.financial : undefined` (`adapters.ts:73`) — component KHÔNG guard. Testable không cần render |
| 3 | Kỳ Void hiện 0 | ✅ | Void ⇒ `status !== Settled` ⇒ `officialFinancial === undefined` ⇒ toàn bộ nhánh dùng `t.*` (ops). Không có đường nào đọc `financial` của kỳ void |
| 4 | KPI vs FinancialSummary đọc field khác nhau | ✅ | Cả 2 đọc **cùng** `financial.totalRevenue` / `financial.totalAgentCommission`: `sections/result/index.tsx:601-606` vs `kpi/index.tsx:31-32`. Không có chỗ nào dùng `totalSalesAmount` |
| 5 | Thêm request mới cho kỳ live | ✅ (lý do khác plan giả định) | `useDrawDetail(isSettled ? effectiveDrawId : undefined)` trong KPI là `enabled: false` khi live — nhưng **`use-draw-context.tsx:68` đã fetch `useDrawDetail(effectiveDrawId)` KHÔNG điều kiện cho mọi kỳ** (context cần `status`/`settledAt`). Cùng `queryKey` ⇒ react-query 1 query duy nhất ⇒ KPI **không tạo request nào**, kể cả nếu bỏ điều kiện. Điều kiện trong KPI vì vậy là phòng ngừa, không phải cơ chế chính — ghi lại để người sau không tưởng nó đang chặn request |
| 6 | Financial lọt vào snapshot API | ✅ | `get-ops-snapshot.ts` không có `financial`; `drawRepo.getStatusesByDrawIds` chỉ project `status` (JSDoc dòng 64-65 giữ nguyên). Diff không chạm backend/worker/settle |

**Ghi chú thêm:**

- Field optional `OpsKpi.source` + badge "số chính thức" (§1 ghi chú, §3 dòng optional) **KHÔNG làm** — quyết
  định giữ scope tối thiểu. Hệ quả: lúc kỳ vừa settle, KPI nhảy 1 lần từ ops → official mà không có dấu hiệu
  cho staff. Chấp nhận vì `FinancialSummary` ngay bên dưới cùng màn hình đã là mốc đối chiếu; nếu staff thắc
  mắc thực tế thì mở lại (1 field + 1 badge, không breaking).
- `structuralSharing` (default `true`) chạy sau select ⇒ select re-run mỗi render nhưng kết quả deep-equal
  vẫn giữ **cùng reference** ⇒ KHÔNG gây re-render loop. Đây là lý do inline arrow an toàn về hiệu năng ở đây.
- `ticketEntryCount` fallback `?? t.entries` chỉ áp dụng khi ĐÃ vào nhánh official (`officialFinancial`
  truthy) — doc settle cũ thiếu `stats.ticketEntryCount` hiện số ops thay vì 0. Đúng ghi chú §1.

Verify đã chạy: §4.1 `check-types` backoffice PASS.
Chưa chạy: §4.2 ma trận 6 ô trên dev + §4.3 đếm request (cần môi trường + dữ liệu kỳ Settled/Void).

## 6. Rollback

Thuần FE — revert commit là xong, không có state/schema nào thay đổi.

## 7. Ghi chú cho port (p2-01 guide)

Bingo18/max3d/max3dpro có cùng cặp màn hình (KPI ops + FinancialSummary settle) nhưng ma trận field
khác nhau per-game (max3d/max3dpro có jackpot? bingo18 tên field khác?) — khi port PHẢI lập lại ma trận
nguồn số từ `calculate-financials.ts` của từng game, KHÔNG copy ma trận Keno.
