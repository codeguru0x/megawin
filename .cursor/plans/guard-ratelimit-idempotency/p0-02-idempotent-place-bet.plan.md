# p0-02 — Idempotent `place-bet` (vá bug tài chính)

> Nguồn: `.cursor/analysis/system-ratelimit-idempotency.analysis.md`
> Overview: `./00-overview.md` · Phase P0 · **Không bị chặn bởi plan nào** (Mongo-native, 0 Redis)

**Đây là plan quan trọng nhất của cả bộ.** Hiện tại `place-bet` cho phép duplicate submit → **2 vé + 2
lần debit ví thật**. Plan này vá lỗ đó.

> **Bối cảnh đã chốt (2026-09-22): hệ thống CHƯA deploy production, chưa tenant nào tích hợp thật.**
> Vì vậy plan làm **một cách duy nhất, không back-compat, không dual-path**:
> header `mw-idempotency-key` là **BẮT BUỘC**, `generateTx()` bị **xoá**, fingerprint guard **không làm**.
> Mọi nơi (7 game + SDK) cập nhật trong cùng PR; deploy staging là trạng thái cuối, không có
> "tenant chưa cập nhật" cần chiều.
>
> **Tên header đã đổi khi implement (2026-09-24):** plan gốc ghi `Idempotency-Key`. Wire name
> chính thức là `mw-idempotency-key` (lowercase, prefix `mw-`). Chi tiết + các quyết định khác
> không có trong bản gốc → mục **«Đã chốt khi implement»** ở cuối file.

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

## Giải pháp: `tx` cùng input → cùng giá trị (Mongo-native, 0 RTT thêm)

WAL insert **đã nằm đúng chỗ cần thiết** — trước khi gọi tenant debit
(`debit-player-service.ts:191` rồi `:195`) — và **đã có unique index `{tx}`**. Nó đã là idempotency
store bền vững, chỉ thiếu một thứ: cùng `(accountId, key)` phải ra cùng `tx`.

```
Request 1: tx = derive(accountId, key) = X → insert WAL OK → debit → save → COMPLETED
Request 2: tx = derive(accountId, key) = X → insert WAL DUPLICATE KEY
                                            → đọc WAL phase:
                                              COMPLETED     → replay: trả kết quả cũ (200)
                                              DEBIT_PENDING → 409 IDEMPOTENCY_CONFLICT (đang xử lý)
```

## Một đường duy nhất: `mw-idempotency-key` BẮT BUỘC

| Quyết định | Giá trị | Hệ quả |
|---|---|---|
| Header `mw-idempotency-key` | **BẮT BUỘC** — thiếu → `400` | Không tồn tại nhánh "không có key" → **không** cần fingerprint guard, **không** cần Redis |
| `tx` | Luôn `deriveTx(accountId, idempotencyKey)` | Không còn nhánh `generateTx()` → xoá method đó |
| Phụ thuộc Redis của `place-bet` | **0** | Ràng buộc tài chính dựa 100% vào Mongo (unique index) — điểm chết ít nhất |

Vì sao **không** làm fingerprint guard (nhánh `hash(body)` trong cửa sổ 5s) nữa:

1. Nó tồn tại **chỉ để** che cho client chưa gửi header. Header đã bắt buộc → client không gửi thì
   bị `400` ngay, không có gì cần che.
2. Nó là suy đoán ý định người dùng (2 vé giống hệt trong 5s là double-tap hay 2 lần cược thật?) —
   câu hỏi này không có dữ liệu để trả lời, và trả lời sai = **chặn oan cược thật**.
3. Nó kéo Redis vào đường tiền dưới dạng fail-open → thêm code, thêm test, thêm mode shadow/enforce
   phải canh, mà giá trị chỉ là lớp phủ cho tình huống vừa bị loại bỏ. Đúng định nghĩa **rác code**.

Vì sao đúng về tiền: cùng `tx` → unique index `{tx}` trên `tx_intents` chặn request thứ hai; kể cả
khi race lọt qua, tenant trả `duplicate: true` và **không double-debit**
(`transaction/types.ts:127,280`). Unique index là lớp chặn, invariant tenant là lưới an toàn.

---

# PHẦN A — CODE (AI agent implement)

> Chỉ code production. **Không** viết test ở Phần A. Kết thúc Phần A: `pnpm check-types` xanh +
> `oxlint` không error. Test đỏ ở Phần B → quay lại đây, ghi `A-fix: <lý do>`.
>
> ⚠️ Plan này đụng **đường tiền**. `typescript/no-floating-promises` / `no-misused-promises`
> **không được** disable ở bất kỳ file nào trong plan (`oxlint-lint-conventions.mdc` §d) — mọi
> Promise phải `await` hoặc `void` tường minh.

