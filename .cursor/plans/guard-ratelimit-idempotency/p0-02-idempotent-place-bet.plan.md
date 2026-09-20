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

## Test

**Unit (bắt buộc):**
- `deriveTx` vector cố định; tất định qua nhiều lần gọi; `accountId` khác → `tx` khác.
- `canonicalBody`: đổi thứ tự field/`drawIds` → **cùng** fingerprint.
- Validate `Idempotency-Key` sai format → 400.

**Integration (đường tiền — không được bỏ):**
- Gọi `place-bet` 2 lần cùng key → **1 vé duy nhất**, lần 2 trả kết quả cũ, **tenant chỉ bị debit 1 lần**.
- Lần 2 khi lần 1 còn `DEBIT_PENDING` → 409, **không** tạo vé.
- Không gửi key → 2 vé (hành vi cũ giữ nguyên) khi fingerprint guard ở shadow mode.
- Cùng key nhưng **body khác** → 409 (phát hiện key reuse sai).

## Definition of done

- [ ] `deriveTx` có JSDoc cảnh báo "công thức là contract" + unit test vector cố định.
- [ ] `Idempotency-Key` đọc được, validate, truyền tới use-case ở **cả 7** game.
- [ ] Duplicate key nhận diện theo **code 11000**, không theo message; `insertWal` không còn nuốt nó
      thành `serviceUnavailable`.
- [ ] Replay trả đủ `PlaceBetOutput`; nhánh `DEBIT_PENDING` trả 409.
- [ ] Index `{tx}` thêm ở 7 game + **đã chạy query đếm trùng trên dữ liệu thật** trước khi tạo unique.
- [ ] `IDEMPOTENCY_CONFLICT` → 409 trong `http-status.ts`.
- [ ] `player-sdk` đã đồng bộ 7 game + CHANGELOG, không leak backend, `@example` compile được.
- [ ] Integration test chứng minh **tenant chỉ bị debit 1 lần** với 2 request cùng key.
- [ ] `oxlint` + `prettier` đã chạy trên mọi path đã sửa.
- [ ] Mọi lỗi throw là `AppException` với message **tiếng Việt cho người dùng cuối** — không tên
      class/collection/field (`error-handling-conventions.mdc`).

## Không làm trong plan này

- ❌ Rate limit → `p1-01`.
- ❌ Idempotency cho endpoint khác `place-bet` → `p3-01`.
- ❌ Bắt buộc `Idempotency-Key` — đã chốt **tùy chọn** (analysis §5.2).
- ❌ **Bật chặn** fingerprint guard — shadow mode trước, bật là quyết định riêng sau `p2-01`.
