# p0-04 — `ensureDocs` tối giản + mapper normalize (phía đọc) + enroll 1 lần/invocation

> **Nguồn:** `.cursor/analysis/max3dpro-stats-worker-simplification.analysis.md` §5.6 + §5.7 · **Phase:** P0 ·
> **Phụ thuộc:** p0-02 (`beforeLoop`, mô hình `$inc`). **Blocks:** — .
> **Bản chuẩn:** Keno `p0-03-keno-minimal-docs-read-defaults`.

## Mục tiêu

1. **Bỏ skeleton `$setOnInsert`** trong `ensureDocs`: skeleton chỉ chạy lúc INSERT → thêm field mới thì doc
   cũ vẫn thiếu → reader kiểu gì cũng phải chịu field thiếu → skeleton là an toàn giả + default rải 2 nơi.
2. **Normalize 1 chỗ duy nhất ở `BettingStatsMapper`** (phía đọc) — thay `{...rest} as Entity` spread mù
   (`betting-stats-mapper.ts:12-13`) bằng normalize tường minh. Schema evolution: field mới = entity + 1
   dòng default mapper, không migration.
3. **Enroll dời khỏi tick** — `listUnfinishedDrawIds` + `ensureDocs` chạy 1 lần đầu invocation (`beforeLoop`).

**KHÔNG thuộc plan này:** đổi cơ chế đóng sổ (p0-02); đổi `applyDelta`. Không đổi shape entity.

## Pattern tham chiếu

- Keno `p0-03` §1 (`ensureDocs` 2 field), §2 (mapper normalize field-by-field), §3 (enroll `beforeLoop`).
- Pro `betting-stats-repo.ts` (thêm `ensureDocs`), `betting-stats-mapper.ts:11-14` (spread mù — cái bị thay).
- Pro `draw-repo.ts:465-473` (`getUnfinishedDraws` — thêm `listUnfinishedDrawIds` hoặc `.map(d=>d.drawId)`).
- `game-max3dpro/entities/betting-stats.ts` + `DrawBettingStatsBase` (game-core) — danh sách field chuẩn.

## 1. `listUnfinishedDrawIds` — draw-repo.ts (Pro CHƯA có)

Pro có `getUnfinishedDraws(statuses)` trả full `DrawEntity[]`. Thêm method nhẹ:

```typescript
/** Chỉ drawId các kỳ chưa hoàn thành — enroll stats docs (projection nhẹ). */
async listUnfinishedDrawIds(): Promise<string[]> {
  const docs = await this.findManyAsDocuments(
    { status: { $in: [...DRAW_UNFINISHED_STATUSES] } },
    { projection: { drawId: 1 }, sort: { drawId: -1 } },
  );
  return docs.map((d) => d.drawId);
}
```

(Hoặc tái dùng `getUnfinishedDraws().map(d=>d.drawId)` nếu không muốn thêm method — nhưng projection nhẹ
hơn; chốt: thêm method riêng theo mẫu Keno.)

## 2. `ensureDocs` tối giản — betting-stats-repo.ts

```typescript
/**
 * Tạo doc stats TỐI THIỂU cho kỳ chưa có (idempotent). CHỈ seed final + updatedAt:
 * final (hàng đợi findNotFinal/stampFinal), updatedAt (cursor ops-alerts). KHÔNG skeleton
 * totals/byPlayType — $inc của applyDelta tự tạo path; full shape do mapper normalize phía đọc.
 * Doc mới KHÔNG có lastEntryId → filter $lt của applyDelta vẫn khớp (null < string). Gom 1 bulkWrite.
 */
async ensureDocs(drawIds: string[]): Promise<void> {
  if (drawIds.length === 0) return;
  const ops = drawIds.map((drawId) => ({
    updateOne: {
      filter: { drawId },
      update: { $setOnInsert: { [f("final")]: false, [f("updatedAt")]: new Date() } },
      upsert: true,
    },
  }));
  await this.bulkWrite(ops, { ordered: false });
}
```

## 3. Mapper normalize — betting-stats-mapper.ts

Thay `mapProps` spread mù bằng normalize tường minh, return type khai `Max3dproDrawBettingStatsEntity`
(KHÔNG `as`):

```typescript
protected mapProps(doc: Document): Max3dproDrawBettingStatsEntity {
  return {
    id: doc._id.toHexString(),
    drawId: doc.drawId,
    final: doc.final ?? false,
    lastEntryId: doc.lastEntryId ?? null,
    updatedAt: doc.updatedAt,
    totals: normalizeTotals(doc.totals),          // từng field ?? 0 (revenue/entries/sets/commission/largeBetCount)
    byPlayType: normalizeByPlayType(doc.byPlayType), // multiNumber/multiDigit deep-merge emptyPlayTypeStat
    tripletStakes: doc.tripletStakes ?? {},
    byTenant: doc.byTenant ?? {},
    topPotential: doc.topPotential ?? [],
  };
}
```

- Helper module-level (KHÔNG export). `normalizeByPlayType`: base `emptyByPlayType()` (2 mode), mỗi mode
  merge `amount/units/boards/entries ?? 0`. LƯU Ý p1-01 xoá `entries` per-mode → khi merge thì compiler
  tự bắt (lợi ích normalize tường minh).