## Bước 1 — Thay `generateTx()` bằng `deriveTx()` (pure, phải test bằng vector cố định)

Vị trí: `packages/game-core-application/src/services/debit-player-service.ts`.

**Xoá `generateTx()`** (`:175-177`) — đã verify chỉ có **7 caller**, đúng 7 `place-bet.ts`
(`keno:157`, `lotto535:156`, `power655:147`, `max3d:144`, `max3dpro:142`, `mega645:121`,
`bingo18:128`), tất cả đều được sửa trong plan này → giữ lại là dead code + mở đường cho người sau
"tạm dùng" nhánh không idempotent. Cập nhật **cả JSDoc class** (`:5`, `:15`, `:71`, `:76`, `:146`) —
5 chỗ đang mô tả flow `generateTx()`, để nguyên là comment sai (`code-quality-standards.mdc` §4).

⚠️ `generateId()` **vẫn được dùng rộng** cho `payoutTx`/`refundTx`/`reversalTx`/`resettleId`
(≥25 chỗ) — **không** đụng tới. Chỉ xoá đúng wrapper `generateTx()` của `DebitPlayerService`.

```ts
/**
 * Dẫn xuất `tx` từ idempotency key của client — cùng input luôn cho cùng `tx`.
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

## Bước 2 — Nhận `mw-idempotency-key` từ HTTP (BẮT BUỘC)

Đọc event API Gateway v2 **một chỗ**: `packages/shared/src/utils/api-gateway-v2.ts`
(`getHeaderFromApiGatewayV2` + `extractIdempotencyKeyFromApiGatewayV2` +
`extractClientIpFromApiGatewayV2`). 1 helper dùng chung cho cả 7 handler, **không**
copy-paste 7 lần, **không** file `utils/idempotency-key.ts` riêng.

- Header đọc **case-insensitive** (API Gateway v2 thường lowercase nhưng không được giả định).
- Validate: độ dài 8–128, charset `[A-Za-z0-9_-]`. **Thiếu header** hoặc sai format → `400` với
  message tiếng Việt. **Không** fallback sinh key server-side — fallback là đúng cái nhánh vừa bị xoá.
- **Không** thêm vào body schema — đây là header, không phải payload. `kenoPlaceBetBodySchema` và 6
  schema tương ứng giữ nguyên.
- Truyền xuống use-case qua `PlaceBetInput` thành field **required**: `idempotencyKey: string`
  (**không** `?`). Sửa DTO ở cả 7 game (`packages/game-{game}-application/.../place-bet/dto/place-bet.dto.ts`).
  Required là chủ đích: compiler bắt mọi caller thiếu — đó là lưới an toàn thay cho back-compat.

## Bước 3 — Luồng trong `PlaceBetUseCase` (×7 game)

Sửa tại chỗ `tx` đang được sinh (keno: `place-bet.ts:157`) — **một dòng, không nhánh**:

```ts
const tx = this.debitService.deriveTx(input.accountId, input.idempotencyKey);
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

⚠️ **Không cần** đếm trùng dữ liệu cũ: hệ thống chưa deploy production, mọi DB là staging/test → xoá
sạch collection ticket rồi tạo index là hợp lệ. Nhưng **vẫn giữ** `partialFilterExpression` trong
spec vì nó là ràng buộc đúng về lâu dài (doc thiếu `tx` không nên chiếm slot unique).

Nếu `createIndex` fail vì trùng trên staging → **drop collection ticket của staging**, không nới
index. Ghi lại việc đã drop vào PR.

## Bước 6 — Map `IDEMPOTENCY_CONFLICT` → 409

`packages/shared/src/errors/http-status.ts` — `CODE_STATUS_MAP` thiếu code này → hiện rơi về default
400 (`:50`), client không phân biệt được với lỗi validate. Thêm 1 dòng:

```ts
  [APP_ERROR_CODES.IDEMPOTENCY_CONFLICT]: 409,
```

Code đã có sẵn ở `error-codes.ts:58` — **không** tạo code mới.

## Bước 7 — ~~Fingerprint guard~~ **ĐÃ BỎ**

Nhánh này đã bị loại khỏi scope (xem mục "Một đường duy nhất" ở đầu plan). **Không** implement
`canonicalBody`, **không** thêm key `guard:idem-fp:*`, **không** thêm shadow/enforce mode cho
idempotency, **không** import `@megawin/guard` vào đường `place-bet`.

