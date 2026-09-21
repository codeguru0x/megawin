# p0-02 — Idempotent `place-bet` (vá bug tài chính)

> Nguồn: `.cursor/analysis/system-ratelimit-idempotency.analysis.md`
> Overview: `./00-overview.md` · Phase P0 · Chặn bởi: `p0-01` (chỉ nhánh fingerprint guard)

**Đây là plan quan trọng nhất của cả bộ.** Hiện tại `place-bet` cho phép duplicate submit → **2 vé + 2
lần debit ví thật**. Plan này vá lỗ đó.

## Vấn đề chính xác (đã verify, không phỏng đoán)

`tx` **luôn sinh server-side mỗi lần gọi**:
`packages/game-keno-application/src/use-cases/place-bet/place-bet.ts:157` → `debitService.generateTx()`
→ `packages/game-core-application/src/services/debit-player-service.ts:175-177` → `generateId()` =
UUIDv7 (`packages/shared/src/utils/unique.ts:34`).

Ba lớp trông như chống trùng nhưng **không lớp nào chặn**:

| Lớp | Vị trí | Vì sao không chặn |
|---|---|---|
| `tx_intents` unique `{tx}` | `packages/game-core/src/indexes/index.ts:136-139` | 2 request → 2 `tx` khác → 2 doc hợp lệ |
| Tenant debit idempotent theo `tx` | `packages/tenant-gateway/src/transaction/types.ts:127` | Cùng lý do |
| Ticket unique `{accountId, ticketNo}` | `packages/game-keno/src/indexes/index.ts:70-74` | `ticketNo` từ counter `ticket_counters` tăng dần (`ticket-counter-repo.ts:42-62`) → luôn khác |

## Giải pháp: `tx` dẫn xuất tất định (Mongo-native, 0 RTT thêm)

WAL insert **đã nằm đúng chỗ cần thiết** — trước khi gọi tenant debit
(`debit-player-service.ts:191` rồi `:195`) — và **đã có unique index `{tx}`**. Nó đã là idempotency
store bền vững, chỉ thiếu một thứ: `tx` phải tất định.

```
Request 1: tx = derive(accountId, key) = X → insert WAL OK → debit → save → COMPLETED
Request 2: tx = derive(accountId, key) = X → insert WAL DUPLICATE KEY
                                            → đọc WAL phase:
                                              COMPLETED     → replay: trả kết quả cũ (200)
                                              DEBIT_PENDING → 409 IDEMPOTENCY_CONFLICT (đang xử lý)
```

Vì sao đúng về tiền: kể cả khi race lọt qua, cùng `tx` → tenant trả `duplicate: true` và **không
double-debit** (`transaction/types.ts:127,280`). Unique index là lớp chặn, invariant tenant là lưới an toàn.

## Hai nhánh, phụ thuộc khác nhau

| Nhánh | Khi nào | Cơ chế | Redis? |
|---|---|---|---|
| **A. Có `Idempotency-Key`** | Tenant gửi header | `tx` tất định + WAL unique index | ❌ Không cần |
| **B. Không có key** (fingerprint guard) | Tenant chưa cập nhật | `hash(accountId + canonical(body))` trong cửa sổ ngắn → 409 | ✅ Cần (`p0-01`), **fail-open** |

Nhánh A là ràng buộc tài chính → phải luôn đúng → Mongo. Nhánh B là suy đoán ý định người dùng →
fail-open, Redis down thì cho qua. **Không được** đảo hai triết lý này.

Nếu cần ship gấp: làm nhánh A trước, hoãn B. Nhưng khi đó tenant chưa cập nhật SDK **vẫn không được
bảo vệ** — phải nêu rõ khi quyết.

---

# PHẦN A — CODE (AI agent implement)

