---
name: ""
overview: ""
todos: []
isProject: false
---

# Nguồn thứ 2 (context.dev) cho ResultFeed — Site mirror Vietlott, role Reference

## 1. Xác nhận phạm vi (đã hỏi user, đã trả lời)

- **Loại site:** mirror/hiển thị lại đúng kết quả Vietlott (không phải site độc lập tự thu thập).
- **Phạm vi game:** tuỳ chỉnh — user sẽ cung cấp HTML fixture cho từng game cụ thể; thiết kế phải cho phép thêm game **1 file `parse-<game>.ts` + 1 case trong switch**, không giới hạn cứng ở 1 tập game.
- **Vai trò ban đầu:** `SourceRole.Reference` — chỉ quan sát/ghi observation để so sánh, **không veto, không tự nâng lên `Verified`** (đúng nghĩa role này ở [`enums.ts`](../../../packages/resultfeed/src/entities/enums.ts) dòng 96-98). Có thể nâng lên `Confirming` sau khi đã chạy ổn định qua backoffice (`UpdateSourceUseCase`), không cần deploy lại.

**Điểm quan trọng: KHÔNG cần sửa `ContextDevProvider`.** Hiện `context-dev-provider.ts` đã được kiến trúc như **transport thứ 2 (secondary/failover) cho CÙNG site** `vietlott.vn`. Yêu cầu lần này khác: dùng đúng provider đó để fetch **một site khác** — vì `FetchProvider` chỉ nhận `{ url, method, headers }` và trả bytes thô, nó không biết/không quan tâm site nào. Đây chính là giá trị D2 (`00-overview.md`) — đổi/thêm site không đụng transport.

## 2. Đặt tên site (cần user xác nhận khi gửi HTML)

Codebase đã có sẵn 3 comment JSDoc dự đoán site này tên **`minhchinh.com`** (viết trước khi tôi vào task này):

```10:11:packages/resultfeed-application/src/sources/vietlott/vietlott-detail/adapter.ts
 * Vietlott (VD `minhchinh.com` sau này) ở `vietlott/shared/` (nhãn checksum tiếng Việt
 * chính chủ).
```

Nếu đúng site là `minhchinh.com`, plan dùng luôn slug `minhchinh`. Nếu KHÁC, chỉ cần đổi tên slug ở các bước dưới (rename thư mục + hằng số + 1 dòng registry) — không đổi cấu trúc.

## 3. Những gì tái dùng NGUYÊN VẸN — không sửa 1 dòng

| Thành phần | File | Vì sao không cần sửa |
|---|---|---|
| `ContextDevProvider` | [`providers/context-dev-provider.ts`](../../../packages/resultfeed-application/src/infras/providers/context-dev-provider.ts) | Nhận `url` bất kỳ, không hardcode domain |
| `resolveProvider` | [`providers/registry.ts`](../../../packages/resultfeed-application/src/infras/providers/registry.ts) | Đã map `ResultFeedProviderId.ContextDev` → instance |
| `FetchAndParseUseCase` | [`use-cases/fetch/fetch-and-parse.ts`](../../../packages/resultfeed-application/src/use-cases/fetch/fetch-and-parse.ts) | Nhận `adapter` qua constructor — site nào cũng chạy qua pipeline này |
| `ConsensusTickUseCase` + rules | [`use-cases/consensus/tick.ts`](../../../packages/resultfeed-application/src/use-cases/consensus/tick.ts) | Đọc `role`/`trustWeight` từ `SourceDoc` (dữ liệu), không hardcode `sourceId` nào |
| 6 collections + `RESULTFEED_INDEXES` | [`indexes/index.ts`](../../../packages/resultfeed/src/indexes/index.ts) | Mọi index khoá theo `sourceId`/`gameKey` tổng quát, không cần thêm index riêng cho site mới |
| `vietlott/shared/checksum-labels.ts` | | Nhãn CHẴN/LẺ/LỚN/NHỎ, Nhỏ/Hòa/Lớn — site mirror nhiều khả năng hiển thị lại ĐÚNG nhãn Vietlott, dùng lại được (nếu không, tự khai mapping riêng trong adapter mới — không sửa file này) |
| `seed-cursors-from-latest.ts` script | | Tự loop `Object.values(SOURCE_ADAPTERS)` — đăng ký adapter mới xong, chạy lại script này SẼ TỰ seed cursor cho site mới (dùng kỳ mới nhất đã publish trong `consensus`) |