Hệ quả kéo theo — phải kiểm bằng grep, không bằng niềm tin:

- `place-bet` (7 game) **không** import gì từ `@megawin/guard` / `@megawin/cache` / Redis.
- `@megawin/guard` **không** cần thêm `CacheNamespace` / key mới nào cho plan này.
- `p0-01` **không** còn chặn plan này — cập nhật `00-overview.md` (đã làm).

## Bước 8 — Đồng bộ `player-sdk` (BẮT BUỘC, không có compiler bảo vệ)

`api-player-sdk-sync.mdc`: sửa `apps/api-player/src/handlers/{game}/place-bet.ts` → **phải** sửa SDK
cùng PR. `pnpm --filter @megawin/player-sdk check-types` PASS **không** nghĩa là đã đồng bộ.

- `idempotencyKey` là **required** trong input `placeBet` của **cả 7** `packages/player-sdk/src/{game}/types.ts`
  — khai `idempotencyKey: string` (không `?`), khớp đúng phía server. SDK tự gắn vào header khi gửi;
  tenant **không** phải tự set header tay.
- Nếu SDK tự sinh key khi tenant không truyền: **không làm**. Key phải do tenant kiểm soát, vì chỉ
  tenant biết "retry này là cùng một ý định cược" hay "lần cược mới". SDK tự sinh = mỗi retry một key
  mới = idempotency vô nghĩa.
- JSDoc: `@throws {@link ApiClientError}` cho `IDEMPOTENCY_CONFLICT` (409), `TOO_MANY_REQUESTS` (429),
  và `BAD_REQUEST` khi thiếu/sai format key.
- `@example` phải **copy-paste chạy được**: `const idempotencyKey = createIdempotencyKey()` **ngoài**
  object rồi truyền biến vào `placeBet` — **cấm** `idempotencyKey: createIdempotencyKey()` inline
  (mỗi lần đọc example / mỗi call = key mới = idempotency vô nghĩa).
- Helper `createIdempotencyKey()` + hằng `IDEMPOTENCY_KEY_HEADER` export từ `@megawin/player-sdk`
  (`src/helpers/`). SDK **không** tự điền key khi tenant bỏ trống.
- **Cấm leak backend** (`player-sdk-jsdoc.mdc`): không nhắc `tx_intents`, `WAL`, `MongoDB`, `UseCase`,
  đường dẫn `packages/...`. Diễn đạt theo hợp đồng HTTP: *"gửi lại cùng `idempotencyKey` khi retry để
  server không tạo vé thứ hai"*.
- Ghi chú maintainer (nếu cần) bằng `//`, **không** trong `/** */` — đã có sự cố leak rule nội bộ ra
  TypeDoc công khai.
- `CHANGELOG.md`: đây là **BREAKING** (thêm required field vào input interface — đúng tiêu chí #2 của
  `player-sdk-jsdoc.mdc`) → mục `### Changed` + block **Migration**. Phiên bản hiện tại `1.0.21` →
  đề xuất `2.0.0`. **Không tự bump** `version` trong `package.json`.
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
| 0b | Mongo container qua `global-setup-mongo` | Up | Dừng |
| 0c | Mongo container là **replica set** | `rs.status()` OK | Không có RS thì không test được transaction/session — báo lại trước khi viết test |
| 0d | Dữ liệu test **scope đúng DB test** | `test-data-safety.mdc` | **CẤM** nới filter cleanup không scope — xoá nhầm là mất data thật |

> **Redis KHÔNG cần** cho plan này (nhánh fingerprint đã bỏ). Nếu thấy mình đang cần Redis để test
> `place-bet` → đã implement sai, quay lại Phần A.

## B1 — Unit test (PURE, không DB)

`pnpm --filter <pkg> test:unit`

### `derive-tx.test.ts` — **test quan trọng nhất của plan**

| # | Test | Cách xác nhận PASS | Vì sao tồn tại |
|---|---|---|---|
| 1 | **Vector cố định**: input cụ thể → output hex **hard-code trong test** | `toBe("<hex>")` | Công thức là **contract**. Đổi nó làm mọi key đã phát hành mất tính idempotent. Đây là test duy nhất chặn được việc đó |
| 2 | Gọi 100 lần cùng input → cùng output | `new Set(results).size === 1` | Cùng input → cùng `tx`. Lẫn `Date.now()`/random vào là hỏng toàn bộ thiết kế |
| 3 | `accountId` khác, key giống → `tx` **khác** | `not.toBe()` | Thiếu → player A replay được key của player B |
| 4 | `accountId` giống, key khác → `tx` khác | `not.toBe()` | Cơ bản |
| 5 | Độ dài/charset output khớp ràng buộc field `tx` | Regex + length | `tx` ghi vào Mongo + gửi sang tenant; vượt giới hạn là lỗi runtime |
| 6 | Ký tự unicode/emoji/khoảng trắng trong key → không crash, vẫn cùng input → cùng `tx` | Gọi 2 lần, so | Header do client kiểm soát |