> Chỉ code production. **Không** viết test ở Phần A. Kết thúc Phần A: `pnpm check-types` xanh +
> `oxlint` không error. Test đỏ ở Phần B → quay lại đây, ghi `A-fix: <lý do>`.
>
> ⚠️ Plan này đụng **đường tiền**. `typescript/no-floating-promises` / `no-misused-promises`
> **không được** disable ở bất kỳ file nào trong plan (`oxlint-lint-conventions.mdc` §d) — mọi
> Promise phải `await` hoặc `void` tường minh.

## Bước 1 — Hàm derive `tx` (pure, phải test bằng vector cố định)

Vị trí: `packages/game-core-application/src/services/debit-player-service.ts` — thêm method cạnh
`generateTx()` để developer chỉ cần biết `DebitPlayerService` (đúng lý do đã ghi ở JSDoc `:170-173`).

```ts
/**
 * Dẫn xuất `tx` TẤT ĐỊNH từ idempotency key của client — cùng input luôn cho cùng `tx`.
 *
 * Nhờ đó request trùng đập vào unique index `{tx}` của `tx_intents` và bị phát hiện,
 * thay vì tạo giao dịch thứ hai. Dùng UUIDv5 (namespace + name) để kết quả vẫn là
 * UUID hợp lệ — tenant validate format `tx` không bị ảnh hưởng.
 *
 * ⚠️ CÔNG THỨC LÀ CONTRACT: đổi namespace, đổi thứ tự field, hay đổi cách chuẩn hoá
 * sẽ làm MỌI key đã phát hành mất tính idempotent. Có unit test vector cố định canh việc này.
 */
deriveTx(accountId: string, idempotencyKey: string): string
```

Ràng buộc bắt buộc:

- **UUIDv5** (`uuid@^14` đã là dep của `@megawin/shared` — `packages/shared/package.json:88`; kiểm tra
  export `v5`, nếu không có thì `sha256Hex` (`packages/shared/src/utils/hash.ts:16`) rồi format lại
  thành UUID và **ghi rõ version trong công thức**).
- Namespace UUID **hằng số hard-code**, khai 1 chỗ kèm JSDoc "không đổi giá trị này".
- Name = `` `v1|${accountId}|${idempotencyKey}` `` — có prefix version để sau này đổi công thức mà
  key cũ vẫn resolve đúng.
- Scope theo `accountId` → player A không thể đoán/chiếm key của player B.
- **Unit test vector cố định**: input cụ thể → output hex cụ thể, hard-code trong test. Đổi công thức
  = test đỏ. Đây là test quan trọng nhất của plan.

## Bước 2 — Nhận `Idempotency-Key` từ HTTP

`extractClientIpFromApiGatewayV2` (`@megawin/shared/utils/ip`) là tiền lệ cho việc đọc từ event
(`handlers/keno/place-bet.ts:154`). Làm tương tự cho header.

- Header đọc **case-insensitive** (API Gateway v2 thường lowercase nhưng không được giả định).
- Validate: độ dài 8–128, charset an toàn (`[A-Za-z0-9_-]`). Sai → `400` qua Zod, **không** im lặng bỏ.
- **Không** thêm vào body schema — đây là header, không phải payload. Body schema
  (`kenoPlaceBetBodySchema`) giữ nguyên → không breaking change.
- Truyền xuống use-case qua `PlaceBetInput` thành field mới **optional**: `idempotencyKey?: string`.
  Sửa DTO ở cả 7 game (`packages/game-{game}-application/.../place-bet/dto/place-bet.dto.ts`).

## Bước 3 — Luồng trong `PlaceBetUseCase` (×7 game)

Sửa tại chỗ `tx` đang được sinh (keno: `place-bet.ts:157`):

```ts
const tx = input.idempotencyKey
  ? this.debitService.deriveTx(input.accountId, input.idempotencyKey)
  : this.debitService.generateTx();   // giữ nguyên hành vi cũ khi không có key
```

Rồi bắt duplicate key error ở bước debit và xử lý replay. Yêu cầu:

- Nhận diện duplicate key **theo code lỗi Mongo (11000)**, **không** theo chuỗi message.
- `insertWal` hiện bọc mọi lỗi thành `serviceUnavailable` (`debit-player-service.ts:252-258`) →
  **phải sửa** để duplicate key thoát ra phân biệt được, ví dụ throw
  `AppException.error(APP_ERROR_CODES.IDEMPOTENCY_CONFLICT, ...)`. Cẩn thận: đây là code đường tiền
  dùng chung 7 game, đọc kỹ trước khi đổi.
- Đọc WAL theo `tx` → phân nhánh theo `phase`:
  - `COMPLETED` → replay (Bước 4).
  - `DEBIT_PENDING` → `409 IDEMPOTENCY_CONFLICT`, message UI: *"Yêu cầu đang được xử lý, vui lòng chờ
    và thử lại."* — **không** trả 200 rỗng.
  - `ROLLED_BACK` / `MANUAL_REVIEW` → `409` với message khác (giao dịch trước đã bị hoàn/đang kiểm tra).
- **Không** bỏ qua bất kỳ comment bước `── N. ──` hiện có; cập nhật cho khớp logic mới
  (`code-quality-standards.mdc` §4 — cấm xoá comment khi sửa code).
- Áp dụng **cả 7 game**. Xương sống WAL giống 1:1 nên diff gần như đồng dạng — nhưng thứ tự bước khác
  nhau (keno validate tenant ở bước 2, mega645 sau pricing) → **đọc từng file**, không sed hàng loạt.

## Bước 4 — Replay: trả lại kết quả cũ

`PlaceBetOutput` (`dto/place-bet.dto.ts:49-68`) gồm `ticketId`, `ticketNo`, `status`, `balance`,
`drawPlan`, `pricing`, `boardCount`, `entryCount`.

Ticket tra được theo `tx` (cần index — Bước 5) → có đủ mọi field **trừ `balance`** (`balance` là số dư
sau debit, lấy từ response tenant).

**Quyết định cần chốt khi làm plan** — 2 lựa chọn, ghi rõ lựa chọn đã dùng vào code comment:

| Cách | Ưu | Nhược |
|---|---|---|
| **Gọi lại tenant debit với cùng `tx`** (khuyến nghị) | Dùng đúng invariant đã cam kết: tenant trả `duplicate: true` + **số dư hiện tại** (`transaction/types.ts:277-280`). Không đổi schema. Số dư trả về **tươi**, đúng hơn số cũ | +1 HTTP call tenant trên đường replay (chỉ xảy ra khi có duplicate — hiếm) |
| Lưu `balance` vào WAL lúc `markCompleted` | Không gọi tenant | Đổi `TxIntentDoc` (đường tiền); trả số dư **cũ**, có thể đã lệch thực tế → dễ gây khiếu nại |

Khuyến nghị cách 1 vì nó biến `duplicate: true` — thứ tenant *đã* phải implement — thành đường xử lý
chính thức, không thêm nguồn sự thật mới.

## Bước 5 — Index `{tx}` trên ticket ×7 game

**Bắt buộc** — không có thì Bước 4 không tra được. Hiện **không có index nào trên `tx`** (đã verify:
field tồn tại, vd `packages/game-keno/src/entities/ticket.ts:251`, nhưng grep `indexes/index.ts` của cả
7 game không có).

Thêm vào `packages/game-{game}/src/indexes/index.ts`, mục `Tickets`, theo đúng shape `IndexSpec`
hiện có (`collection` / `key` / `options` / `purpose`):

```ts
{
  collection: KenoCollections.Tickets,
  key: { tx: 1 },
  options: {
    unique: true,
    name: "idx_tx_unique",
    partialFilterExpression: { tx: { $type: "string" } },
  },
  purpose: "Tra ticket theo tx cho idempotent replay; unique chặn 2 vé cùng 1 giao dịch",
},
```

