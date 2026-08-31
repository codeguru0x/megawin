# DrawFeed — Data Model

DB **`megawin-drawfeed`** (cluster tách được, D3). 6 collection. Tuân thủ `mongodb.mdc`
(`docPath`, repo types tách file, TTL index ưu tiên hơn cleanup batch) và
`entity-typesafe-mongodb.mdc`.

## 1. Wiring DB riêng — ~15 dòng, không đổi API sẵn có

### 1.1. `packages/data/src/mongo/constants.ts`

```typescript
Default: {
  // … các DB hiện có …
  /** DB sản phẩm DrawFeed — thu thập/đồng thuận kết quả xổ số từ nhiều nguồn. Tách cluster được. */
  DrawFeedDbName: "megawin-drawfeed",
}
```

### 1.2. `packages/data/src/mongo/base-repos.ts`

```typescript
/**
 * Base cho mọi repo DrawFeed — DB `megawin-drawfeed`, **cluster RIÊNG** qua
 * `DRAWFEED_MONGODB_URI`.
 *
 * Tách cluster từ ngày đầu (không phải "để sau"): DrawFeed sẽ phục vụ khách
 * ngoài (API public) nên tải đọc của nó KHÔNG được chạm cluster OLTP của game.
 * Dev có thể trỏ `DRAWFEED_MONGODB_URI` về cùng cluster — đổi env, không đổi code.
 */
export abstract class DrawFeedRepo<
  TEntity extends BaseEntity,
  TMapper extends MongoMapper<Document, TEntity> | undefined = undefined,
> extends MongoRepository<TEntity, TMapper> {
  constructor({ collName, dataMapper }: BaseRepoArgs<TMapper>) {
    super({
      mongoEnvKey: "DRAWFEED_MONGODB_URI",
      dbName: Constants.Default.DrawFeedDbName,
      collName,
      dataMapper,
    });
  }
}
```

Không cần sửa `client.ts`/`repository.ts` — `getMongoClient` đã cache theo `mongoEnvKey`
(`client.ts:59-79`) và `MongoRepository` đã nhận `mongoEnvKey?` (`repository.ts:66-80`).

### 1.3. Env

| Env | Ở đâu | Ghi chú |
| --- | --- | --- |
| `DRAWFEED_MONGODB_URI` | `apps/drawfeed-worker`, `apps/backoffice`, `apps/drawfeed-api` | ⚠️ **Agent KHÔNG tạo/ghi `.env*`** — chỉ thêm dòng vào `.env.example` và để người vận hành tự điền |
| `DRAWFEED_FETCH_PROVIDER` | worker | `brightdata-unlocker` (mặc định) |
| `BRIGHTDATA_UNLOCKER_TOKEN` · `BRIGHTDATA_UNLOCKER_ZONE` | worker | Secret, lấy từ SSM như `MONGODB_URI` (`serverless.yml:22`) |

### 1.4. Lock

Dùng `@megawin/worker-core` (`TickLoopWorker`/`SingleRunWorker`/`DistributedMutex`). Lưu ý: lock của
worker-core nằm ở DB **`megawin`** (`WorkerCoreBaseRepo extends SharedRepo`,
`packages/worker-core/src/infras/base-repo.ts:14`) ⇒ đây là **phụ thuộc hạ tầng duy nhất** của
`drawfeed` sang DB core.

Chấp nhận, vì lock là **hạ tầng, không phải domain** — không kéo theo bất kỳ khái niệm nghiệp vụ nào
của MegaWin, và đổi lại tránh viết lại toàn bộ tick-loop/takeover đã có test. Nếu sau này tách hẳn
hạ tầng, thêm `mongoEnvKey` optional cho `WorkerCoreBaseRepo` — một tham số, không phải refactor.

Đặt tên lock: `drawfeed:fetch:<sourceId>:<gameKey>` và `drawfeed:consensus:<gameKey>`.

---

## 2. Enum — `const object as const`, KHÔNG string trần

`packages/drawfeed/src/entities/enums.ts`. Tuân thủ `code-quality-standards.mdc` §5.3.