### `canonical-body.test.ts` — **ĐÃ BỎ**

Nhánh fingerprint bị loại → không có `canonicalBody` → **không viết file test này**. Nếu thấy nó tồn
tại trong PR, nghĩa là Phần A đã implement thứ không nằm trong scope.

### `idempotency-key-validation.test.ts`

| # | Test | Cách xác nhận PASS |
|---|---|---|
| 7 | Key hợp lệ → pass | Không throw |
| 8 | Key quá dài / rỗng / ký tự cấm → **400**, message tiếng Việt | `toThrow` + message **không** chứa tên class/field (`error-handling-conventions.mdc`) |
| 9 | **Thiếu hẳn header** → **400** (không fallback sinh key) | `toThrow`; xác nhận **không** có `tx` nào được sinh | Fallback là nhánh vừa bị xoá — test này khoá việc nó bị thêm lại |
| 10 | Header viết hoa/thường khác nhau (`mw-idempotency-key`, `MW-Idempotency-Key`, `MW-IDEMPOTENCY-KEY`) → đều đọc được | 3 biến thể cùng ra 1 key | API Gateway không đảm bảo case |

## B2 — Integration test (Mongo + Redis thật)

### `idempotent-place-bet.test.ts` — đường tiền, không được bỏ test nào

Chạy **tối thiểu 1 game đầy đủ** (Keno) + **smoke 6 game còn lại** cho case #11 (chứng minh đã sửa
cả 7 chỗ, không chỉ chỗ đầu).

| # | Test | Cách xác nhận PASS — **đếm DB, không đọc status** | Vì sao tồn tại |
|---|---|---|---|
| 11 | 2 request **cùng** `mw-idempotency-key` | `countDocuments(ticket) === 1` **và** `countDocuments(tx_intents) === 1` **và** tenant debit được gọi đúng **1 lần** (spy) | Chính là bug plan này vá |
| 12 | Request 2 trả **đúng** payload của request 1 | So **từng field** `PlaceBetOutput` (`ticketNo`, `ticketId`, `totalAmount`…) | Replay trả thiếu field làm client hiểu sai là vé mới |
| 13 | Request 2 khi request 1 còn `DEBIT_PENDING` → **409**, **không** tạo vé | `countDocuments(ticket) === 1` (chỉ vé của req 1, hoặc 0 nếu chưa save) | Trả 200 lúc này = client tưởng thành công khi chưa chắc |
| 14 | Cùng key, **body khác** → 409 | Không tạo vé thứ 2 | Bắt key reuse sai |
| 15 | Key khác nhau, body giống → **2 vé** (đúng ý định cược 2 lần) | `countDocuments === 2` | Chặn oan hướng ngược lại cũng là bug |
| 16 | **Song song thật**: `Promise.all` 5 request cùng key | `countDocuments(ticket) === 1`, tenant debit **1 lần**; 4 request còn lại 409 hoặc replay — **không** cái nào tạo vé | Race condition. Test tuần tự **không** bắt được. Đây là test dễ bỏ sót nhất và hậu quả nặng nhất |
| 17 | **Không** gửi header → `400`, **0 vé**, **0 doc WAL** | `countDocuments(ticket) === 0` **và** `countDocuments(tx_intents) === 0` | Header bắt buộc phải chặn **trước** khi chạm DB. Nếu có doc WAL nghĩa là validate đặt sai chỗ |
| 18 | 2 account khác nhau dùng **cùng** giá trị key → **2 vé riêng** | `countDocuments === 2`, `tx` khác nhau | Key scope theo `accountId`; thiếu → player A chiếm được key của player B |
| 19 | Idempotent **không** phụ thuộc Redis: chạy toàn bộ #11–#16 khi **không có Redis nào chạy** | Tất cả xanh, không 5xx, không log timeout Redis | **Khoá kiến trúc.** Test này đỏ = đã vô tình đặt Redis vào đường tài chính |

### `unique-index.test.ts`