## 4. File MỚI cần tạo

```
packages/resultfeed-application/src/sources/vietlott/minhchinh/
├── urls.ts            ← buildDetailUrl riêng site này (domain + path + query param khác vietlott.vn)
├── dom-helpers.ts      ← selector Cheerio riêng (DOM structure khác — KHÔNG tái dùng dom-helpers.ts của vietlott-detail)
├── parse-<game>.ts     ← 1 file/game, viết dần theo HTML user cung cấp
├── adapter.ts           ← SourceAdapter, sourceId = ResultFeedSourceId.Minhchinh
└── index.ts             ← barrel, export minhchinhAdapter
```

`adapter.ts` theo đúng khuôn [`vietlott-detail/adapter.ts`](../../../packages/resultfeed-application/src/sources/vietlott/vietlott-detail/adapter.ts): `planNextFetch` dùng `incrementPeriod(cursor.lastConfirmedPeriod)` (period của site mirror PHẢI cùng hệ đánh số kỳ với Vietlott — cần xác nhận khi có HTML, vì đây là điều kiện để so sánh cùng 1 kỳ), `parse` dispatch theo `gameKey` qua switch, validate qua `parsedObservationSchema` trước khi return.

**Lưu ý về checksum:** nếu site mirror KHÔNG hiển thị checksum (CHẴN/LẺ/LỚN/NHỎ...), `claimedChecksums` trả `{}` là HỢP LỆ theo schema (`z.record(...)` không có `.min()`) → `checkIntrinsic` trả `IntrinsicState.NotAvailable` (đã có sẵn giá trị này, xem [`enums.ts`](../../../packages/resultfeed/src/entities/enums.ts) dòng 139-140 — comment ghi rõ ví dụ "mirror chỉ có số"). Không phải lỗi, không chặn consensus.

## 5. Wiring — mỗi chỗ đúng 1-2 dòng

1. **[`entities/enums.ts`](../../../packages/resultfeed/src/entities/enums.ts)** — thêm vào `ResultFeedSourceId`:
   ```ts
   /** Site mirror kết quả Vietlott — nguồn thứ 2, role Reference, fetch qua context.dev. */
   Minhchinh: "minhchinh",
   ```
2. **`sources/vietlott/index.ts`** — thêm `export { minhchinhAdapter } from "./minhchinh";`
3. **`sources/registry.ts`** — thêm `[minhchinhAdapter.sourceId]: minhchinhAdapter,`

## 6. Tạo `SourceDoc` ban đầu (script idempotent, theo tiền lệ `ensureHistoricalSource`)

Chưa có `CreateSourceUseCase` qua backoffice (`UpdateSourceUseCase` chỉ update doc đã tồn tại — throw `notFound` nếu chưa có). Theo đúng tiền lệ `ensureHistoricalSource` trong [`import-historical-results.ts`](../../../packages/resultfeed-application/src/scripts/import-historical-results.ts) dòng 133-136, viết 1 lần gọi `upsertBySourceId` (script tay hoặc thêm vào 1 script setup nhỏ):

```ts
await sourceRepo.upsertBySourceId(ResultFeedSourceId.Minhchinh, {
  name: "Minhchinh.com (mirror)",
  baseUrl: "https://minhchinh.com",
  role: SourceRole.Reference,
  trustWeight: 10, // thấp — chưa có track record, không dùng cho WeightedQuorum ở role Reference
  gameKeys: [/* đúng list game user cung cấp HTML */],
  isEnabled: true,
  providerId: ResultFeedProviderId.ContextDev,
  parserVersion: "1.0.0",
  requiresRender: false,
  minIntervalMs: 60_000, // khởi điểm an toàn — điều chỉnh sau khi đo latency thật (giống P1-P8 probe ở 02-fetch-parse.plan.md §5.6)
});
```

## 7. Worker Lambda — 1 handler / game, theo khuôn `vietlott-keno.ts`

```
apps/worker-resultfeed/src/handlers/fetch/minhchinh-<game>.ts
```

