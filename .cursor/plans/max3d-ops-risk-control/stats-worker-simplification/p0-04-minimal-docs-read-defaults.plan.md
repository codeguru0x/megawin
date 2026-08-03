# p0-04 — `ensureDocs` tối giản + default phía đọc (mapper) + enroll 1 lần/invocation

> **Phase:** P0 · **Phụ thuộc:** p0-01 (hook `beforeLoop`, `ensureDocs`), p0-03 (mapper normalize chạm cùng
> type sau khi xoá `topPairs`/`topAccounts`) · **PR:** riêng.
> **Nguồn:** analysis §5.5 (minimal docs + mapper normalize) + §5.6 (enroll) · bản chuẩn Keno `p0-03-keno-minimal-docs-read-defaults.plan.md` (✅ + review PASS).

> **Merge sau p0-03:** mapper normalize phải khai TẤT CẢ field entity tường minh. Nếu viết trước p0-03,
> normalize còn `topPairs`/`topAccounts` rồi p0-03 xoá → sửa 2 lần. Làm p0-03 trước, p0-04 normalize đúng
> shape cuối 1 lần.

## 1. Mục tiêu

1. **`ensureDocs` chỉ seed `{final:false, updatedAt}`** — bỏ mọi skeleton. `$inc` của `applyDelta` tự tạo path lồng; shape đầy đủ do mapper lo phía ĐỌC. (p0-01 đã tạo `ensureDocs` tối thiểu — p0-04 chỉ xác nhận + không thêm skeleton lại.)
2. **Normalize 1 chỗ ở `BettingStatsMapper`** — vá lỗ `{...rest} as Max3dDrawBettingStatsEntity` (spread mù, `betting-stats-mapper.ts:12-13`) bằng return tường minh field-by-field. Doc tối giản/thiếu nhánh → mapper điền default. Thêm field mới = entity + 1 dòng mapper, KHÔNG migration.
3. **Enroll dời khỏi tick** — `listUnfinishedDrawIds` + `ensureDocs` chạy 1 lần trong `beforeLoop` (p0-01 đã đặt ở đó); p0-04 xác nhận `runTick` KHÔNG còn enroll.

**KHÔNG thuộc plan này:** đổi cơ chế đóng sổ; đổi shape entity; chạm `applyDelta` filter/`$inc`.

## 2. Sửa cái gì, ở file nào

### 2.1. `betting-stats-mapper.ts` — normalize tường minh

Thay `mapProps` spread mù. Return type khai tường minh `Max3dDrawBettingStatsEntity` (KHÔNG `as` — để
compiler bắt thiếu field). Đối chiếu ĐỦ field `Max3dDrawBettingStatsDoc` (sau p0-03: KHÔNG còn
`topPairs`/`topAccounts`) + `DrawBettingStatsBase` (game-core):

- `id: doc._id.toHexString()`, `drawId`, `final: doc.final ?? false`, `lastEntryId` (giữ undefined), `updatedAt` (giữ nguyên — mọi đường ghi set; default giả che lỗi).
- `totals: normalizeTotals(doc.totals)` — từng field `?? 0` theo `DrawBettingTotals`.
- `byPlayType: normalizeByPlayType(doc.byPlayType)` — base `emptyByPlayType()` (4 nhóm phẳng), merge từng nhóm `{amount,units,boards,entries} ?? 0`. Đơn giản hơn Keno (không lồng bigSmall/evenOdd).
- `tripletStakes: doc.tripletStakes ?? {}`.
- `byTenant: doc.byTenant ?? {}`.
- `topPotential: doc.topPotential ?? []`.

> `emptyByPlayType`/`emptyPlayTypeStat` đang là hàm private trong `stats-accumulator.ts`. Cân nhắc chuyển
> sang `packages/game-max3d/src/rules/stats-shape.ts` (single source) như Keno để mapper + accumulator dùng
> chung — hoặc mapper tự khai inline. Chọn 1, ghi PR. Khuyến nghị: tạo `stats-shape.ts` (bám Keno).

helpers module-level (KHÔNG export): `normalizeTotals`, `normalizeByPlayType`. KHÔNG khai lại danh sách key —
lặp `Object.keys(emptyByPlayType())`.

### 2.2. `sync-betting-stats.ts` — xác nhận enroll ở `beforeLoop`