```typescript
/** Vai trò của một nguồn trong quá trình đồng thuận. Bất đối xứng nguồn PHẢI nằm trong schema. */
export const SourceRole = {
  /** Nguồn chính thức (vietlott.vn). CHỈ nguồn này được làm cơ sở cho kết quả công bố. */
  Authoritative: "authoritative",
  /** Nguồn đối chiếu — có quyền VETO (chặn), KHÔNG có quyền nâng lên Verified. */
  Confirming: "confirming",
  /** Chỉ tham khảo/quan sát — không veto, không nâng. Dùng khi nguồn mới chưa đủ tin. */
  Reference: "reference",
} as const;
export type SourceRole = (typeof SourceRole)[keyof typeof SourceRole];

/** Trạng thái parse của một submission (raw bytes). */
export const SubmissionState = {
  Fetched: "fetched",
  Parsed: "parsed",
  ParseFailed: "parse_failed",
  FetchFailed: "fetch_failed",
} as const;
export type SubmissionState = (typeof SubmissionState)[keyof typeof SubmissionState];

/** Kết quả kiểm nội tại của 1 observation (checksum do CHÍNH trang nguồn công bố). */
export const IntrinsicState = {
  /** Chưa kiểm. */
  Pending: "pending",
  /** Đủ số + mọi checksum nguồn tự công bố đều khớp với số. */
  Passed: "passed",
  /** Có checksum lệch ⇒ observation này KHÔNG được dùng cho consensus. */
  Failed: "failed",
  /** Nguồn không công bố checksum nào ⇒ không kết luận được (vd mirror chỉ có số). */
  NotAvailable: "not_available",
} as const;
export type IntrinsicState = (typeof IntrinsicState)[keyof typeof IntrinsicState];

/** Trạng thái đồng thuận cho 1 game × 1 kỳ. */
export const ConsensusState = {
  /** Chưa đủ dữ liệu để kết luận. */
  Pending: "pending",
  /** Máy kết luận: đủ điều kiện chính sách, các nguồn khớp nhau. */
  Agreed: "agreed",
  /** Các nguồn LỆCH nhau ⇒ chặn, chờ người. KHÔNG bao giờ auto-publish. */
  Conflict: "conflict",
  /** Người đã verify. FLAG CAO NHẤT — máy KHÔNG BAO GIỜ ghi đè (D6). */
  HumanVerified: "human_verified",
  /** Người kết luận dữ liệu không dùng được (nguồn sai, kỳ bị huỷ…). */
  Rejected: "rejected",
} as const;
export type ConsensusState = (typeof ConsensusState)[keyof typeof ConsensusState];

/** Ai ra quyết định cuối. */
export const DecidedBy = {
  Machine: "machine",
  Human: "human",
} as const;
export type DecidedBy = (typeof DecidedBy)[keyof typeof DecidedBy];

/** Chính sách xử lý khi các nguồn lệch nhau. Cấu hình được per game (xem 03-consensus §4). */
export const ConflictPolicy = {
  /** MẶC ĐỊNH. Lệch ⇒ luôn chờ người. An toàn nhất. */
  HumanOnly: "human_only",
  /** Nguồn authoritative thắng, NHƯNG chỉ khi nó pass toàn bộ checksum nội tại. */
  AuthoritativeWins: "authoritative_wins",
  /** Cộng trọng số tin cậy; thắng nếu vượt ngưỡng VÀ có authoritative trong nhóm thắng. */
  WeightedQuorum: "weighted_quorum",
} as const;
export type ConflictPolicy = (typeof ConflictPolicy)[keyof typeof ConflictPolicy];

/** Game mà DrawFeed thu thập. TỰ khai báo — KHÔNG import từ `@megawin/game-*` (overview §6). */
export const DrawFeedGameKey = {
  Keno: "keno",
  Bingo18: "bingo18",
} as const;
export type DrawFeedGameKey = (typeof DrawFeedGameKey)[keyof typeof DrawFeedGameKey];

export const DrawFeedCollections = {
  Sources: "sources",
  Submissions: "submissions",
  Observations: "observations",
  Consensus: "consensus",
  SourceCursors: "source_cursors",
  Alerts: "alerts",
} as const;
export type DrawFeedCollections = (typeof DrawFeedCollections)[keyof typeof DrawFeedCollections];
```

Tên collection **không cần prefix** `drawfeed_` vì đã ở DB riêng — prefix chỉ thêm nhiễu.

---