| # | Test | Cách xác nhận PASS |
|---|---|---|
| 20 | Insert 2 doc cùng `{tx}` → lỗi có `code === 11000` | Assert **`err.code`**, **không** assert message — message khác nhau giữa version Mongo |
| 21 | `insertWal` map 11000 thành nhánh idempotent, **không** thành `serviceUnavailable` | Bắt đúng loại lỗi | Bug hiện tại đang nuốt 11000 thành 503 |
| 22 | Index `{tx}` tồn tại và **unique** ở **cả 7** game | `listIndexes()`, vòng lặp 7 collection | Sót 1 game = 1 game vẫn có bug |
| 23 | `generateTx` **không còn tồn tại** trên `DebitPlayerService` | `expect((svc as Record<string, unknown>).generateTx).toBeUndefined()` + grep repo 0 match | Giữ lại = dead code + đường lách không idempotent |

## B3 — Không regress

| # | Lệnh / việc | Kỳ vọng |
|---|---|---|
| 24 | `pnpm --filter "@megawin/game-*-application" test` | Xanh **toàn bộ** — place-bet 7 game bị sửa |
| 25 | `pnpm --filter @megawin/player-sdk check-types` | Xanh. ⚠️ **PASS không nghĩa là đã đồng bộ** — phải đối chiếu DTO **bằng mắt**, field-by-field (`api-player-sdk-sync.mdc`) |
| 26 | `pnpm check-types` | Xanh toàn repo |
| 27 | Grep leak SDK: pattern ở `player-sdk-jsdoc.mdc` trên `packages/player-sdk/src` | Không match trong JSDoc public export |
| 28 | `cd packages/player-sdk && npx typedoc` rồi grep `docs/` các từ `tx_intents`, `WAL`, `MongoDB`, `UseCase` | Không match — **phải build thật, không đoán từ source** |
| 29 | `rg -n "generateTx" --glob '!*.md' packages apps` | **0 kết quả** — đã xoá sạch, không còn caller lẫn khai báo |
| 30 | `rg -n "@megawin/guard\|canonicalBody\|idem-fp" packages/game-*-application/src/use-cases/place-bet apps/api-player/src/handlers` | **0 kết quả** — đường tiền không chạm Redis/guard |

## B4 — Xác nhận thủ công (BẮT BUỘC — đường tiền)

Ghi lại kết quả cụ thể, không ghi "đã kiểm tra":

1. **Tạo unique index trên staging**: chạy migration index cho **cả 7** collection. Nếu fail vì trùng
   → drop collection ticket staging (được phép, chưa có dữ liệu thật) rồi chạy lại. Ghi lại
   collection nào phải drop.
2. **Double-tap tay**: gửi 2 request giống hệt (cùng `mw-idempotency-key`) từ client thật (curl/Postman)
   trong < 1s, rồi query DB đếm vé. Ghi số.
3. **Thiếu header tay**: gửi request **không** có `mw-idempotency-key` → phải nhận `400`; query DB xác
   nhận **0 vé, 0 WAL**. Ghi lại response body. Header cũ `Idempotency-Key` cũng là thiếu → `400`.
4. **Xác nhận ví**: kiểm tra số dư tenant thay đổi **đúng 1 lần** ở case #11. Đây là điều test spy
   không chứng minh được hoàn toàn.
5. **Xác nhận SDK thật**: build SDK rồi gọi `placeBet` từ một script tenant mô phỏng — xác nhận header
   `mw-idempotency-key` **thực sự** xuất hiện trên wire (đọc network log), không chỉ có trong type.

## Definition of done

**Phần A (code):**

- [ ] `deriveTx` có JSDoc cảnh báo "công thức là contract"; là hàm **pure** (điều kiện để B1 tồn tại).
- [ ] `generateTx()` **đã xoá**; 5 chỗ JSDoc của `DebitPlayerService` mô tả flow cũ đã cập nhật.
- [ ] `mw-idempotency-key` **bắt buộc**, đọc case-insensitive, validate, truyền tới use-case ở **cả 7**
      game; `idempotencyKey: string` là **required** trong DTO (không `?`).
- [ ] Duplicate key nhận diện theo **code 11000**, không theo message; `insertWal` không còn nuốt nó
      thành `serviceUnavailable`.