p0-01 đã đặt `ensureDocs(await drawRepo.listUnfinishedDrawIds())` cuối `beforeLoop`. p0-04 chỉ:
- Xác nhận `runTick` KHÔNG còn enroll (chỉ `findNotFinal` + `getStatusesByDrawIds`).
- JSDoc `beforeLoop` ghi trade-off: kỳ tạo giữa invocation trễ enroll ≤~55s — vô nghĩa so với chu kỳ 3 kỳ/tuần; entries nằm yên trong `max3d_ticket_entries` (insert-only) → invocation sau drain, KHÔNG mất.

### 2.3. `betting-stats-repo.ts` — xác nhận `ensureDocs` tối thiểu

Xác nhận `ensureDocs` (p0-01) chỉ `$setOnInsert:{final:false, updatedAt}`. Giữ phần JSDoc `$lt`/`null<string`.

## 3. Đánh giá & verify

1. `pnpm --filter @megawin/game-max3d-application check-types` + `@megawin/game-max3d`.
2. **Test normalize (quan trọng nhất)** — unit test mapper (vitest/tsx theo hạ tầng repo):
   - Doc RỖNG (`_id, drawId, final, updatedAt`) → entity đủ shape: `totals.revenue===0`, `byPlayType.plus.amount===0`, `tripletStakes==={}`, `topPotential===[]`.
   - Doc PARTIAL (chỉ `byPlayType.basicStraight` + `totals.revenue`) → nhóm khác zero-stat.
   - Doc FULL kiểu cũ (có cả `topPairs`/`topAccounts` legacy) → giá trị giữ nguyên, field thừa bỏ qua không crash.
3. Luồng dọc (dev): tạo kỳ → invocation đầu enroll (Compass: doc 4 field) → cược → applyDelta tạo path → Operations page render đúng kỳ CHƯA cược (toàn 0, không crash) + kỳ CÓ cược.
4. Consumer đọc: `get-ops-snapshot` + evaluator + FE adapters nhận entity qua mapper → click-through Operations sau deploy dev.

## 4. Ngoại lệ & rủi ro khi review

| # | Rủi ro | Mức | Kiểm |
|---|---|---|---|
| 1 | Normalize THIẾU field vs entity (dùng `as` che) → reader nổ runtime doc tối giản | 🔴 | Cấm `as Max3dDrawBettingStatsEntity` trong mapProps — return type tường minh, compiler bắt. Đối chiếu từng field |
| 2 | Doc rỗng vào evaluator/snapshot trước khi merge | 🟠 | Mọi đường đọc qua mapper (`getByDrawId`/`findChangedSince` dùng `findOne`/`findMany`, KHÔNG `findManyAsDocuments`). `findNotFinal` documents thô nhưng chỉ 2 field — OK |
| 3 | Kỳ tạo giữa invocation trễ enroll ~55s | 🟡 | JSDoc `beforeLoop` ghi trade-off + căn cứ (3 kỳ/tuần) |
| 4 | Xoá skeleton làm ai đó "sửa" `incBy` để ghi field 0 | 🟡 | `incBy` giữ lọc delta 0 — normalize lo phần thiếu |
| 5 | Doc cũ full + doc mới minimal sống chung | 🟢 | Normalize superset xử lý cả 2. KHÔNG backfill (dự án chưa deploy) |
| 6 | `emptyByPlayType` bị copy 2 nơi (accumulator + mapper) lệch nhau | 🟠 | Chuyển `stats-shape.ts` single source HOẶC 1 nơi import nơi kia |

## 5. Định nghĩa Done (p0-04)

- `ensureDocs` chỉ seed `{final, updatedAt}`; `runTick` không enroll.
- Mapper normalize tường minh (KHÔNG `as`), mọi reader nhận full shape kể cả doc tối giản.
- Unit test 3 case PASS; check-types xanh; Operations render đúng kỳ chưa cược.

## 6. Rollback

Revert commit. Doc tối giản đã tạo sau revert: reader cũ (spread mù) truy cập thẳng `stats.byPlayType.plus`
trên doc chưa cược sẽ nổ → rollback an toàn = revert code + script bù skeleton cho doc `final:false` thiếu
`byPlayType` (viết sẵn mongosh trong PR). Nhưng dự án chưa deploy → thực tế không có doc thật cần bù.