## 3. Canonicalization — hai hash, hai mục đích khác nhau

Đây là phần **dễ sai nhất** của cả sản phẩm (analysis §9.2 + §14.1(b)). Bằng chứng đã có:

| Game | Nguồn công bố thế nào | Ví dụ thật |
| --- | --- | --- |
| Keno | **tăng dần** | `07 09 14 … 78` |
| Bingo18 | **thứ tự quay** | `5 2 5` — nếu sort sẽ là `2 5 5` ⇒ chứng minh giữ thứ tự |

Hai hash, **không được trộn**:

| Hash | Tính từ | Dùng để |
| --- | --- | --- |
| `payoutHash` | Số đã **canonical** (sort tăng dần) + `gameKey` + `drawPeriod` | So **giữa các nguồn**. Trả thưởng độc lập thứ tự ⇒ hai nguồn ghi khác thứ tự **KHÔNG phải** conflict |
| `displayHash` | Số **đúng thứ tự nguồn công bố** + `gameKey` + `drawPeriod` | Giữ dạng công bố để ghi ra ngoài. Với Bingo18 **khác** `payoutHash` |

```typescript
/**
 * Canonical hoá số của 1 game để so sánh CHÉO NGUỒN.
 *
 * Sort tăng dần cho MỌI game — vì trả thưởng của cả Keno và Bingo18 đều độc lập
 * thứ tự. KHÔNG dùng kết quả hàm này để ghi ra ngoài: Bingo18 phải công bố đúng
 * thứ tự quay (`5,2,5`), không phải thứ tự sort (`2,5,5`).
 *
 * Bingo18 có số TRÙNG NHAU (3 xúc xắc) ⇒ phải sort như MULTISET, tuyệt đối
 * không dedupe. Dedupe `5,2,5` → `2,5` là mất dữ liệu, và không lỗi compile.
 */
export function canonicalizeNumbers(gameKey: DrawFeedGameKey, numbers: string[]): string[] {
  return [...numbers].sort((a, b) => a.localeCompare(b));
}
```

⚠️ Dùng `localeCompare` trên string **zero-padded** (`"07"`, `"78"`) là đúng; nếu nguồn trả số không
zero-pad thì **normalize trước** khi canonical, không sort số chưa pad (`"10" < "9"` theo string).

**Bất biến hash (có test):**

1. `payoutHash` của cùng một tập số **bất kể thứ tự** phải bằng nhau.
2. `displayHash` của `5,2,5` và `2,5,5` phải **khác** nhau.
3. Cả hai hash **đều gồm** `gameKey` + `drawPeriod` ⇒ không thể so chéo game hoặc chéo kỳ do tai nạn.
4. Bingo18: `canonicalizeNumbers` trả **đúng 3 phần tử** (không dedupe).

---

## 4. Sáu collection

### 4.1. `sources` — registry + config, sửa được trong backoffice không cần deploy

Yêu cầu "có đánh giá sự ưu tiên lựa chọn" ⇒ ưu tiên phải là **dữ liệu**, không phải hằng số hardcode.

```typescript
export interface SourceDoc extends BaseEntity {
  /** Khoá ổn định, dùng trong tên lock/log/observation. VD `vietlott-detail`, `minhchinh-json`. */
  sourceId: string;
  /** Tên hiển thị cho vận hành. */
  name: string;
  /** Host gốc — chỉ để hiển thị/nhóm, KHÔNG dùng để build URL (adapter lo). */
  baseUrl: string;
  /** Vai trò trong đồng thuận. Đổi giá trị này là quyết định VẬN HÀNH ⇒ phải audit. */
  role: SourceRole;
  /**
   * Trọng số tin cậy 0–100, dùng cho `ConflictPolicy.WeightedQuorum`.
   * KHÔNG có ý nghĩa với `HumanOnly`. Trọng số cao KHÔNG biến `Confirming` thành
   * `Authoritative` — hai thứ độc lập (xem 03-consensus §2).
   */
  trustWeight: number;
  /** Game mà nguồn này cung cấp. Nguồn có thể chỉ phục vụ 1 game. */
  gameKeys: DrawFeedGameKey[];
  /** Tắt nguồn ⇒ worker bỏ qua, consensus không tính. Kill-switch per source. */
  isEnabled: boolean;
  /** Provider dùng để lấy dữ liệu nguồn này. */
  providerId: string;
  /** Version parser đang chạy cho nguồn này. Bump khi HTML nguồn đổi. */
  parserVersion: string;
  /** Có cần vendor render JS không. Mặc định false — đo trước khi bật (phép đo #10). */
  requiresRender: boolean;
  /** Khoảng nghỉ tối thiểu giữa 2 request tới nguồn này (ms) — lịch sự + tránh bị chặn. */
  minIntervalMs: number;
  createdAt: Date;
  updatedAt: Date;
}
```