- [ ] Replay trả **đủ** `PlaceBetOutput`; nhánh `DEBIT_PENDING` trả 409.
- [ ] `IDEMPOTENCY_CONFLICT` → 409 trong `http-status.ts`.
- [ ] Đường `place-bet` **không** import gì từ `@megawin/guard`/`@megawin/cache`/Redis — kiểm bằng grep
      (B3 #30), không bằng niềm tin. **Không** có `canonicalBody`/fingerprint code nào tồn tại.
- [ ] `player-sdk` đã đồng bộ 7 game với `idempotencyKey` **required** + CHANGELOG **BREAKING**
      (`### Changed` + Migration), không leak backend, `@example` compile được.
- [ ] Mọi lỗi throw là `AppException`, message **tiếng Việt cho người dùng cuối**.
- [ ] Không `oxlint-disable` cho `no-floating-promises`/`no-misused-promises` ở bất kỳ file nào.
- [ ] `oxlint` + `prettier` đã chạy trên mọi path đã sửa.

**Phần B (test):**

- [ ] B0: 4 xác nhận môi trường xong (0c replica set, 0d scope cleanup). **Không** dùng Redis.
- [ ] 10 unit test (B1) xanh — gồm **vector cố định #1**, #9 (thiếu header → 400), #10 (case-insensitive).
- [ ] 13 integration test (B2) xanh — gồm **#16 (song song `Promise.all`)**, **#17 (thiếu header → 0 vé,
      0 WAL)**, **#19 (không Redis vẫn idempotent)**, **#23 (`generateTx` đã biến mất)**. Không hoãn cái nào.
- [ ] #22 xác nhận index unique ở **cả 7** game.
- [ ] B3 #28: build TypeDoc **thật** và grep `docs/`, không đọc source rồi đoán.
- [ ] B3 #29–30: grep xác nhận `generateTx` = 0 match và đường tiền không chạm guard/Redis.
- [ ] B4: đã tạo unique index trên staging thành công (ghi rõ có phải drop collection nào không).
- [ ] B4: đã xác nhận ví tenant chỉ bị trừ 1 lần (bằng số dư thật, không chỉ spy).
- [ ] B4: đã xác nhận header thật xuất hiện trên wire khi gọi qua SDK.
- [ ] Mọi `A-fix` phát sinh đã ghi lại.

## Không làm trong plan này

- ❌ Rate limit → `p1-01`.
- ❌ Idempotency cho endpoint khác `place-bet` → `p3-01`.
- ❌ **Fingerprint guard / `canonicalBody` / cửa sổ 5s** — đã loại khỏi scope (xem đầu plan). Không
  implement, không test, không để lại code chờ.
- ❌ Back-compat cho client không gửi header — hệ thống chưa deploy, không có client cũ cần chiều.
- ❌ Giữ `generateTx()` "để dùng sau" — xoá hẳn.
- ❌ Auto-fill `idempotencyKey` trong `placeBet` / trên server khi tenant bỏ trống — mỗi HTTP call
  một key mới = 2 vé. Helper `createIdempotencyKey()` chỉ sinh key **ý định mới**; tenant phải lưu
  và gửi lại khi retry.
- ❌ Đổi `tx` payout / refund / rollback / dispatch sang UUIDv5 — những đường đó **không** đi qua
  `deriveTx`; vẫn `generateId()` (UUIDv7). Chỉ place-bet debit dùng v5.

---

# Đã chốt khi implement (2026-09-24) — không có trong bản plan gốc

Các mục dưới đây **thắng** wording cũ phía trên nếu lệch. Phần B test / B4 curl phải theo đây.

## 1. Tên header trên wire: `mw-idempotency-key`

Plan gốc: `Idempotency-Key`. Đã đổi để tránh trùng header generic của proxy/app khác.

| Chỗ | Giá trị |
|---|---|
| Wire name | `mw-idempotency-key` (lowercase) |
| Hằng SDK | `IDEMPOTENCY_KEY_HEADER` — `packages/player-sdk/src/helpers/idempotency-key.ts` |
| Hằng server | `IDEMPOTENCY_KEY_HEADER` — `packages/shared/src/constants/http-headers.ts` (re-export từ `utils/api-gateway-v2`) |
| Lookup | `getHeaderFromApiGatewayV2(event, IDEMPOTENCY_KEY_HEADER)` — case-insensitive |
| 7 SDK `placeBet` | `headers: { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey }` |
| Message 400 thiếu | *"Thiếu header mw-idempotency-key..."* |
| Message 400 sai format | *"Mã mw-idempotency-key không hợp lệ..."* |

SDK **không** import `@megawin/shared` — hai hằng **trùng value**, comment hai phía nhắc phải khớp.
Header cũ `Idempotency-Key` **không** được nhận → `400` (không dual-read).

## 2. SDK helper — tenant tự tạo key, SDK không auto-fill

