# p0-03 — `ensureDocs` tối giản + default chuyển sang phía đọc (mapper) + enroll 1 lần/invocation

> **Nguồn:** `.cursor/analysis/keno-stats-worker-simplification.analysis.md` §5.5 (minimal docs + mapper
> normalize) + §5.6 (enroll 1 lần/invocation) · **Phase:** P0 · **Phụ thuộc:** p0-01 (hook `beforeLoop`).
> **Blocks:** — (nhưng p2-01 port guide yêu cầu nguyên tắc này áp từ đầu cho 3 game).

## Mục tiêu

1. **Bỏ skeleton `$setOnInsert`** (~25 dòng object trong `ensureDocs`): skeleton chỉ chạy lúc INSERT →
   thêm field mới thì MỌI doc cũ vẫn thiếu → reader kiểu gì cũng phải chịu được field thiếu → skeleton là
   an toàn giả. Default bị rải 2 nơi (shape lúc ghi + kỳ vọng lúc đọc) — lệch là bug.
2. **Normalize 1 chỗ duy nhất ở `BettingStatsMapper` (phía đọc)** — entity contract KHÔNG đổi, mọi consumer
   giữ nguyên. Schema evolution triệt để: field mới = entity + 1 dòng default mapper, không migration.
   Bonus: sửa luôn lỗ type sẵn có của mapper (`{...rest} as Entity` spread mù).
3. **Enroll dời khỏi tick** — `listUnfinishedDrawIds` + `ensureDocs` chạy 1 lần đầu invocation
   (`beforeLoop`), `runTick` còn đúng 2 truy vấn (`findNotFinal` + `getStatusesByDrawIds`): *"lấy hàng
   đợi → hút delta → đóng dấu"*.

**KHÔNG thuộc plan này:** mọi thay đổi cơ chế đóng sổ (chốt §5.3: drained + terminal → final, KHÔNG thêm
kiểm tra gì). Không đổi shape entity. Không chạm `applyDelta` filter/`$inc` logic.

## Pattern tham chiếu

- `betting-stats-repo.ts:216-246` (`ensureDocs` hiện tại — cái bị thay), `:57-92` (`findNotFinal` — giữ).
- `infras/mappers/betting-stats-mapper.ts` — nơi đặt normalize.
- `packages/game-keno/src/rules/stats-shape.ts` — `createEmptyByPlayType` (single source, thêm consumer mapper).

## 1. `ensureDocs` tối giản — `betting-stats-repo.ts`

```typescript
/**
 * Tạo doc stats TỐI THIỂU cho kỳ chưa có (idempotent, no-op với kỳ đã tồn tại).
 *
 * CHỈ seed 2 field: `final` (trạng thái hàng đợi — phải tồn tại từ lúc enroll để
 * `findNotFinal`/`stampFinal` filter được) + `updatedAt` (cursor worker ops-alerts).
 * KHÔNG seed skeleton totals/byPlayType/exposure — `$inc` của applyDelta tự tạo mọi
 * path lồng còn thiếu; shape đầy đủ cho reader do BettingStatsMapper.normalize bảo đảm
 * PHÍA ĐỌC (analysis keno-stats-worker-simplification §5.5: default 1 nơi duy nhất,
 * schema evolution không cần migration).
 *
 * Gom 1 bulkWrite (mongodb.mdc §8.8). Doc mới KHÔNG có `lastEntryId` → filter `$lt`
 * của applyDelta vẫn khớp (Mongo coi field thiếu là null, null < string).
 */
async ensureDocs(drawIds: string[]): Promise<void> {
  if (drawIds.length === 0) return;

  const ops: AnyBulkWriteOperation<Document>[] = drawIds.map((drawId) => ({
    updateOne: {
      filter: { drawId },
      update: {
        $setOnInsert: {
          [f("final")]: false,
          [f("updatedAt")]: new Date(),
        },
      },
      upsert: true,
    },
  }));

  await this.bulkWrite(ops, { ordered: false });
}
```

Kéo theo: xoá import `createEmptyByPlayType` khỏi repo (mapper sẽ import). JSDoc cũ giải thích
seed-slot/skeleton XOÁ THEO code bị xoá (hợp lệ theo code-quality §4 — code không còn); phần giải thích
`$lt`/`null < string` GIỮ (vẫn đúng).

**Kiểm tra bắt buộc trước khi code:** xác nhận `applyDelta` không giả định doc có sẵn `totals` object
(nó dùng `$inc` path → tự tạo, OK) và `$push topPotential` tự tạo mảng (hành vi chuẩn Mongo, OK — đã ghi
trong analysis §5.5). Xác nhận `stampFinal` filter `{final: false}` vẫn khớp doc mới (final được seed — OK).