### 4.2. `submissions` — bằng chứng thô, bất biến sau khi ghi

```typescript
export interface SubmissionDoc extends BaseEntity {
  sourceId: string;
  /** Game mà request này NHẮM tới. Có thể null nếu là trang list đa game. */
  gameKey: DrawFeedGameKey | null;
  /** URL đầy đủ đã gọi (gồm cả cache-buster) — cần cho tái hiện chính xác. */
  requestUrl: string;
  httpStatus: number;
  /** `text/html` | `application/json` | … — parser dựa vào đây để chọn cách đọc. */
  contentType: string;
  /**
   * Raw bytes **NGUYÊN VĂN**, đã gzip. HTML nén ~8–10× (~200KB → ~25KB).
   * TUYỆT ĐỐI không normalize/prettify trước khi lưu — mất tính bằng chứng và
   * làm `contentHash` vô nghĩa.
   */
  bodyGz: Binary;
  /** `sha256` của body **trước** khi gzip. Khoá dedupe + đối chiếu cross-provider. */
  contentHash: string;
  /** Kích thước body gốc (bytes) — theo dõi HTML nguồn phình/đổi bất thường. */
  bodyBytes: number;
  providerId: string;
  /** ID request phía vendor — để đối soát hoá đơn và mở ticket khi lỗi. */
  providerRequestId: string | null;
  /** Số đơn vị tính phí vendor báo cho request này. Cộng lên thành báo cáo chi phí. */
  costUnits: number;
  elapsedMs: number;
  state: SubmissionState;
  /** Lý do khi `fetch_failed`/`parse_failed` — text cho vận hành đọc. */
  failureReason: string | null;
  fetchedAt: Date;
}
```

### 4.3. `observations` — 1 nguồn × 1 game × 1 kỳ × 1 parserVersion

Tầng này là lý do có `01`→`02` tách biệt: truy vấn "kỳ này các nguồn nói gì" phải là **một query có
index**, không phải quét raw HTML (analysis §9.1).

```typescript
export interface ObservationDoc extends BaseEntity {
  sourceId: string;
  gameKey: DrawFeedGameKey;
  /** Mã kỳ THEO NGUỒN, chuẩn hoá zero-pad. VD `"0293945"`. KHÔNG phải drawId của MegaWin. */
  drawPeriod: string;
  /** Ngày quay nguồn công bố, `YYYY-MM-DD`. */
  drawDateSource: string;
  /** Giờ quay nguồn công bố (ISO 8601) nếu có — dùng cross-check suy kỳ. */
  drawTimeSource: string | null;
  /** Số ĐÚNG THỨ TỰ nguồn công bố. Bingo18: `["5","2","5"]`. */
  numbersDisplay: string[];
  /** Số đã canonical (sort multiset) — chỉ để so chéo nguồn. */
  numbersCanonical: string[];
  displayHash: string;
  payoutHash: string;
  /**
   * Checksum do CHÍNH nguồn công bố (không phải ta tính). Keno: chẵn/lẻ/lớn/nhỏ.
   * Bingo18: tổng + phân loại Lớn/Hòa/Nhỏ. Nguồn không công bố ⇒ để trống.
   */
  claimedChecksums: Record<string, string | number>;
  /** Kết quả đối chiếu `claimedChecksums` với `numbersDisplay` do TA tự tính lại. */
  intrinsicState: IntrinsicState;
  /** Checksum nào lệch — text cho vận hành. */
  intrinsicMismatch: string | null;
  parserVersion: string;
  /** Trỏ về bằng chứng thô. Bắt buộc — không có submission thì observation vô giá trị. */
  submissionId: string;
  createdAt: Date;
}
```