⚠️ **Kiểm tra dữ liệu trước khi tạo unique index trên production.** Ticket cũ có thể `tx` null/thiếu
hoặc (nếu từng có bug) trùng. `partialFilterExpression` loại doc không có `tx` dạng string, nhưng
**vẫn phải** chạy query đếm trùng trước:

```js
db.kenoTickets.aggregate([
  { $match: { tx: { $type: "string" } } },
  { $group: { _id: "$tx", n: { $sum: 1 } } },
  { $match: { n: { $gt: 1 } } },
])
```

Có trùng → **dừng, báo cáo**, không tự xoá dữ liệu vé.

## Bước 6 — Map `IDEMPOTENCY_CONFLICT` → 409

`packages/shared/src/errors/http-status.ts` — `CODE_STATUS_MAP` thiếu code này → hiện rơi về default
400 (`:50`), client không phân biệt được với lỗi validate. Thêm 1 dòng:

```ts
  [APP_ERROR_CODES.IDEMPOTENCY_CONFLICT]: 409,
```

Code đã có sẵn ở `error-codes.ts:58` — **không** tạo code mới.

## Bước 7 — Fingerprint guard (nhánh B, cần `p0-01`)

Khi **không** có `Idempotency-Key`: `@megawin/guard` chặn cùng `accountId` + cùng body trong cửa sổ ngắn.

- Key: `guard:idem-fp:v1:place-bet:{hashKeyPart(accountId + canonicalBody)}`.
- `canonicalBody` **phải ổn định**: sort key object, sort `drawIds`, sort `boards` theo thứ tự tường
  minh. **Không** `JSON.stringify` thô (thứ tự field khác → fingerprint khác → guard vô dụng). Đây
  chính là lỗi `cache-design.mdc` §2.3 đã cảnh báo cho `keyOf`.
- Cửa sổ mặc định **5s**, là **hằng số trong `constants.ts`**, không rải rác.
- **Fail-open**: Redis lỗi → cho qua + log.
- **Shadow mode trước**: chỉ log, không chặn, cho tới khi `p2-01` có số liệu xác nhận player thật
  không bấm 2 vé giống hệt trong 5s. Bật chặn là bước riêng, có chủ đích.

## Bước 8 — Đồng bộ `player-sdk` (BẮT BUỘC, không có compiler bảo vệ)

`api-player-sdk-sync.mdc`: sửa `apps/api-player/src/handlers/{game}/place-bet.ts` → **phải** sửa SDK
cùng PR. `pnpm --filter @megawin/player-sdk check-types` PASS **không** nghĩa là đã đồng bộ.

- Thêm cách truyền `Idempotency-Key` vào `placeBet` của **cả 7** `packages/player-sdk/src/apis/{game}.ts`.
- JSDoc: `@throws {@link ApiClientError}` cho `IDEMPOTENCY_CONFLICT` (409) và `TOO_MANY_REQUESTS` (429).
- `@example` phải **copy-paste chạy được** với field mới.
- **Cấm leak backend** (`player-sdk-jsdoc.mdc`): không nhắc `tx_intents`, `WAL`, `MongoDB`, `UseCase`,
  đường dẫn `packages/...`. Diễn đạt theo hợp đồng HTTP: *"gửi cùng `Idempotency-Key` khi retry để
  server không tạo vé thứ hai"*.
- Ghi chú maintainer (nếu cần) bằng `//`, **không** trong `/** */` — đã có sự cố leak rule nội bộ ra
  TypeDoc công khai.
- `CHANGELOG.md`: mục `### Added`. **Không** breaking (header tùy chọn) → **MINOR**. **Không tự bump**
  `version` trong `package.json`.
- Verify bằng grep checklist của `player-sdk-jsdoc.mdc`, và nếu sửa JSDoc thì build TypeDoc thật
  (`cd packages/player-sdk && npx typedoc`) rồi grep `docs/` — không đoán từ source.

---

