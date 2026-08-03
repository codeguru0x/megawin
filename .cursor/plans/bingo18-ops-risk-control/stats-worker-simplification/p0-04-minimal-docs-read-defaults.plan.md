# p0-04 — Minimal docs + read-defaults (mapper normalize)

> **Feature:** bingo18-ops-risk-control / stats-worker-simplification
> **Phase:** P0 · **Phụ thuộc:** p0-01 (`ensureDocs` + `applyDelta` `$inc` tạo path lazy). Khuyến nghị SAU p0-03 (mapper normalize viết theo entity đã bỏ `topAccounts`).
> **Nguồn:** analysis §5.5 · **Bản chuẩn Keno:** `betting-stats-mapper.ts` + `keno-.../p0-03`
> **Trạng thái:** Code ⏳ · Review & rủi ro ⏳

## 1. Mục tiêu 1 câu

`ensureDocs` chỉ seed `{final, updatedAt}` (không skeleton 38 bucket); mapper phía ĐỌC normalize full shape → default 1 nơi duy nhất, thêm field mới không cần migration; doc cũ (đầy đủ) và doc mới (tối giản) đều đọc đúng.

## 2. Vì sao

Với `$inc`, `applyDelta` tự tạo mọi path lồng khi chạm (Mongo upsert path). Seed skeleton 38 bucket lúc `ensureDocs` là thừa: doc phình ngay cả kỳ chưa ai cược, và trùng lặp trách nhiệm "đảm bảo shape" giữa write và read. Đưa full-shape về 1 nơi = mapper đọc. Mapper thay `{...rest} as Entity` (dòng 12-13 hiện tại — che lỗi thiếu field) bằng field-explicit + `satisfies` (compiler bắt thiếu field).

## 3. File đụng tới (3 file)

| # | File | Loại | Tóm tắt |
|---|---|---|---|
| I1 | `packages/game-bingo18-application/src/infras/repos/betting-stats-repo.ts` | sửa | `ensureDocs` giữ tối thiểu (p0-01 đã tối giản — plan này XÁC NHẬN + JSDoc §5.5) |
| I2 | `packages/game-bingo18-application/src/infras/mappers/betting-stats-mapper.ts` | rewrite | Field-explicit + normalize 38 bucket (mẫu Keno mapper) |
| I3 | `packages/game-bingo18-application/src/use-cases/operations/sync-betting-stats.ts` | (đã có ở p0-01) | Xác nhận enroll `beforeLoop` 1 lần/invocation |

> Thực chất p0-04 chủ yếu là I2 (mapper). I1 đã làm ở p0-01 F3; plan này chốt JSDoc + đảm bảo KHÔNG seed skeleton. I3 đã xong ở p0-01 F4 — chỉ verify.

## 4. Chi tiết

### I1 — `ensureDocs` tối thiểu (xác nhận)

Đúng như p0-01 F3: `$setOnInsert {final:false, updatedAt:new Date()}` upsert, bulkWrite `{ordered:false}`. JSDoc ghi rõ "CHỈ seed 2 field, `$inc` applyDelta tạo path còn lại, full shape do mapper normalize phía đọc" (mẫu Keno `ensureDocs` JSDoc dòng 222-236).

> **Ngoại lệ review #I1-a — KHÔNG `$setOnInsert` skeleton byPlayType/totals:** nếu ai đó seed đủ 38 bucket "cho chắc" → phá mục tiêu minimal (doc phình + trùng trách nhiệm). Chỉ 2 field. Reviewer kiểm `$setOnInsert` đúng 2 key.

### I2 — mapper rewrite (mẫu Keno)

Thay `mapProps` hiện tại (`{_id, ...rest} = doc; return {id, ...rest} as Entity`) bằng field-explicit + `satisfies Bingo18DrawBettingStatsEntity`. Return type TƯỜNG MINH (không `as`) — thiếu field = lỗi compile (mẫu Keno mapper dòng 24-26).

```ts
protected mapProps(doc: Document): Bingo18DrawBettingStatsEntity {
  return {
    id: doc._id.toHexString(),
    drawId: doc.drawId,
    final: doc.final ?? false,
    lastEntryId: doc.lastEntryId,   // KHÔNG default (Mongo missing = null cho $lt)
    updatedAt: doc.updatedAt,       // KHÔNG default (mọi write set; findChangedSince $gt Date)
    totals: normalizeTotals(doc.totals),
    byPlayType: normalizeByPlayType(doc.byPlayType),
    byTenant: normalizeByTenant(doc.byTenant),
    topPotential: doc.topPotential ?? [],
  } satisfies Bingo18DrawBettingStatsEntity;
}
```

**`normalizeByPlayType`** — 38 bucket, doc thiếu nhánh → `emptyBucket()`. KHÁC Keno (pick/side): Bingo 18 là singleNum/doubleMatch/sumTotal (`Record<string,bucket>` — 6/6/16 key cố định), tripleMatch.specific (6 key) + any, bigSmallDraw 3 hướng:

```ts
function normalizeByPlayType(raw): Bingo18ByPlayType {
  const nums = ["1","2","3","4","5","6"];
  const sums = Array.from({length:16}, (_,i) => String(i+3));  // "3".."18"
  return {
    singleNum: fillRecord(raw?.singleNum, nums),
    doubleMatch: fillRecord(raw?.doubleMatch, nums),
    tripleMatch: {
      specific: fillRecord(raw?.tripleMatch?.specific, nums),
      any: normalizeBucket(raw?.tripleMatch?.any),
    },
    sumTotal: fillRecord(raw?.sumTotal, sums),
    bigSmallDraw: {
      big: normalizeBucket(raw?.bigSmallDraw?.big),
      draw: normalizeBucket(raw?.bigSmallDraw?.draw),
      small: normalizeBucket(raw?.bigSmallDraw?.small),
    },
  } satisfies Bingo18ByPlayType;
}
```

`normalizeBucket(raw) → {amount:raw?.amount??0, sets:??0, entries:??0}`. `fillRecord(raw, keys)` → mọi key có bucket (merge doc lên nền zero) — đảm bảo FE render đủ grid.

> **Ngoại lệ review #I2-a — full 38 bucket bảo đảm ở ĐỌC, single source:** `emptyByPlayType()` trong accumulator (p0-01) từng là nơi seed khung — giờ accumulator delta-only KHÔNG seed khung nữa. Khung đủ 38 bucket chuyển sang mapper. Cân nhắc export 1 factory chung (như Keno `createEmptyByPlayType` ở `rules/stats-shape.ts`) để accumulator (nếu cần) + mapper dùng chung, tránh 2 định nghĩa 38 bucket lệch nhau. Reviewer kiểm KHÔNG có 2 nơi định nghĩa khung 38 bucket khác nhau.

> **Ngoại lệ review #I2-b — `lastEntryId`/`updatedAt` KHÔNG default:** `lastEntryId` thiếu → giữ `undefined` (Mongo `$lt` coi missing = null, đúng ngữ nghĩa). `updatedAt` thiếu → giữ `undefined` (findChangedSince `$gt Date` không bao giờ nhặt doc thiếu — default epoch chỉ che doc dị dạng). Mẫu Keno dòng 33-40. ĐỪNG `?? new Date(0)`.

> **Ngoại lệ review #I2-c — KHÔNG `{...rest}`:** phải field-explicit. `{...rest} as Entity` che mất field thiếu (nếu entity thêm field, doc cũ thiếu → runtime undefined, compiler im lặng). Đây là Q2 của p1-01 nhưng làm luôn ở đây. Reviewer kiểm không còn spread + `as`.

> **Ngoại lệ review #I2-d — bỏ `topAccounts` khỏi mapper:** nếu làm p0-04 SAU p0-03, entity đã bỏ `topAccounts` → mapper không map field này (compiler bắt nếu sót). Nếu làm TRƯỚC p0-03 → mapper tạm còn `topAccounts: doc.topAccounts ?? []`, p0-03 xoá sau. Khuyến nghị p0-04 sau p0-03 để tránh đá diff (overview §"thứ tự").

### I3 — enroll (verify)

Đã ở p0-01 F4: `beforeLoop` gọi `listUnfinishedDrawIds → ensureDocs` 1 lần/invocation. p0-04 chỉ verify KHÔNG có `ensureDocs` trong `runTick`.

## 5. Đánh giá & verify

1. `pnpm --filter @megawin/game-bingo18-application check-types` — mapper `satisfies` phải pass (field-explicit đủ).
2. Test đọc doc CŨ (đầy đủ 38 bucket) + doc MỚI (tối giản 2 field) qua mapper → cùng entity full shape. Nếu có test harness; nếu không, review kỹ normalize.
3. Grep `as Bingo18DrawBettingStatsEntity` trong mapper → 0 (đã dùng `satisfies`).
4. Đọc "Ngoại lệ review I2".

## 6. Review code & rủi ro

- [ ] **#1 — minimal:** `ensureDocs` chỉ `{final, updatedAt}`? KHÔNG skeleton?
- [ ] **#2 — full shape đọc:** mapper trả đủ 38 bucket cho MỌI doc (cũ/mới)? reader không cần `?? 0` rải rác?
- [ ] **#3 — không default sai:** `lastEntryId`/`updatedAt` giữ undefined (không epoch/null giả)?
- [ ] **#4 — compiler-safe:** `satisfies` + return type tường minh, KHÔNG `as`? thêm field entity → compiler bắt thiếu default?
- [ ] **#5 — single khung 38 bucket:** không 2 nơi định nghĩa khung lệch nhau (accumulator vs mapper)?
- [ ] **#6 — schema evolution:** thêm field mới = sửa entity + 1 dòng normalize, KHÔNG migration doc cũ?

## 7. Sau khi hoàn thành

- Cập nhật `00-overview.md`.
- p0-04 đóng phần P0. Còn p1-01 (code quality) là P1.