**`drawPeriod` là của NGUỒN, không phải `drawId` MegaWin.** Việc map sang `drawId` là của **core khi
PULL**, không phải của `drawfeed` (D7). `drawfeed` không được biết quy ước `drawId` của MegaWin.

### 4.4. `consensus` — 1 game × 1 kỳ, kết quả cuối

```typescript
export interface ConsensusAgreement {
  sourceId: string;
  observationId: string;
  role: SourceRole;
  trustWeight: number;
}

export interface ConsensusHumanVerify {
  /** Ai verify. */
  accountId: string;
  username: string;
  verifiedAt: Date;
  /** Bắt buộc khi ghi đè kết quả máy — vì sao người chọn khác máy. */
  note: string | null;
  /** Observation người chọn làm chuẩn. Null nếu người tự nhập tay. */
  chosenObservationId: string | null;
}

export interface ConsensusDoc extends BaseEntity {
  gameKey: DrawFeedGameKey;
  drawPeriod: string;
  drawDateSource: string;
  state: ConsensusState;
  /**
   * Số công bố — ĐÚNG THỨ TỰ nguồn authoritative công bố (Bingo18: thứ tự quay).
   * Null khi `pending`/`conflict`/`rejected`.
   */
  numbers: string[] | null;
  /** Hash của tập số đã chốt — để core PULL về so mà không cần so từng phần tử. */
  payoutHash: string | null;
  displayHash: string | null;
  /** Các observation ĐỒNG Ý với kết quả đã chốt. */
  agreeing: ConsensusAgreement[];
  /** Các observation LỆCH. Giữ lại kể cả sau khi chốt — đây là dấu vết audit. */
  conflicting: ConsensusAgreement[];
  decidedBy: DecidedBy | null;
  decidedAt: Date | null;
  /** Chính sách đã áp dụng lúc quyết định (snapshot — đổi policy sau không ghi lại lịch sử). */
  appliedPolicy: ConflictPolicy;
  /** Có mặt ⇔ `state = human_verified`. Máy KHÔNG BAO GIỜ ghi field này. */
  humanVerify: ConsensusHumanVerify | null;
  /** Thời điểm mở cho bên ngoài đọc. Null = chưa publish. */
  publishedAt: Date | null;
  /** Tăng mỗi lần state đổi — optimistic lock, chống 2 tick ghi đè nhau. */
  version: number;
  createdAt: Date;
  updatedAt: Date;
}
```

### 4.5. `source_cursors` — trạng thái lịch fetch, per nguồn × game

Nơi hiện thực "dự đoán `id`" (overview §3).

```typescript
export interface SourceCursorDoc extends BaseEntity {
  sourceId: string;
  gameKey: DrawFeedGameKey;
  /** Kỳ gần nhất đã có observation hợp lệ. Neo để suy kỳ kế tiếp. */
  lastConfirmedPeriod: string | null;
  /** Kỳ dự đoán sẽ fetch lần tới = lastConfirmedPeriod + 1. */
  nextExpectedPeriod: string | null;
  /** Không fetch trước mốc này (tôn trọng `minIntervalMs` + backoff). */
  nextFetchAt: Date;
  /** Số lần thất bại liên tiếp — cơ sở backoff luỹ tiến + alert. */
  consecutiveFailures: number;
  /**
   * Đặt true khi kỳ/ngày trên trang LỆCH kỳ vọng ⇒ tick sau phải re-anchor từ
   * trang list thay vì tiếp tục cộng 1. Cờ này có đường reset (mongodb.mdc §8.5).
   */
  needsReanchor: boolean;
  updatedAt: Date;
}
```

### 4.6. `alerts` — ops alert RIÊNG, không dùng `ops_alerts` của game

`drawfeed` không import `game-*` (overview §6) ⇒ có bảng alert riêng. Loại alert theo `as const`:
`fetch_failing`, `parse_failed`, `intrinsic_failed`, `consensus_conflict`, `period_gap`,
`source_stale`, `cost_spike`, `human_review_backlog`.

---

## 5. Index — source of truth ở `packages/drawfeed/src/indexes/index.ts`

Theo tiền lệ repo: file `*_INDEXES` là **source of truth để DBA copy sang Atlas/mongosh**, repo
**không** tự chạy `createIndex` (`mongodb.mdc` §7.4).