# PHẦN B — TEST (viết SAU khi Phần A xong)

> Không sửa `src/` ở Phần B. Test đỏ = Phần A sai.
>
> **Đây là plan đường tiền.** Test ở đây không được dừng ở "HTTP trả 200/409". **Phải đếm bản ghi
> thật trong DB**: số vé, số doc WAL, số lần gọi tenant debit. Bug tài chính đi qua được mọi test chỉ
> đọc status code.

## B0 — Xác nhận môi trường

| # | Việc | Kỳ vọng | Nếu sai |
|---|---|---|---|
| 0a | `docker info` | Daemon chạy | Dừng |
| 0b | Mongo container qua `global-setup-mongo`; Redis 8.6 qua `global-setup-redis` (chỉ cần cho nhánh B) | Cả 2 up | Dừng |
| 0c | Mongo container là **replica set** | `rs.status()` OK | Không có RS thì không test được transaction/session — báo lại trước khi viết test |
| 0d | Dữ liệu test **scope đúng DB test** | `test-data-safety.mdc` | **CẤM** nới filter cleanup không scope — xoá nhầm là mất data thật |

## B1 — Unit test (PURE, không DB)

`pnpm --filter <pkg> test:unit`

### `derive-tx.test.ts` — **test quan trọng nhất của plan**

| # | Test | Cách xác nhận PASS | Vì sao tồn tại |
|---|---|---|---|
| 1 | **Vector cố định**: input cụ thể → output hex **hard-code trong test** | `toBe("<hex>")` | Công thức là **contract**. Đổi nó làm mọi key đã phát hành mất tính idempotent. Đây là test duy nhất chặn được việc đó |
| 2 | Gọi 100 lần cùng input → cùng output | `new Set(results).size === 1` | Tất định. Lẫn `Date.now()`/random vào là hỏng toàn bộ thiết kế |
| 3 | `accountId` khác, key giống → `tx` **khác** | `not.toBe()` | Thiếu → player A replay được key của player B |
| 4 | `accountId` giống, key khác → `tx` khác | `not.toBe()` | Cơ bản |
| 5 | Độ dài/charset output khớp ràng buộc field `tx` | Regex + length | `tx` ghi vào Mongo + gửi sang tenant; vượt giới hạn là lỗi runtime |
| 6 | Ký tự unicode/emoji/khoảng trắng trong key → không crash, vẫn tất định | Gọi 2 lần, so | Header do client kiểm soát |

### `canonical-body.test.ts`

| # | Test | Cách xác nhận PASS | Vì sao tồn tại |
|---|---|---|---|
| 7 | Đổi **thứ tự field** → **cùng** fingerprint | `toBe()` | JSON không đảm bảo thứ tự key; thiếu → double-tap không bị bắt |
| 8 | Đổi thứ tự trong `drawIds` → **cùng** fingerprint | `toBe()` | Cùng ý định người dùng |
| 9 | Đổi **giá trị** (`amount`, `numbers`) → fingerprint **khác** | `not.toBe()` | Đây là ranh giới "cùng ý định" vs "cược khác". Sai hướng này = chặn oan cược thật |
| 10 | Field `undefined` vs **thiếu** field → cùng fingerprint | `toBe()` | SDK khác nhau serialize khác nhau |
| 11 | Nested object/array lồng nhau → vẫn tất định | Gọi 2 lần | Body `place-bet` có `boards[]` lồng |

### `idempotency-key-validation.test.ts`

| # | Test | Cách xác nhận PASS |
|---|---|---|
| 12 | Key hợp lệ → pass | Không throw |
| 13 | Key quá dài / rỗng / ký tự cấm → **400**, message tiếng Việt | `toThrow` + message **không** chứa tên class/field (`error-handling-conventions.mdc`) |

## B2 — Integration test (Mongo + Redis thật)

### `idempotent-place-bet.test.ts` — đường tiền, không được bỏ test nào

