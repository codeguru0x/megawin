# p0-02 — Collection `max3d_pro_draw_betting_stats` + exposure rules (ordered pair) + worker `stats-sync`

> **Nguồn:** `.cursor/analysis/max3d-max3dpro-operations-risk-control.analysis.md` §3.2–3.4, bảng delta §2.4.
> **Phase:** P0 · **Phụ thuộc:** p0-01 + **Max 3D p0-02 done** (copy từ code đã review) · **Blocks:** p0-04, p0-05.
> **Plan mẫu:** `../max3d-ops-risk-control/p0-02-draw-betting-stats.plan.md` — khung y hệt; dưới đây CHỈ ghi DELTA Pro. ⚠️ Mọi chỗ chạm pair PHẢI giữ THỨ TỰ (bug copy nguy hiểm nhất — xem overview Pro).

## Delta so với Max 3D p0-02

### 1. Entity (`packages/game-max3dpro/src/entities/betting-stats.ts`)

- `Max3dproByPlayType { multiNumber; multiDigit: Max3dproPlayTypeStat }` — KHÔNG có basic/plus.
- **KHÔNG có `tripletStakes` tách nhóm straight/combo** — Pro không có board 1-triplet. Giữ `tripletStakes: Record<string, { units; amount; boards }>` đơn giản (mỗi triplet distinct xuất hiện trong board): phục vụ histogram chữ số + top triplets UI, và là cơ sở proxy đuôi giải đơn Năm/Sáu (1 triplet khớp pool — tier duy nhất của Pro tính theo triplet đơn). Exposure lớp chính của Pro là PAIR (mục 2).
- `topPairs: Max3dproTopPair[]` — **pairKey ORDERED** `"${first}>${second}"` (mũi tên `>` phân biệt với `,` unordered của Max 3D); JSDoc ghi rõ: (A,B) và (B,A) là 2 KEY KHÁC NHAU (ĐB vs phụ ĐB). KHÔNG sort/normalize.
- Doc: `Max3dproDrawBettingStatsDoc extends DrawBettingStatsBase { _id; byPlayType; tripletStakes; topPairs; topPotential }` + Entity. Collection `Max3dproCollections.BettingStats: "max3d_pro_draw_betting_stats"` + index unique drawId.

### 2. Exposure rules (`packages/game-max3dpro/src/rules/exposure.ts`)

- **KHÔNG có `computeBasicWorstCase`** (không có basic mode). Thay bằng:
- `computeProPairLiabilities(topPairs, prizes)`: cho mỗi ordered pair p = (t1,t2) trong topPairs —
  `liabilityNếuĐB(t1,t2) = topPairs["t1>t2"].units × prizes.special + topPairs["t2>t1"].units × prizes.specialSub`
  (nếu kết quả special = [t1,t2]: chiều đúng ăn ĐB 2 tỷ, chiều ngược ăn phụ ĐB 400tr — CỘNG CẢ 2 KEY). Duplicate pair (t1===t2): 1 key duy nhất, liability = `units × (special + specialSub)` (luật duplicate ĐB = special+specialSub, KHÔNG ×2). Comment `//` đối chiếu `matchPair()` (`rules/prize-tiers.ts`).
- `computeMax3dproExposure(...)`: worst-case tổng = max pair liability + đuôi Nhất→Sáu proxy (Σ units × maxTailPrize). Output ghi nhãn exact/proxy như Max 3D.
- Unit test fixture: pair ("096","389") 1 unit + pair ngược ("389","096") 2 units → liabilityNếuĐB([096,389]) = 2 tỷ + 2×400tr = 2,8 tỷ; case duplicate ("096","096").

### 3. Accumulator

- Board `multiNumber`/`multiDigit` → **expand pairs bằng `expandSelectionToPairs()`** (`game-max3dpro/rules/play-types.ts`) — KHÔNG viết lại vòng lặp P(n,2)/perms. Mỗi ordered pair → `topPairs[pairKey].units += betCount`; mỗi triplet distinct trong board → `tripletStakes`.
- ⚠️ Board multiNumber 20 bộ = **380 ordered pairs × betCount** — cộng per-pair đã expand, KHÔNG cộng cả board 1 key. topPairs cắt `topCombosK` sau merge (baseline accounts — Risk #5).
- `topPotential` proxy per board: `maxUnitWin = prizes.special + prizes.specialSub nếu board chứa cả 2 chiều của 1 cặp / prizes.special nếu chỉ 1 chiều` — đơn giản hoá chấp nhận: `prizes.special × betCount` mỗi board (proxy thiên cao đã chốt Q5; multiNumber chứa mọi ordered pair của tập chọn nên gần như luôn có cả 2 chiều → cộng thêm specialSub; ghi JSDoc).

### 4. Worker + handler + schedule

Y hệt Max 3D: lock key `"max3dpro:stats-sync"`; tick default 30s; handler `apps/worker-max3dpro/src/handlers/stats/stats-sync.ts` + `functions/stats.yml` + serverless.

## Không làm

Như Max 3D p0-02, THÊM: KHÔNG sort/normalize pairKey (`$sortArray` của `aggregateTopPlusCombos` Max 3D là anti-pattern với Pro); KHÔNG dùng combo3/combo6 concepts (không tồn tại ở Pro).

## Verify

`check-types` + lint `game-max3dpro` + application + unit test exposure. So stats doc vs `aggregateTopPlusCombos`-tương-đương cũ của Pro (lưu ý pipeline cũ của Pro nếu có sort pair — số của stats mới TÁCH 2 chiều là ĐÚNG, ghi rõ khi so).

## Review sau triển khai (BẮT BUỘC — khung 00-overview)

- [ ] **Ordered pair audit:** grep mọi chỗ build/so pairKey — không có sort/normalize; test 2 chiều ra 2 key.
- [ ] **Logic:** liability đối chiếu `matchPair()` từng nhánh (ĐB/phụ ĐB/duplicate/bipartite Nhất→Tư); expansion khớp `calculateLineCount` (units per board = lineCount × betCount).
- [ ] Checklist 10 rủi ro worker + grep code chuẩn (import/indexed-access/string trần/mapper).
- [ ] Ghi kết quả review + cập nhật `00-overview.md`.

## Định nghĩa Done

Worker cập nhật stats doc ordered-pair đúng, exposure rules test pass, review xong, overview cập nhật.