| Quyết định | Lý do |
|---|---|
| Export `createIdempotencyKey()` = `crypto.randomUUID()` | DX: tenant không tự viết; **một ý định cược = một lần gọi helper, rồi lưu** |
| `placeBet` **không** tự sinh key nếu thiếu | Auto-fill mỗi HTTP call = key mới = **2 vé** — không phải "compatible" |
| Server **không** auto-fill | Thiếu header → `400` **trước** use-case / WAL / debit |

## 3. Layout `packages/player-sdk/src`

Tránh chồng file ở root:

```
src/helpers/idempotency-key.ts   ← createIdempotencyKey, IDEMPOTENCY_KEY_HEADER
src/helpers/index.ts
src/types/api-types.ts
src/types/common-types.ts
src/types/index.ts
```

Barrel `@megawin/player-sdk` re-export helper + types. File root cũ (`api-types.ts`,
`common-types.ts`, `idempotency-key.ts`) đã chuyển vào thư mục trên.

## 4. Ví dụ JSDoc / TypeDoc

`const idempotencyKey = createIdempotencyKey()` **ngoài** object, rồi `placeBet({ …, idempotencyKey })`.
Hai ý định cược → hai biến. Inline `idempotencyKey: createIdempotencyKey()` trong example = sai
ngữ nghĩa, **cấm**.

## 5. Replay debit: method mới `replayDebit()` → sau đó gộp thành `replayCompletedDebit()` (§9)

Plan gốc: "gọi lại tenant debit cùng `tx`". **Không** tái sử dụng `callTenantDebit` — hàm đó có
nhánh xoá WAL khi COMPLETED. Replay chỉ gọi tenant lấy `duplicate + balance`, **không** insert /
delete WAL. `AppException` conflict: `new AppException(IDEMPOTENCY_CONFLICT, msg)` **không** truyền
`statusCode` để `CODE_STATUS_MAP` map 409 (`AppException.error()` hardcode 400).

> Method `replayDebit()` mô tả ở đây ban đầu tách riêng khỏi `resolveIdempotencyConflict()` —
> sau đó cả hai được **gộp thành `replayCompletedDebit()`**, xem chi tiết ở §9 cuối file.

## 6. CHANGELOG SDK

Plan gốc đề xuất bump major `2.0.0`. Implement ghi entry **1.0.22** (BREAKING trong prose +
Migration). **Vẫn không** tự bump `package.json` — bước manual sau review.

## 7. `tx` place-bet = UUIDv5 — **không** ảnh hưởng sort/list của MegaWin

Câu hỏi: đổi `ticket.tx` từ UUIDv7 (có timestamp, lex ≈ time) sang UUIDv5 (SHA-1, không time-order)
có phá sort / lấy dữ liệu transaction không?

**Giữ v5.** Idempotency **bắt buộc** cùng `(accountId, key)` → cùng `tx`. UUIDv7
`generateId()` mỗi call một giá trị khác → unique `{tx}` trên WAL **không** chặn double-submit.
Không thể vừa «cùng input → cùng `tx`» vừa nhét timestamp vào 48 bit đầu — thời gian đã có field riêng.

Đã đọc code (không kết luận từ graph; `deriveTx` chưa có trong index GitNexus vì chưa commit):

| Đường | Sort / lookup thật | Ảnh hưởng v5? |
|---|---|---|
| List ticket (7 game) | `{ _id: -1 }` / `createdAt`; cursor ObjectId | **Không** — không sort theo `tx` |
| `findByTx` / recovery `exists({ tx })` | Equality | **Không** |
| Unique `{ tx: 1 }` ticket ×7 | Unique string | **Không** — unique không cần thứ tự thời gian |
| WAL `findByTx` | Equality | **Không** |
| WAL `findOrphans` | filter `phase` + `createdAt < cutoff`, **sort `{ createdAt: 1 }`** | **Không** |
| Recovery rollback | `generateId()` **v7 mới**; `metadata.refTx` = tx gốc | **Không** |
| Tenant debit / `GET …/transaction/:tx/status` | Exact string | **Không** — hợp đồng là cùng `tx` = cùng ý định |
| `tx_logs` list mặc định | `createdAt DESC, _id DESC` | **Không** |
| `tx_logs` list-by-batch | `sort { tx: 1 }` + cursor `$gt` tx — **giả định v7** | Place-bet: `batchId = tx`, **1 dòng** → sort vô nghĩa. Payout/credit batch **vẫn v7** (`generateId()`) |
| `tenant-dispatch` unique `{ tx }` | Payout order, vẫn v7 | **Không** đụng |

**Kết luận vận hành:**