| Collection | Index | Mục đích |
| --- | --- | --- |
| `sources` | `{ sourceId: 1 }` unique | Khoá tra cứu |
| `submissions` | `{ sourceId: 1, contentHash: 1 }` unique | **Dedupe**: cùng nguồn + cùng bytes = không lưu 2 lần |
| | `{ state: 1, fetchedAt: 1 }` | Hàng đợi parse lại khi `parse_failed` |
| | `{ fetchedAt: 1 }` TTL có `partialFilterExpression` | Retention (§6) |
| | `{ gameKey: 1, fetchedAt: -1 }` | Trang vận hành xem log theo game |
| `observations` | `{ sourceId: 1, gameKey: 1, drawPeriod: 1, parserVersion: 1 }` unique | **Idempotent**: parse lại cùng version = no-op; version mới = bản ghi mới để so |
| | `{ gameKey: 1, drawPeriod: 1 }` | Query nóng của consensus: "kỳ này các nguồn nói gì" |
| | `{ gameKey: 1, createdAt: -1 }` | Trang vận hành |
| `consensus` | `{ gameKey: 1, drawPeriod: 1 }` unique | 1 kỳ đúng 1 doc |
| | `{ state: 1, gameKey: 1, drawPeriod: -1 }` | Hàng đợi conflict cho người duyệt |
| | `{ publishedAt: -1 }` `partialFilterExpression: { publishedAt: { $type: "date" } }` | Core PULL + API public chỉ đọc bản đã publish |
| `source_cursors` | `{ sourceId: 1, gameKey: 1 }` unique | 1 cursor / nguồn / game |
| | `{ nextFetchAt: 1 }` | Worker lấy việc đến hạn |
| `alerts` | `{ status: 1, createdAt: -1 }` · `{ createdAt: 1 }` TTL | Hàng đợi + retention |

⚠️ TTL **phải là index single-field ascending riêng** — không gộp vào compound (`mongodb.mdc` §7.4).

---

## 6. Retention — TTL **có điều kiện**, không xoá bằng chứng đang cần

Bằng chứng thô của một kỳ **chưa chốt** hoặc **đang conflict** không được xoá — đó chính là thứ người
verify cần đọc. Nhưng giữ vĩnh viễn thì 210 MB/tháng cộng dồn vô hạn.

```typescript
// submissions — TTL 30 ngày, CHỈ áp cho bản đã parse xong.
// `parse_failed`/`fetch_failed` KHÔNG bị xoá tự động: đó là bằng chứng để sửa parser.
{
  key: { fetchedAt: 1 },
  name: "idx_fetchedAt_ttl",
  expireAfterSeconds: 30 * 24 * 60 * 60,
  partialFilterExpression: { state: "parsed" },
}
```

`observations` và `consensus` **KHÔNG TTL** — nhỏ (vài trăm bytes/doc) và là bản ghi nghiệp vụ.
280 kỳ/ngày × ~400 B ≈ 41 MB/năm cho observations. Không đáng xoá.

Nếu về sau cần giữ raw của kỳ đã `human_verified` lâu hơn 30 ngày ⇒ **không sửa TTL**, mà copy sang
collection `submissions_archive` khi verify (TTL chỉ xoá, không archive — `mongodb.mdc` §7.2).

---

## 7. Checklist

- [ ] `DrawFeedDbName` + `DrawFeedRepo` thêm vào `@megawin/data`, có JSDoc giải thích vì sao cluster riêng.
- [ ] Mọi enum dùng `const object as const` + type dẫn xuất — không string literal trần.
- [ ] `canonicalizeNumbers` có test: bất biến 1–4 ở §3, đặc biệt **Bingo18 không dedupe**.
- [ ] `bodyGz` lưu bytes nguyên văn; `contentHash` tính **trước** gzip.
- [ ] Unique index `observations` gồm `parserVersion` (không thì parse lại bằng version mới bị chặn).
- [ ] TTL `submissions` có `partialFilterExpression: { state: "parsed" }`.
- [ ] `humanVerify` chỉ được ghi bởi use-case của người — grep để chắc không có write path nào của máy chạm vào.
- [ ] Không file nào trong `packages/drawfeed*` import `@megawin/game-*`.