Chạy **tối thiểu 1 game đầy đủ** (Keno) + **smoke 6 game còn lại** cho case #14 (chứng minh đã sửa
cả 7 chỗ, không chỉ chỗ đầu).

| # | Test | Cách xác nhận PASS — **đếm DB, không đọc status** | Vì sao tồn tại |
|---|---|---|---|
| 14 | 2 request **cùng** `Idempotency-Key` | `countDocuments(ticket) === 1` **và** `countDocuments(tx_intents) === 1` **và** tenant debit được gọi đúng **1 lần** (spy) | Chính là bug plan này vá |
| 15 | Request 2 trả **đúng** payload của request 1 | So **từng field** `PlaceBetOutput` (`ticketNo`, `ticketId`, `totalAmount`…) | Replay trả thiếu field làm client hiểu sai là vé mới |
| 16 | Request 2 khi request 1 còn `DEBIT_PENDING` → **409**, **không** tạo vé | `countDocuments(ticket) === 1` (chỉ vé của req 1, hoặc 0 nếu chưa save) | Trả 200 lúc này = client tưởng thành công khi chưa chắc |
| 17 | Cùng key, **body khác** → 409 | Không tạo vé thứ 2 | Bắt key reuse sai |
| 18 | Key khác nhau, body giống → **2 vé** (đúng ý định cược 2 lần) | `countDocuments === 2` | Chặn oan hướng ngược lại cũng là bug |
| 19 | **Song song thật**: `Promise.all` 5 request cùng key | `countDocuments(ticket) === 1`, tenant debit **1 lần**; 4 request còn lại 409 hoặc replay — **không** cái nào tạo vé | Race condition. Test tuần tự **không** bắt được. Đây là test dễ bỏ sót nhất và hậu quả nặng nhất |
| 20 | Không gửi key + fingerprint guard **shadow** → 2 vé (hành vi cũ) | `countDocuments === 2` | Chứng minh không breaking change |
| 21 | Không gửi key + fingerprint guard **enforce** → vé thứ 2 bị chặn | `countDocuments === 1` | Nhánh B hoạt động khi bật |
| 22 | Nhánh B + **Redis chết** → vẫn cho qua (2 vé), không lỗi | `countDocuments === 2`, không 5xx | Fail-open nhánh B (ngược nhánh A) |
| 23 | Nhánh A + **Redis chết** → vẫn idempotent (1 vé) | `countDocuments === 1` | **Khoá kiến trúc**: nhánh A không phụ thuộc Redis. Nếu test này đỏ → đã vô tình đặt Redis vào đường tài chính |

### `unique-index.test.ts`

| # | Test | Cách xác nhận PASS |
|---|---|---|
| 24 | Insert 2 doc cùng `{tx}` → lỗi có `code === 11000` | Assert **`err.code`**, **không** assert message — message khác nhau giữa version Mongo |
| 25 | `insertWal` map 11000 thành nhánh idempotent, **không** thành `serviceUnavailable` | Bắt đúng loại lỗi | Bug hiện tại đang nuốt 11000 thành 503 |
| 26 | Index `{tx}` tồn tại và **unique** ở **cả 7** game | `listIndexes()`, vòng lặp 7 collection | Sót 1 game = 1 game vẫn có bug |

## B3 — Không regress

| # | Lệnh / việc | Kỳ vọng |
|---|---|---|
| 27 | `pnpm --filter "@megawin/game-*-application" test` | Xanh **toàn bộ** — place-bet 7 game bị sửa |
| 28 | `pnpm --filter @megawin/player-sdk check-types` | Xanh. ⚠️ **PASS không nghĩa là đã đồng bộ** — phải đối chiếu DTO **bằng mắt**, field-by-field (`api-player-sdk-sync.mdc`) |
| 29 | `pnpm check-types` | Xanh toàn repo |
| 30 | Grep leak SDK: pattern ở `player-sdk-jsdoc.mdc` trên `packages/player-sdk/src` | Không match trong JSDoc public export |
| 31 | `cd packages/player-sdk && npx typedoc` rồi grep `docs/` các từ `tx_intents`, `WAL`, `MongoDB`, `UseCase` | Không match — **phải build thật, không đoán từ source** |