## 2. Mapper normalize — `betting-stats-mapper.ts`

Thay `mapProps` spread mù bằng normalize tường minh:

```typescript
import { MongoMapper } from "@megawin/data/mongo";
import type {
  KenoDrawBettingStatsEntity,
  KenoByPlayType,
  KenoExposure,
  DrawBettingTotals,
} from "@megawin/game-keno/entities";
import { createEmptyByPlayType, createEmptyPlayTypeStat } from "@megawin/game-keno/rules";
import { Document } from "mongodb";

/**
 * Doc `keno_draw_betting_stats` → entity, NORMALIZE shape phía đọc.
 *
 * Từ p0-03 (stats-worker-simplification §5.5) doc ghi TỐI THIỂU ($inc chỉ tạo path được
 * chạm) → doc có thể thiếu bất kỳ nhánh nào. Mapper là NƠI DUY NHẤT bảo đảm full shape
 * cho entity contract: totals/exposure thiếu → zeros; byPlayType deep-merge với
 * createEmptyByPlayType (slot thiếu = zero-stat); topPotential ?? []; numberFreq/byTenant
 * ?? {}. Thêm field mới vào entity → thêm 1 dòng default ở đây, doc cũ + mới đều đúng.
 */
export class BettingStatsMapper extends MongoMapper<Document, KenoDrawBettingStatsEntity> {
  protected mapProps(doc: Document): KenoDrawBettingStatsEntity {
    return {
      id: doc._id.toHexString(),
      drawId: doc.drawId,
      final: doc.final ?? false,
      lastEntryId: doc.lastEntryId, // optional theo DeltaAccumulatedDoc — giữ undefined
      updatedAt: doc.updatedAt,
      totals: normalizeTotals(doc.totals),
      byPlayType: normalizeByPlayType(doc.byPlayType),
      numberFreq: doc.numberFreq ?? {},
      byTenant: doc.byTenant ?? {},
      exposure: normalizeExposure(doc.exposure),
      topPotential: doc.topPotential ?? [],
    };
  }
}

// ── helpers module-level (KHÔNG export — chi tiết nội bộ mapper) ──
// normalizeTotals: từng field `?? 0` theo DrawBettingTotals.
// normalizeExposure: worstCaseByPlayType ?? {}, worstCaseTotal ?? 0,
//                    capSets từng pick `?? 0`.
// normalizeByPlayType: base = createEmptyByPlayType(); với mỗi slot pick1..pick10
//                    + bigSmall.{big,small,draw} + evenOdd.{...}: merge 3 field
//                    amount/boards/entries `?? 0` từ doc nếu có.
```

Quy tắc viết `normalizeByPlayType`: KHÔNG khai lại danh sách key — lặp trên `Object.keys` của
`createEmptyByPlayType()` (single source, rule §5); phân biệt slot lá/lồng theo cùng cách
`isPlayTypeStat` của repo (hoặc cứng theo 2 key `bigSmall`/`evenOdd` — chọn cách repo đang làm để đồng
nhất). LƯU Ý p1-01 sẽ xoá field `entries` khỏi `KenoPlayTypeStat` — normalize viết theo entity hiện
hành, khi p1-01 merge thì compiler tự bắt chỗ cần sửa (lợi ích của normalize tường minh).

**Danh sách field phải khớp `KenoDrawBettingStatsDoc`** (đọc `entities/betting-stats.ts` +
`DrawBettingStatsBase` ở game-core khi implement — nếu base có field khác như `createdAt` thì map đủ;
KHÔNG dựa vào bảng trong plan này làm nguồn cuối).

## 3. Enroll 1 lần/invocation — `sync-betting-stats.ts`

Sau p0-01, class đã có `beforeLoop` (đọc config). Thêm enroll vào cuối `beforeLoop`:

```typescript
protected async beforeLoop(): Promise<void> {
  // ... đọc config, reset counters (p0-01) ...

  // Enroll 1 lần/invocation (analysis §5.6): draws được staff tạo batch cho cả ngày;
  // kỳ tạo GIỮA invocation chờ tối đa ~55s để vào hàng đợi — vô nghĩa so với chu kỳ
  // 6–8 phút. runTick còn đúng 1 câu chuyện: lấy hàng đợi → hút delta → đóng dấu.
  const unfinishedIds = await this.drawRepo.listUnfinishedDrawIds();
  await this.statsRepo.ensureDocs(unfinishedIds);
}
```

Và XOÁ 2 dòng đầu `runTick` (Bước 1 cũ: `listUnfinishedDrawIds` + `ensureDocs`) + comment của nó;
đánh lại số bước trong JSDoc class (mỗi tick còn: findNotFinal → drain per-draw → stampFinal).