- MegaWin **không** dùng `tx` làm trục thời gian cho ticket / WAL / tx-log mặc định. Thời gian =
  `createdAt` / `_id`.
- Tenant **nếu** sort sổ cái theo `tx` lex sẽ thấy place-bet **không** theo giờ — họ phải sort
  `processedAt` / `createdAt`. Format vẫn UUID hợp lệ.
- **Không** revert `deriveTx` về v7. **Không** đổi payout/refund sang v5.
- JSDoc `ticket.tx` ×7 + `TicketExistsFn`: ghi rõ lookup key, không time-sortable.

```
UUIDv7  = unique-per-call + time-order     → payout / refund / rollback / dispatch
UUIDv5  = deterministic lookup             → place-bet debit only (deriveTx)
Time    = createdAt / _id / processedAt    → mọi list/sort
```

## 8. Đọc API Gateway v2 — một module, không file `idempotency-key.ts`

Plan gốc: "làm tương tự `extractClientIpFromApiGatewayV2` trong `utils/ip`". Implement lần đầu
tạo `utils/idempotency-key.ts` + `ApiGatewayV2HeadersSource` riêng → hai chỗ parse event.

Đã gộp vào `packages/shared/src/utils/api-gateway-v2.ts`:

| Export | Việc |
|---|---|
| `getHeaderFromApiGatewayV2(event, name)` | Primitive — case-insensitive, trim |
| `extractIdempotencyKeyFromApiGatewayV2` | Header bắt buộc + validate 8–128 |
| `extractClientIpFromApiGatewayV2` | CHỈ `requestContext.http.sourceIp` (chuyển từ `ip.ts`) |
| `ApiGatewayV2EventSource` | Shape event dùng chung |

`ip.ts` giữ chain header tin cậy (Next.js / nginx): `extractClientIp`,
`extractClientIpFromWebHeaders`, `extractHttpContext*`. **Không** đọc Lambda event.

7 handler `place-bet` import cả IP + key từ `@megawin/shared/utils/api-gateway-v2`.
`tenant-api-key-auth` / resultfeed api-key **chưa** chuyển — header app-specific + query
fallback; không thuộc place-bet.

Xoá `packages/shared/src/utils/idempotency-key.ts`.

## 9. Gộp `resolveIdempotencyConflict()` + `replayDebit()` → `replayCompletedDebit()`

Plan gốc mục 5 (trên) tách 2 method: `resolveIdempotencyConflict(tx)` đọc phase WAL + throw 409,
`replayDebit(input)` gọi lại tenant. Cả 7 use-case place-bet luôn gọi **liền nhau, đúng thứ tự đó,
không có nhánh nào gọi riêng lẻ** — tách 2 method chỉ tạo thêm 1 lời gọi thừa không có lý do
nghiệp vụ độc lập.

**Đã gộp thành một method trên `DebitPlayerService`:**

```typescript
async replayCompletedDebit(input: DebitPlayerInput): Promise<DebitPlayerResult>
```

- Đọc WAL theo `input.tx`, switch theo `phase`:
  - `DebitPending` / `RolledBack` / `ManualReview` / không còn WAL → throw `IDEMPOTENCY_CONFLICT`
    (409) ngay, không chạm network — giữ nguyên đúng message cũ của từng nhánh.
  - `Completed` → tiếp tục gọi tenant debit cùng `tx`, trả `{ balance }` (logic thân cũ của
    `replayDebit`, không đổi).
- 7 use-case `place-bet.ts` (`replayCompletedBet`) đổi 2 dòng
  `resolveIdempotencyConflict(tx); return replayCompletedBet(tx, debitInput);` thành 1 dòng
  `return replayCompletedBet(tx, debitInput);`; trong `replayCompletedBet` gọi
  `debitService.replayCompletedDebit(debitInput)` trước, `ticketRepo.findByTx(tx)` sau (đảo thứ
  tự — nếu WAL chưa `Completed` thì throw 409 trước khi tốn 1 query tìm vé).
- `findWal(tx)` giữ nguyên (dùng ở test #13 đọc phase độc lập, và có thể dùng bởi caller khác
  ngoài place-bet).
- Test `idempotent-place-bet.test.ts` #12/#13/#14: thay `resolveIdempotencyConflict` + `replayDebit`
  bằng 1 lời gọi `replayCompletedDebit`.

**Không đổi hành vi** — 4 nhánh phase, message, mã lỗi, và điều kiện gọi tenant giữ nguyên 100%.
Đây là gộp code, không phải đổi logic nghiệp vụ.