Giống [`vietlott-keno.ts`](../../../apps/worker-resultfeed/src/handlers/fetch/vietlott-keno.ts) nhưng `adapter: minhchinhAdapter`, `sourceId: minhchinhAdapter.sourceId`. **`schedule` config PHẢI giống đúng handler Vietlott của game đó** (cùng `firstDrawVn`/`lastDrawVn`/`drawIntervalMs` hoặc cùng `fixed` slots) — vì đây là cùng 1 kỳ quay thật, chỉ khác nguồn đọc.

Thêm vào [`functions/fetch.yml`](../../../apps/worker-resultfeed/src/functions/fetch.yml):
```yaml
fetch-minhchinh-<game>:
  handler: src/handlers/fetch/minhchinh-<game>.handler
  timeout: 120
  events:
    - schedule:
        rate: cron(* * * * ? *)
        enabled: true
```

`serverless.yml` — KHÔNG cần sửa, `CONTEXT_DEV_API_KEY` đã có sẵn trong env (dùng chung cho mọi Lambda gọi `ContextDevProvider`).

## 8. Cursor seeding (vận hành, không phải code)

Sau khi deploy: chạy `pnpm --filter @megawin/resultfeed-application seed:cursors`. Script tự loop mọi adapter trong `SOURCE_ADAPTERS` (đã có `minhchinhAdapter` sau bước 5) × mọi `gameKey`, tìm kỳ mới nhất đã publish trong `consensus` cho game đó, neo cursor mới vào đúng kỳ đó — nguồn mới bắt đầu fetch từ kỳ TIẾP THEO, không cần backfill lịch sử riêng (vì role Reference chỉ cần so sánh kỳ tới, không cần dữ liệu cũ).

## 9. Test — theo khuôn `vietlott-detail.test.ts`

- Fixture HTML thật (do user cung cấp) lưu tại `test/html/minhchinh/<game>.html`.
- `test/sources/vietlott/minhchinh.test.ts`: assert `sourceId`, `gameKeys`, rồi từng game — `drawPeriod`, `numbersDisplay` đúng thứ tự, `claimedChecksums` (hoặc xác nhận `{}` nếu site không có checksum).
- Test `parse()` PHẢI pure — không mock `Date.now()`, đọc fixture 1 lần ở `beforeAll` (đúng rule đã áp dụng cho `vietlott-detail.test.ts`).

## 10. Checklist (mở rộng từ `02-fetch-parse.plan.md §6`)

- [ ] Adapter mới KHÔNG import gì từ `vietlott-detail/` (site không biết site khác).
- [ ] `parse()` pure, không sort/dedupe/tự tính checksum.
- [ ] Fixture HTML thật commit + test assert số & checksum (hoặc `NotAvailable` nếu không có).
- [ ] `SourceDoc.role = Reference` — xác nhận `ConsensusTickUseCase` không cho nguồn này veto (đọc lại `03-consensus.plan.md §2` khi implement, không tự suy diễn).
- [ ] `minIntervalMs` khởi điểm an toàn (≥ nhịp quay thật), đo lại sau P1-P8 probe riêng cho context.dev → site mới.
- [ ] `nextFetchAt`/schedule config khớp CHÍNH XÁC với handler Vietlott cùng game (cùng kỳ quay).
- [ ] `seed-cursors-from-latest.ts` chạy sau khi registry có adapter mới — không cần import lịch sử riêng.

## 11. Việc CHỜ user cung cấp trước khi code

1. **HTML thật** của từng game trên site mirror (đã nói sẽ gửi sau khi plan xong).
2. **Xác nhận domain** — đúng `minhchinh.com` hay site khác (chỉ ảnh hưởng slug đặt tên, §2).
3. **Xác nhận hệ đánh số kỳ (`drawPeriod`)** trên site mirror có khớp định dạng Vietlott không (VD Keno `"0294026"` 7 chữ số) — bắt buộc khớp để `incrementPeriod`/so sánh consensus hoạt động đúng.

## Không làm ở phạm vi này

- Không sửa `FetchAndParseUseCase`, `ConsensusTickUseCase`, `checkIntrinsic`, indexes.
- Không đổi role Vietlott hiện tại (`vietlott-detail` vẫn `Authoritative`).
- Không nâng role site mới lên `Confirming`/`Authoritative` ngay — để sau khi có track record, qua backoffice (`UpdateSourceUseCase`), không deploy lại.