**Bất biến phải giữ:** "mọi kỳ còn có thể nhận entry đều có stats doc `final:false`" — sau thay đổi này
bất biến được duy trì theo NHỊP INVOCATION (≤60s) thay vì nhịp tick (10s). Kỳ mới tạo giữa invocation:
entries của nó nằm yên trong `keno_ticket_entries` (source of truth, insert-only) → invocation sau enroll
rồi drain từ đầu — KHÔNG mất dữ liệu, chỉ trễ. Ghi rõ trong JSDoc `beforeLoop`.

## 4. Danh sách file

| File | Việc |
|---|---|
| `packages/game-keno-application/src/infras/repos/betting-stats-repo.ts` | §1 — ensureDocs 2 field, xoá import `createEmptyByPlayType` |
| `packages/game-keno-application/src/infras/mappers/betting-stats-mapper.ts` | §2 — normalize |
| `packages/game-keno-application/src/use-cases/operations/sync-betting-stats.ts` | §3 — enroll → beforeLoop |
| `packages/game-keno/src/rules/stats-shape.ts` | chỉ sửa JSDoc: consumer của factory đổi từ "repo seed doc" sang "mapper normalize phía đọc + accumulator" |

KHÔNG chạm: entity, indexes, adapters/UI, evaluate-alerts, các repo khác. KHÔNG migration/backfill —
doc cũ (full skeleton) đi qua normalize vẫn ra đúng entity (normalize là superset).

## 5. Đánh giá & verify

1. `pnpm --filter @megawin/game-keno-application check-types` + `@megawin/game-keno` (JSDoc-only nhưng vẫn chạy).
2. **Test normalize (quan trọng nhất của plan này)** — thêm unit test vitest cho mapper
   (`packages/game-keno-application/test/...` theo tiền lệ test trong repo; nếu package chưa có hạ tầng
   test, tối thiểu viết test tạm chạy qua `tsx` rồi ghi lại kết quả trong PR):
   - [ ] Doc RỖNG (chỉ `_id, drawId, final, updatedAt` — như ensureDocs mới tạo) → entity đủ shape:
     `totals.revenue === 0`, `byPlayType.bigSmall.big.amount === 0`, `topPotential` là `[]`,
     `exposure.capSets.pick10 === 0`.
   - [ ] Doc PARTIAL (chỉ có `byPlayType.pick8` + `totals.revenue` — như sau 1 tick chỉ cược pick8) →
     slot pick8 giữ giá trị, 14 slot còn lại zero-stat.
   - [ ] Doc FULL kiểu cũ (skeleton p2-01, có cả field thừa `entries` trong playtype stat) → mọi giá trị
     giữ nguyên, field thừa không làm crash (normalize bỏ qua field không khai).
3. **Test luồng dọc (dev):** tạo kỳ mới → invocation đầu enroll (log doc mới chỉ 4 field trên Compass) →
   đặt cược → tick sau applyDelta tạo path → mở trang Operations backoffice: KPI/heatmap/side-bet render
   đúng với kỳ CHƯA có cược (toàn 0, không crash) và kỳ CÓ cược.
4. **Kiểm consumer đường đọc:** `get-ops-snapshot.ts` + `evaluateAlerts` + adapters FE đều nhận entity
   qua mapper → không sửa gì nhưng PHẢI click-through trang Operations cả 2 tab sau deploy dev.
5. Enroll latency: tạo kỳ mới giữa invocation → xác nhận kỳ xuất hiện trong hàng đợi ở invocation kế
   (≤60s) và stats bắt đầu tích.

## 6. Review code & rủi ro — từng bước

| # | Rủi ro | Mức | Kiểm khi review |
|---|---|---|---|
| 1 | Normalize THIẾU field so với entity (compile vẫn qua nếu dùng `as`) → reader nổ runtime với doc mới-tối-giản | 🔴 | Cấm `as KenoDrawBettingStatsEntity` trong mapProps — return type khai tường minh, để compiler bắt thiếu field. Đối chiếu từng field entity ↔ mapProps |
| 2 | Doc rỗng đi vào `evaluateAlerts` (đọc `stats.exposure.capSets.pick8` v.v.) trước khi mapper merge | 🟠 | Mọi đường đọc PHẢI qua mapper (BaseRepo + dataMapper — xác nhận `findChangedSince`/`getByDrawId` không dùng `findManyAsDocuments`). `findNotFinal` dùng documents thô nhưng chỉ đọc 2 field — OK, ghi chú |
| 3 | Kỳ tạo giữa invocation trễ enroll tối đa ~60s — ai đó tưởng là bug | 🟡 | JSDoc `beforeLoop` ghi rõ trade-off + căn cứ (chu kỳ 6–8 phút). Reviewer xác nhận |
| 4 | Xoá skeleton làm `applyDelta` upsert-path lệch (VD path `exposure.capSets.pick8` $inc 0 bị `incBy` lọc → doc thiếu nhánh) | 🟡 | Đúng như thiết kế — normalize lo. Review xác nhận KHÔNG "sửa" incBy để ghi field 0 |
| 5 | `stats-shape.ts` JSDoc còn nhắc "repo seed doc" (comment stale mới) | 🟡 | Checklist §4 dòng cuối |
| 6 | Doc cũ full-skeleton + doc mới minimal sống chung | 🟢 | Normalize xử lý cả 2 (superset). Không backfill |