- **KHÔNG có `topPairs`/`topAccounts`** (đã xoá p0-01 — drain sang collection phụ). Nếu quên là lỗ type.
- Danh sách field phải khớp `Max3dproDrawBettingStatsDoc` + `DrawBettingStatsBase` (đọc lúc implement —
  KHÔNG dựa bảng plan làm nguồn cuối). `updatedAt`/`lastEntryId` KHÔNG default giả (giữ nguyên — mọi đường
  ghi set; doc dị thiếu `updatedAt` không vào hàng đợi alert → để lộ thay vì che, như quyết định Keno).

## 4. Enroll 1 lần/invocation — sync-betting-stats.ts

Thêm cuối `beforeLoop` (đã có từ p0-02):

```typescript
const unfinishedIds = await this.drawRepo.listUnfinishedDrawIds();
await this.statsRepo.ensureDocs(unfinishedIds);
```

XOÁ enroll khỏi `runTick` (nếu p0-02 còn để trong tick). `runTick` còn: findNotFinal → drain per-draw →
đóng dấu. Bất biến "kỳ nhận entry đều có doc `final:false`" duy trì theo NHỊP INVOCATION (≤60s); kỳ mới
giữa invocation: entries nằm yên trong `max3dpro_ticket_entries` (insert-only) → invocation sau enroll +
drain, KHÔNG mất. GHI RÕ JSDoc `beforeLoop`.

## 5. Danh sách file

| File | Việc |
|---|---|
| `.../repos/draw-repo.ts` | +`listUnfinishedDrawIds` (§1) |
| `.../repos/betting-stats-repo.ts` | +`ensureDocs` (§2) |
| `.../mappers/betting-stats-mapper.ts` | normalize tường minh (§3) |
| `.../operations/sync-betting-stats.ts` | enroll → `beforeLoop` (§4) |

KHÔNG chạm: entity, indexes, evaluate-alerts, pair/account repo. KHÔNG migration (doc cũ qua normalize là
superset). Pair/account mapper đã field-by-field từ p0-01 (không spread mù).

## 6. Đánh giá & verify

1. `check-types` `@megawin/game-max3dpro-application` (+`game-max3dpro`).
2. **Test normalize (quan trọng nhất):** unit test mapper (vitest/tsx theo tiền lệ repo):
   - Doc RỖNG (chỉ `_id,drawId,final,updatedAt`) → entity đủ shape: `totals.revenue===0`,
     `byPlayType.multiNumber.amount===0`, `tripletStakes==={}`, `topPotential===[]`.
   - Doc PARTIAL (chỉ `byPlayType.multiNumber` + `totals.revenue`) → multiNumber giữ, multiDigit zero-stat.
   - Doc FULL kiểu cũ (còn field thừa `topPairs`/`topAccounts` legacy) → giá trị giữ, field lạ bỏ qua
     không crash.
3. **Luồng dọc dev:** tạo kỳ → invocation đầu enroll (Compass: doc 4 field) → cược → tick sau `$inc` tạo
   path → Operations render kỳ CHƯA cược (toàn 0, không crash) + kỳ CÓ cược.
4. **Consumer đọc:** `get-ops-snapshot` + `evaluate-ops-alerts` (p0-03) nhận entity qua mapper — click-through
   Operations 2 tab sau deploy dev.
5. Enroll latency: kỳ mới giữa invocation xuất hiện hàng đợi ở invocation kế (≤60s).

## 7. Review code & rủi ro

| # | Rủi ro | Mức | Kiểm |
|---|---|---|---|
| 1 | Normalize THIẾU field so entity (compile qua nếu `as`) → runtime undefined | 🔴 | Cấm `as Max3dproDrawBettingStatsEntity`; return type tường minh; đối chiếu từng field |
| 2 | Doc rỗng vào `evaluate-ops-alerts` trước merge | 🟠 | Mọi đường đọc qua mapper (`getByDrawId`/`findChangedSince` = findMany, KHÔNG findManyAsDocuments) |
| 3 | Kỳ tạo giữa invocation trễ ~60s — tưởng bug | 🟡 | JSDoc `beforeLoop` ghi trade-off + căn cứ |
| 4 | Xoá skeleton làm `applyDelta` path lệch | 🟡 | Đúng thiết kế — normalize lo; KHÔNG "sửa" incBy ghi field 0 |
| 5 | Quên bỏ `topPairs`/`topAccounts` khỏi normalize (đã xoá entity p0-01) | 🟠 | Grep mapper → 0 ref 2 field; compiler bắt nếu entity đã xoá |
| 6 | Doc cũ full + doc mới minimal sống chung | 🟢 | Normalize superset xử lý cả 2 |

Quy trình: (a) đọc mapper + unit test §6.2; (b) diff repo (chỉ `ensureDocs`); (c) diff worker (chỉ di
chuyển enroll); (d) click-through UI dev.

## 8. Rollback

Revert commit. Vì dự án chưa deploy, không có doc thật kiểu tối giản cần bù skeleton (bài học Keno Q5).
Nếu đã chạy dev: doc minimal sau revert đi qua reader cũ (truy cập thẳng `stats.byPlayType.multiNumber`)
sẽ nổ → revert an toàn = revert cùng p0-02 (nơi mapper/ghi đổi mô hình).