## B4 — Xác nhận thủ công (BẮT BUỘC — đường tiền)

Ghi lại kết quả cụ thể, không ghi "đã kiểm tra":

1. **Đếm trùng trên dữ liệu thật TRƯỚC khi tạo unique index** (Bước 5): aggregate `group by tx` + `count > 1`
   trên **cả 7** collection. Ghi lại con số. Có trùng → phải xử lý dữ liệu trước, nếu không
   `createIndex` sẽ **fail** và deploy đứt.
2. **Double-tap tay**: gửi 2 request giống hệt từ client thật (curl/Postman) trong < 1s, rồi query DB
   đếm vé. Ghi số.
3. **Xác nhận ví**: kiểm tra số dư tenant thay đổi **đúng 1 lần** ở case #14. Đây là điều test spy
   không chứng minh được hoàn toàn.
4. **Rollback plan**: xác nhận biết cách tắt nhanh nhánh B (env) nếu gây chặn oan ở prod.

## Definition of done

**Phần A (code):**

- [ ] `deriveTx` có JSDoc cảnh báo "công thức là contract"; là hàm **pure** (điều kiện để B1 tồn tại).
- [ ] `Idempotency-Key` đọc được, validate, truyền tới use-case ở **cả 7** game.
- [ ] Duplicate key nhận diện theo **code 11000**, không theo message; `insertWal` không còn nuốt nó
      thành `serviceUnavailable`.
- [ ] Replay trả **đủ** `PlaceBetOutput`; nhánh `DEBIT_PENDING` trả 409.
- [ ] `IDEMPOTENCY_CONFLICT` → 409 trong `http-status.ts`.
- [ ] Nhánh A **không** import gì từ `@megawin/guard`/Redis — kiểm bằng grep, không bằng niềm tin.
- [ ] `player-sdk` đã đồng bộ 7 game + CHANGELOG (MINOR), không leak backend, `@example` compile được.
- [ ] Mọi lỗi throw là `AppException`, message **tiếng Việt cho người dùng cuối**.
- [ ] Không `oxlint-disable` cho `no-floating-promises`/`no-misused-promises` ở bất kỳ file nào.
- [ ] `oxlint` + `prettier` đã chạy trên mọi path đã sửa.

**Phần B (test):**

- [ ] B0: 4 xác nhận môi trường xong (đặc biệt 0c replica set, 0d scope cleanup).
- [ ] 13 unit test (B1) xanh — gồm **vector cố định #1** và canonical #7–10.
- [ ] 13 integration test (B2) xanh — gồm **#19 (song song `Promise.all`)** và **#23 (Redis chết vẫn
      idempotent)**. Hai test này là điều kiện bắt buộc, không được hoãn.
- [ ] #26 xác nhận index unique ở **cả 7** game.
- [ ] B3 #31: build TypeDoc **thật** và grep `docs/`, không đọc source rồi đoán.
- [ ] B4: **đã ghi số đếm trùng thật** trên 7 collection trước khi tạo unique index.
- [ ] B4: đã xác nhận ví tenant chỉ bị trừ 1 lần (bằng số dư thật, không chỉ spy).
- [ ] Mọi `A-fix` phát sinh đã ghi lại.

## Không làm trong plan này

- ❌ Rate limit → `p1-01`.
- ❌ Idempotency cho endpoint khác `place-bet` → `p3-01`.
- ❌ Bắt buộc `Idempotency-Key` — đã chốt **tùy chọn** (analysis §5.2).
- ❌ **Bật chặn** fingerprint guard — shadow mode trước, bật là quyết định riêng sau `p2-01`.