Quy trình review: (a) đọc mapper + chạy unit test §5.2; (b) diff repo — chỉ `ensureDocs` đổi, `applyDelta`/
`stampFinal`/`findNotFinal` nguyên vẹn; (c) diff worker — chỉ di chuyển 2 dòng enroll; (d) click-through UI dev.

### 6.1. Kết quả review (02/08) — ✅ PASS

| # | Rủi ro | Kết quả | Bằng chứng |
|---|---|---|---|
| 1 | Normalize THIẾU field so với entity | ✅ | `mapProps` khai return type `KenoDrawBettingStatsEntity` tường minh, KHÔNG `as` — `rg " as [A-Z]" betting-stats-mapper.ts` → 0 match. Đối chiếu 11 field entity ↔ 11 field `mapProps`: đủ |
| 2 | Doc rỗng vào `evaluateAlerts` trước khi merge | ✅ | `getByDrawId` → `findOne` (mapper), `findChangedSince` → `findMany` (mapper). Chỉ `findNotFinal` dùng `findManyAsDocuments` nhưng đọc đúng 2 field `drawId`/`lastEntryId` + tự guard `typeof === "string"` |
| 3 | Kỳ tạo giữa invocation trễ enroll ~60s | ✅ | JSDoc class sync worker mục "Mỗi invocation" bước 1 ghi rõ trade-off + căn cứ (chu kỳ 6–8 phút, entries nằm yên trong `keno_ticket_entries` insert-only nên KHÔNG mất) |
| 4 | Xoá skeleton làm `applyDelta` lệch path | ✅ | `incBy` vẫn lọc delta 0 (không "sửa" để ghi field 0) — đúng thiết kế, normalize phía đọc lo phần thiếu |
| 5 | Comment stale còn nhắc "repo seed doc" | ✅ **đã sửa** | `rules/stats-shape.ts` JSDoc viết lại: consumer = mapper (normalize phía đọc) + accumulator (delta). Sửa thêm 1 chỗ sót ngoài checklist: `stats-accumulator.ts` field `byPlayType` còn ghi "factory dùng chung với **repo seed doc**" → đổi sang "mapper normalize phía đọc" |
| 6 | Doc cũ full-skeleton + doc mới minimal sống chung | ✅ | Unit test case 3 (`doc FULL kiểu cũ + field thừa`) PASS — field lạ (`entries` per-slot, `extraLegacyField`) bị bỏ qua, không crash |

**Unit test §5.2 đã viết & PASS** (`packages/game-keno-application/test/infras/betting-stats-mapper.test.ts`,
3 case: doc RỖNG / PARTIAL / FULL-kiểu-cũ) — đúng 3 checkbox yêu cầu trong §5.2.

**Quyết định review bổ sung:** `updatedAt` KHÔNG default trong mapper (giữ nguyên `doc.updatedAt`). Lý do đã
ghi thành comment tại chỗ: mọi đường ghi đều set field này, và `findChangedSince` dùng `$gt: Date` nên doc
dị dạng thiếu `updatedAt` không bao giờ vào hàng đợi alert — default giả (epoch) chỉ che lỗi thay vì để nó
lộ ra. Cùng logic cho `lastEntryId` (giữ `undefined` — ngữ nghĩa "chưa áp batch nào", khớp filter `$lt`).

Verify đã chạy: `check-types` PASS `game-keno` + `game-keno-application`; unit test mapper PASS.
Chưa chạy: §5.3–5.5 (test luồng dọc + click-through UI + enroll latency — cần môi trường dev).

## 7. Rollback

Revert commit. Doc đã tạo kiểu tối giản sau revert vẫn hoạt động với code cũ **KHÔNG hoàn toàn** (reader cũ
truy cập thẳng `bp.bigSmall.big` trên doc chưa từng có cược sẽ nổ) → rollback an toàn = revert code + chạy
1 lần script bù skeleton cho các doc `final:false` thiếu `byPlayType` (viết sẵn lệnh mongosh trong PR
description khi implement). Doc đã final không ai ghi nữa nhưng vẫn được ĐỌC → script bù chạy cho cả doc
final thiếu field nếu phải rollback.
