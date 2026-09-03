---
name: ""
overview: ""
todos: []
isProject: false
---

# ResultFeed — Fetch & Parse

Ba tầng, ranh giới cứng. Mỗi tầng chỉ biết tầng kế bên.

```
Transport  │ FetchProvider — thuê bytes. KHÔNG biết game, KHÔNG parse.
           │   OxylabsUnblockerProvider (primary) · ContextDevProvider (secondary)
───────────┼──────────────────────────────────────────────────────────
Adapter    │ SourceAdapter — biết 1 site: build URL, parse HTML/JSON của site đó.
           │   Hàm PURE. KHÔNG I/O, KHÔNG DB, KHÔNG biết site khác.
───────────┼──────────────────────────────────────────────────────────
Orchestr.  │ Use-case + repo — lịch chạy, lưu submission/observation, lock, alert.
```

## 1. Transport — `FetchProvider`

`packages/resultfeed-application/src/infras/providers/`.

```typescript
/** Yêu cầu lấy nội dung một URL. Cố ý nghèo nàn: mọi provider đều phải làm được. */
export interface FetchRequest {
  url: string;
  /**
   * Có yêu cầu vendor render JS không. Mặc định false.
   * Bật render thường đắt hơn và CHẬM hơn — chỉ bật khi đã ĐO là trang cần JS
   * (phép đo #10). Trang server-rendered bật render là trả tiền vô ích.
   */
  render?: boolean;
  /** Quốc gia exit node, ISO-2. `"vn"` cho site Việt Nam. */
  country?: string;
  timeoutMs?: number;
  /**
   * Header tuỳ ý. ⚠️ Tránh dùng: một số vendor đòi duyệt compliance khi bật custom
   * header và có thể mất chế độ pay-per-success. Nếu adapter cần header lạ → xem lại
   * có endpoint GET thuần nào thay được không (analysis §13.3 đã tránh được đúng bẫy này).
   */
  headers?: Record<string, string>;
}

/** Kết quả thô. Provider TUYỆT ĐỐI không được sửa `body`. */
export interface FetchResult {
  ok: boolean;
  httpStatus: number;
  contentType: string;
  /** Bytes nguyên văn. Không decode, không trim, không prettify. */
  body: Buffer;
  /** Meta thô của vendor (để debug/mở ticket). Không ai được parse field này ra logic. */
  providerMeta: Record<string, unknown>;
  elapsedMs: number;
  fetchedAt: Date;
  failureReason: string | null;
}

/**
 * Hợp đồng "thuê bytes". Thêm vendor mới = thêm 1 class implement interface này,
 * KHÔNG sửa adapter, KHÔNG sửa domain, KHÔNG sửa use-case.
 */
export interface FetchProvider {
  readonly providerId: string;
  fetch(req: FetchRequest): Promise<FetchResult>;
}
```

### 1.1. Implementation — Oxylabs primary, context.dev secondary

🔴 `BrightDataUnlockerProvider` đã bị **xoá khỏi plan**: AUP của Bright Data cấm "Raffles, lottery, or
gambling" nên `vietlott.vn` trả `Access denied … classified as Gambling`. Xem `00-overview.md` D1.

Viết **hai** provider ngay từ G2 (không phải một):

| Class | Vendor | Endpoint | Ghi chú |
| --- | --- | --- | --- |
| `OxylabsUnblockerProvider` | Oxylabs Web Unblocker | `unblock.oxylabs.io:60000` (proxy-style) | ⭐ primary. **KHÔNG** dùng Web Scraper API — không phải vì D2 (`parse` default `false`, vẫn trả HTML thô) mà vì **JSON envelope làm mất bytes gốc** + `/batch` job-based không khớp `FetchProvider`. Xem §5.2 |
| `ContextDevProvider` | context.dev | **Scrape HTML** | secondary. **KHÔNG** dùng Scrape Markdown / Extract (phá D2) |

Viết hai cái từ đầu là **có chủ đích**, không phải over-engineer: sự cố Bright Data vừa chứng minh rủi ro
vendor là thật và đến không báo trước. Provider thứ hai chỉ đáng tin nếu **đã từng chạy thật** — provider
viết sẵn nhưng chưa bao giờ gọi thì lúc cần sẽ vỡ.

```typescript
/**
 * Khung cho MỌI unblocker vendor.
 *
 * Vì sao unblocker API cho MỌI nguồn (không proxy thuần): site bật Cloudflare/CAPTCHA
 * sau này không cần đổi gì. Xem `00-overview.md` D1c.
 *
 * Vì sao KHÔNG để vendor extract (context.dev Markdown/Extract, Oxylabs `parse: true`):
 * logic đường tiền phải nằm trong repo có commit hash + CI, và Markdown làm MẤT cấu trúc
 * bảng mà phép kiểm checksum dựa vào. Xem analysis §8.3, §14.4.
 */
export class OxylabsUnblockerProvider implements FetchProvider {
  readonly providerId = "oxylabs-unblocker";
  // Token đọc từ env riêng theo vendor — KHÔNG hardcode tên env vào interface.
}
```

⚠️ Khi viết provider mới: **giữ nguyên** `FetchResult`. Cám dỗ lớn nhất là thêm field riêng của vendor vào
interface chung (`oxySessionId`, `contextMaxAgeMs`, …) — nhét vào `providerMeta`, đừng mở rộng interface,
nếu không lần đổi vendor sau sẽ đau đúng như lần này.

Dùng `@megawin/http-client` (`createHttpClient` + `withRetry`) — không tự viết fetch/retry.

**Retry:** chỉ retry lỗi **transport** (timeout, 5xx của vendor). **KHÔNG** retry khi vendor trả 200
mà nội dung sai (kỳ chưa có) — đó là việc của lịch fetch, không phải retry. Retry sai chỗ = trả tiền
nhiều lần cho cùng một câu trả lời "chưa có".

---

## 2. Adapter — mỗi site một cái, không biết nhau

Site khác nhau có thể dùng **provider khác nhau** (`sourceId` → `providerId`, §1.1) và **parser khác
nhau** — một adapter không giả định gì về adapter khác. Điều duy nhất mọi adapter, mọi game PHẢI trả
về giống nhau là 3 field lõi của `ParsedObservation` bên dưới (`drawPeriod`, `drawDateSource`,
`numbersDisplay` — tức **kết quả**); mọi giá trị phụ khác nhau theo game (Keno lớn/nhỏ, Bingo18 tổng,
…) đi qua `claimedChecksums` — generic, optional, không ép schema cứng theo game (01 §4.3).

`packages/resultfeed-application/src/sources/<sourceId>/`.

```typescript
/** Việc adapter phải làm khi tới lượt fetch. */
export interface FetchPlan {
  /** URL sẽ gọi. */
  url: string;
  /** Kỳ mà request này KỲ VỌNG nhận được — để phát hiện lệch (re-anchor). */
  expectedPeriod: string | null;
  render: boolean;
}

/**
 * Hợp đồng cho 1 website nguồn.
 *
 * `parse` PHẢI là hàm pure: cùng input → cùng output, không I/O, không `Date.now()`.
 * Đó là điều kiện để test bằng fixture HTML đã commit.
 */
export interface SourceAdapter {
  readonly sourceId: string;
  readonly parserVersion: string;
  readonly gameKeys: readonly ResultFeedGameKey[];

  /** Dựng request kế tiếp từ cursor. Nơi hiện thực "dự đoán id". */
  planNextFetch(input: { gameKey: ResultFeedGameKey; cursor: SourceCursorDoc }): FetchPlan;

  /** Đọc bytes → dữ liệu kỳ. Throw `ParseError` khi không đọc được. */
  parse(input: { gameKey: ResultFeedGameKey; body: Buffer; contentType: string }): ParsedObservation;
}

/** Output của parser — chưa có hash, chưa kiểm checksum (tầng trên lo). */
export interface ParsedObservation {
  drawPeriod: string;
  drawDateSource: string;
  drawTimeSource: string | null;
  /** ĐÚNG thứ tự nguồn công bố. Parser TUYỆT ĐỐI không sort. */
  numbersDisplay: string[];
  /** Checksum nguồn TỰ công bố, đọc nguyên văn. Không tự tính ở đây. */
  claimedChecksums: Record<string, string | number>;
}
```

**`parse` không sort, không tính checksum.** Nó chỉ *đọc*. Sort là việc của `canonicalizeNumbers`
(01 §3), kiểm checksum là việc của rule layer (§3). Trộn ba việc này vào parser là cách chắc chắn
nhất để tạo bug Bingo18 `5,2,5` → `2,5,5`.

### 2.1. Registry

```typescript
/** Đăng ký adapter theo sourceId. Site KHÔNG biết nhau — registry là nơi DUY NHẤT gom lại. */
export const SOURCE_ADAPTERS: Record<string, SourceAdapter> = {
  [vietlottDetailAdapter.sourceId]: vietlottDetailAdapter,
  // thêm site mới CHỈ cần thêm 1 dòng ở đây + 1 doc trong `sources`
};
```

Thêm site mới = 1 adapter + 1 dòng registry + 1 doc `sources` + 1 function trong `serverless.yml`.
**Không** sửa transport, **không** sửa consensus, **không** sửa schema.

### 2.2. Adapter đầu tiên — `vietlott-detail`

| Việc | Cách làm |
| --- | --- |
| URL Keno | `…/view-detail-keno-result?id=<period7>&nocatche=<ts>` |
| URL Bingo18 | `…/view-detail-bingo18-result?nocatche=<ts>&id=<period7>` |
| `nocatche` | **Luôn gửi, giá trị biến thiên** (timestamp). Site viết sai chính tả `nocache` nhưng đây là cache-buster thật ⇒ thiếu nó có nguy cơ nhận trang kỳ trước (analysis §14.1) |
| `planNextFetch` | `expectedPeriod = zeroPad7(Number(cursor.lastConfirmedPeriod) + 1)` |
| Parse Keno | 20 số + 4 checksum (chẵn/lẻ/lớn/nhỏ) |
| Parse Bingo18 | 3 số **giữ thứ tự** + 2 checksum (Cửa tổng, Lớn/Hòa/Nhỏ) |

⚠️ Bingo18 parse phải giữ `["5","2","5"]`. Nếu dùng selector trả về `Set` hoặc dedupe ở bất kỳ bước
nào thì `5,2,5` thành `5,2` — **sai âm thầm**, và checksum tổng sẽ bắt được (7 ≠ 12) nên hãy để
checksum chạy, đừng bỏ.

**Đã implement + verify bằng fixture HTML thật (2026-09-01):**

- `packages/resultfeed-application/src/sources/vietlott-detail/` — `urls.ts` (build URL),
  `dom-helpers.ts` (đọc ngày/kỳ dùng chung), `parse-keno.ts`, `parse-bingo18.ts`, `adapter.ts`.
- Selector xác nhận trên fixture thật: Keno số = `.day_so_ket_qua_v2 span.bong_tron` (20 span);
  Bingo18 số = `.CssDivBingo span.bong_tron_bingo` (3 span). Checksum đọc bằng TEXT NHÃN
  (`CHẴN`/`LẺ`/`LỚN`/`NHỎ`, `Cửa tổng`, `Lớn/Hòa/Nhỏ`) đứng ngay trước/cùng hàng ô giá trị —
  không dựa style inline hay vị trí cột cố định (dễ vỡ hơn).
- **Bằng chứng thực nghiệm cho `nocatche`:** fixture `test/html/keno.html` lấy KHÔNG kèm
  `nocatche` biến thiên → HTML trả về mang debug marker `Content load from disk data catche`
  (đã bị cache). Fixture `test/html/bingo18.html` lấy CÓ `nocatche=1` → mang marker
  `NO CATCHE`. Xác nhận đúng quy tắc "luôn gửi giá trị biến thiên" ở trên bằng dữ liệu thật,
  không phải suy đoán.
- Test: `packages/resultfeed-application/test/sources/vietlott-detail.test.ts` — 16 test, dùng
  2 fixture thật (kỳ Keno `#0294026`, Bingo18 `#0184325`), assert số/ngày/checksum khớp dữ liệu
  hiển thị + `checkIntrinsic` pass + `parse()` idempotent (pure) + `planNextFetch` dựng đúng URL +
  throw `ParseError` khi HTML không có `.day_so_ket_qua_v2`. (Adapter sau đó đổi tên thư mục thành
  `vietlott-detail/` (nhiều file) và thêm Lotto535 — xem `05-lotto535-and-schedule.plan.md` §3;
  `planReanchor` đã bị xoá khỏi interface, không còn test cho nó — §1.)

---

## 3. Rule layer — kiểm checksum, thuộc DOMAIN không thuộc adapter

`packages/resultfeed/src/rules/intrinsic-check.ts`. Pure, không I/O.

```typescript
/**
 * Kiểm checksum nguồn TỰ công bố so với số nguồn cũng tự công bố.
 *
 * Đây là lớp verify MẠNH NHẤT có được từ 1 nguồn duy nhất: nếu parser đọc lệch
 * bảng/lệch cột thì số và checksum sẽ không còn khớp nhau. Chạy được cho CẢ Keno
 * (chẵn/lẻ/lớn/nhỏ) và Bingo18 (tổng + Lớn/Hòa/Nhỏ) — xem analysis §13.2, §14.1.
 *
 * ⚠️ Hằng số biên (Bingo18 Lớn ≥ 12…) PHẢI tự khai báo ở đây, KHÔNG import từ
 * `@megawin/game-bingo18`. Dùng chung hằng số với core thì khi core sai, phép kiểm
 * sai theo và không phát hiện được gì (overview §6).
 */
export function checkIntrinsic(
  gameKey: ResultFeedGameKey,
  numbersDisplay: string[],
  claimed: Record<string, string | number>,
): { state: IntrinsicState; mismatch: string | null };
```

Ba nhóm kiểm:

1. **Hình thức** — đủ số lượng (Keno 20, Bingo18 3), đúng miền giá trị (Keno `01`–`80` zero-pad,
   Bingo18 `1`–`6`), Keno **không trùng**, Bingo18 **được trùng**.
2. **Checksum nguồn công bố** — tính lại từ `numbersDisplay`, so với `claimed`.
3. **Kiểm config chéo (bonus, analysis §14.1(c))** — phân loại Lớn/Hòa/Nhỏ mà nguồn công bố cho biết
   **biên của nguồn**. Nếu lệch biên ta đang giả định ⇒ alert `intrinsic_failed` kèm ghi rõ "có thể
   nguồn đã đổi luật", không im lặng bỏ qua.

Nguồn không công bố checksum nào ⇒ `IntrinsicState.NotAvailable`, **không phải** `Passed` — áp dụng
cho Keno/Bingo18 khi `claimed` rỗng dù hình thức đúng. Lotto535, Mega645, Power655, Max3d, Max3dpro
(`checkFormatOnly` trong `intrinsic-check.ts` — `05-lotto535-and-schedule.plan.md` §3 +
`09-power-mega-max3d-family.plan.md`) KHÁC: 5 game này KHÔNG BAO GIỜ có checksum nguồn tự công bố
(nguồn không kèm cờ kiểm chứng nào cho bất kỳ kỳ nào), nên đã CHỐT coi đúng hình thức/miền theo
luật chơi (số lượng, zero-pad, miền giá trị, không trùng nếu luật chơi yêu cầu) chính là lớp
verify duy nhất — tự nó là điều kiện KẾT LUẬN, không phải "không kết luận được". Kết quả luôn
`Passed`/`Failed`, KHÔNG có nhánh `NotAvailable` cho 5 game này.

---

## 4. Workers — `apps/worker-resultfeed`

Mirror `apps/worker-keno`: Serverless Framework + esbuild + `serverless.yml` chia function theo file
`src/functions/*.yml`, dùng `@megawin/worker-core` cho lock/tick.

```
apps/worker-resultfeed/
├── serverless.yml
├── esbuild.config.mjs
├── src/
│   ├── functions/
│   │   ├── fetch.yml          ← 1 entry / source × game
│   │   └── consensus.yml
│   └── handlers/
│       ├── fetch/
│       │   ├── vietlott-keno.ts
│       │   ├── vietlott-bingo18.ts
│       │   ├── vietlott-lotto535.ts
│       │   ├── vietlott-power655.ts
│       │   ├── vietlott-mega645.ts
│       │   ├── vietlott-max3d.ts
│       │   └── vietlott-max3dpro.ts
│       └── consensus/tick.ts
└── test/
```

| Function | Nhịp | Lock | Việc |
| --- | --- | --- | --- |
| `fetch-vietlott-keno` | cron 1 phút, tự bỏ qua nếu `nextFetchAt` chưa tới | `resultfeed:fetch:vietlott-detail:keno` | Fetch → submission → parse → observation |
| `fetch-vietlott-bingo18` | cron 1 phút | `resultfeed:fetch:vietlott-detail:bingo18` | như trên |
| `fetch-vietlott-lotto535` | cron 1 phút, nhưng `nextFetchAt` nhảy thẳng tới 13:00/21:00 VN (schedule `fixed`, mọi ngày — §4.1 bước 10, `05-lotto535-and-schedule.plan.md` §2) | `resultfeed:fetch:vietlott-detail:lotto535` | như trên |
| `fetch-vietlott-power655` | cron 1 phút, `nextFetchAt` nhảy thẳng tới 18:00 VN Thứ 3/5/7 (schedule `fixed` + `drawDaysOfWeek: [2,4,6]` — `09-power-mega-max3d-family.plan.md` §1.4) | `resultfeed:fetch:vietlott-detail:power655` | như trên |
| `fetch-vietlott-mega645` | cron 1 phút, `nextFetchAt` nhảy thẳng tới 18:00 VN Thứ 4/6/CN (schedule `fixed` + `drawDaysOfWeek: [3,5,0]`) | `resultfeed:fetch:vietlott-detail:mega645` | như trên |
| `fetch-vietlott-max3d` | cron 1 phút, `nextFetchAt` nhảy thẳng tới 18:00 VN Thứ 2/4/6 (schedule `fixed` + `drawDaysOfWeek: [1,3,5]`) | `resultfeed:fetch:vietlott-detail:max3d` | như trên |
| `fetch-vietlott-max3dpro` | cron 1 phút, `nextFetchAt` nhảy thẳng tới 18:00 VN Thứ 3/5/7 (schedule `fixed` + `drawDaysOfWeek: [2,4,6]`) | `resultfeed:fetch:vietlott-detail:max3dpro` | như trên |
| `consensus-tick` | cron 1 phút | `resultfeed:consensus:all` | Observation → consensus (D5: tách riêng) |

**Vì sao cron 1 phút mà không cron đúng giờ quay:** giờ quay có thể trễ; cron 1 phút + `nextFetchAt`
trong cursor cho phép điều khiển nhịp **bằng dữ liệu** thay vì bằng `serverless.yml` (phải
redeploy). Tick không đến hạn thì thoát ngay, gần như không tốn gì. Với game `fixed` schedule
(Lotto535, Power655, Mega645, Max3d, Max3dpro) điều này càng rõ: cron vẫn chạy mỗi phút, nhưng
tuyệt đại đa số lượt chỉ thoát sớm ở bước 1 vì `nextFetchAt` đã nhảy thẳng tới giờ quay kế tiếp
(có xét `drawDaysOfWeek` nếu game chỉ quay vài ngày/tuần) — không poll đều suốt ngày/tuần như
game `continuous`.

**Jitter bắt buộc:** `nextFetchAt` cộng ngẫu nhiên ±20% — nhịp đều tăm tắp là dấu hiệu bot rõ nhất,
và đây là lớp ẩn danh mà Unlocker **không** che được (analysis §12.7). Với schedule `fixed`, jitter
là vài phút quanh giờ quay (thay vì ±20% của `minIntervalMs`) — vẫn tránh gọi đúng giây quay.

**Đã implement + verify (2026-09-01):**

- `apps/worker-resultfeed/` — mirror đầy đủ cấu trúc `apps/worker-keno` (`serverless.yml`,
  `esbuild.config.mjs`, `tsconfig.json`, `vitest.config.ts`, `test/global-setup.ts`).
- `src/functions/fetch.yml` — 2 function `fetch-vietlott-keno` + `fetch-vietlott-bingo18`, cron 1
  phút, `timeout: 60` = `ttlSeconds` truyền vào `FetchAndParseUseCase` (đúng công thức chuẩn
  `ttlSeconds = Lambda timeout` của `SingleRunWorker`).
- `src/handlers/fetch/{vietlott-keno,vietlott-bingo18}.ts` — glue mỏng: khởi tạo
  `FetchAndParseUseCase` 1 lần ở module scope với đúng `sourceId`/`gameKey`/`adapter`, handler chỉ
  gọi `useCase.run()`. Cả 2 handler dùng CHUNG `vietlottDetailAdapter` — khác nhau `gameKey`.
- `serverless.yml` — KHÔNG copy nguyên IAM statements (Kinesis/SQS/Step Functions) từ
  `worker-keno` vì G2 chưa dùng — chỉ giữ `MONGODB_URI` + 2 biến provider (`OXYLABS_USERNAME`/
  `PASSWORD`, `CONTEXT_DEV_API_KEY`) qua SSM parameter store, theo đúng convention
  `${env:X, ssm:/${opt:stage}/megawin/X}` của các worker khác.
- Test: `test/handlers/fetch/*.test.ts` — wiring test mock `FetchAndParseUseCase`/
  `vietlottDetailAdapter`, verify handler delegate đúng tới `useCase.run()`, KHÔNG chạm DB/provider
  thật (logic nghiệp vụ đã test đầy đủ ở `resultfeed-application`, theo đúng pattern
  `apps/worker-keno/test/handler.test.ts`).
- **Chưa làm ở bước này:** `consensus.yml`/`consensus/tick.ts` — thuộc G5 (consensus), tách riêng
  theo overview D5, không lẫn vào G2 (fetch-parse).

**Bổ sung sau (2026-09-02, xem `05-lotto535-and-schedule.plan.md` §2-3 cho chi tiết):**

- `src/handlers/fetch/vietlott-lotto535.ts` — thêm mới, mirror `vietlott-keno.ts`/
  `vietlott-bingo18.ts` nhưng khai `schedule: { type: "fixed", drawTimesVn: ["13:00", "21:00"] }`
  khi khởi tạo `FetchAndParseUseCase` (2 handler cũ khai `{ type: "continuous" }` — không đổi
  hành vi, chỉ tường minh hoá field mới). `src/functions/fetch.yml` thêm entry
  `fetch-vietlott-lotto535` cùng cron 1 phút/`timeout: 120`.
- `FetchAndParseDeps` thêm field bắt buộc `schedule: GameFetchSchedule` — mọi handler phải tự khai
  khi tạo use-case (không có default ngầm).

### 4.1. Pipeline một lần fetch

```
1. Lấy cursor → đến hạn chưa? chưa ⇒ thoát
2. source enabled? không ⇒ thoát
3. cursor.lastConfirmedPeriod === null (cold start, chưa từng seed) ⇒ outcome "awaiting_seed", thoát
   (chờ ops seedAnchor 1 lần — KHÔNG còn đọc trang list tự động, xem §1 dưới)
4. adapter.planNextFetch
5. provider.fetch → LƯU submissions NGAY (kể cả khi lỗi)      ← bằng chứng trước, xử lý sau
6. adapter.parse → lỗi ⇒ submission.state = parse_failed + alert ⇒ thoát
7. checkIntrinsic → Failed ⇒ vẫn LƯU observation (state=failed) + alert
8. drawPeriod == expectedPeriod? không (`period_gap`) ⇒ ghi alert Warning (KHÔNG block) rồi
   TỰ NHẬN drawPeriod thực tế làm anchor mới — coi như bước 9 chạy tiếp với period đó
9. upsert observations (unique key ⇒ idempotent)
10. cập nhật cursor: lastConfirmedPeriod = drawPeriod, nextFetchAt, reset failures —
    `nextFetchAt` tính bằng `computeNextFetchAt(schedule, now, minIntervalMs)`: game `continuous`
    (Keno/Bingo18) dùng `minIntervalMs` + jitter như cũ; game `fixed` (Lotto535: quay 13:00+21:00
    VN mọi ngày) nhảy thẳng tới giờ quay kế tiếp — xem `05-lotto535-and-schedule.plan.md` §2
```

**Không còn `needsReanchor`/`planReanchor`.** Thiết kế ban đầu ở bước 7/8 cũ (đặt cờ
`needsReanchor = true` rồi tick sau đọc trang list để re-anchor) chưa từng chạy được
(`supportsReanchorParse` luôn `false` ở mọi adapter) và tạo nguy cơ deadlock chờ ops
`seedAnchor` — xem phân tích đầy đủ ở `05-lotto535-and-schedule.plan.md` §1. Cơ chế mới tự
self-heal ngay trong tick hiện tại, không cần tick riêng để re-anchor. Trạng thái cold-start cũ
gọi là `awaiting_anchor` nay đổi tên `awaiting_seed` (rõ nghĩa hơn — không còn "anchor từ trang
list", chỉ còn "chờ ops seed cursor lần đầu").

**Bước 5 trước bước 6 là có chủ đích:** lưu bằng chứng **trước khi** thử hiểu nó. Parse lỗi mà không
có raw thì không sửa được parser — và ta đã trả tiền cho request đó rồi.

**Bước 7 vẫn lưu observation khi checksum lệch:** không được im lặng bỏ. Observation `failed` là dữ
liệu để người xem "nguồn nói gì mà sai" — chỉ là nó không được tham gia consensus.

---

## 5. Chọn provider — so sánh kỹ thuật, đổi được bất cứ lúc nào

`FetchProvider` (00-overview.md D1/D2) làm cho việc chọn ở đây **không phải quyết định một lần, vĩnh
viễn** — chỉ là chọn implementation tốt nhất hiện có để bắt đầu chạy. Đổi provider = viết 1 class mới +
đổi 1 dòng registry, không đụng adapter/domain/consensus/schema. Mục này ghi **so sánh kỹ thuật**, không
phải rào chặn tiến độ.

### 5.1 Provider đang chọn — Oxylabs Web Unblocker (primary), context.dev Scrape HTML (secondary)

| | Oxylabs Web Unblocker | context.dev Scrape HTML |
| --- | --- | --- |
| Vai | ⭐ primary | secondary / failover |
| Trả bytes gốc hay đã xử lý? | Bytes gốc (proxy thật) | Bytes gốc **nếu dùng đúng endpoint Scrape HTML** — tránh Markdown/Extract (bẫy ở §5.5) |
| Cloudflare/CAPTCHA | Tự xử lý | Tự xử lý |
| Billing | per-GB | per trang thành công (dự toán tốt hơn) |
| Khớp `FetchProvider` (1 URL, đồng bộ) | ✅ | ✅ |

Giữ 2 provider từ đầu (không phải 1) có chủ đích: nếu Oxylabs đổi giá/hiệu năng/chính sách, chuyển sang
context.dev là đổi 1 dòng config registry, không phải viết lại gì. Đây chính là giá trị D2 mang lại.

### 5.2 Vì sao Oxylabs Web Unblocker, không phải Web Scraper API (WSA) của cùng vendor

Giữ nguyên D2 (vendor chỉ bán bytes) là lý do chọn — không phải giá:

1. **Chỉ Unblocker cho ta bytes gốc.** Unblocker là proxy ⇒ response body **chính là** byte vietlott.vn
   phát ra ⇒ `contentHash = sha256(bytes)` là bằng chứng provenance thật. WSA bọc HTML trong **JSON
   envelope** (`results[0].content`) ⇒ vendor **phải decode charset → string** trước khi JSON-encode. Hệ
   quả: (a) ta hash *text đã bị vendor chuẩn hoá*, không phải bytes gốc; (b) nếu vendor sniff charset sai
   — rủi ro thật với site Việt legacy khai một charset nhưng phát charset khác — dấu tiếng Việt hỏng
   **trước khi** ta thấy, và ta **không còn bytes để decode lại**. Đây là hệ đường tiền có thể bị audit:
   mất khả năng phục hồi bytes là mất nền của toàn bộ `submissions`.
   ⚠️ Chưa chốt tuyệt đối: WSA có `content_encoding: base64`, doc chỉ nói cho **image**. Nếu base64 áp
   được cho HTML thì phản biện này yếu đi ⇒ **đưa vào probe, không kết luận trước** (P11).
2. **D2 do năng lực vendor bảo đảm, không do kỷ luật của ta.** [FAQ Unblocker](https://oxylabs.io/products/web-unblocker):
   *"Can I get parsed data with Web Unblocker? **No** … returns results in raw HTML format only."* Unblocker
   **không thể** parse ⇒ D2 không thể bị phá. Với WSA, D2 chỉ đúng chừng nào **không ai bao giờ** set
   `parse: true` trong suốt đời sản phẩm. Bảo đảm bằng năng lực > bảo đảm bằng code review.
3. **Unblocker vừa khít `FetchProvider`, WSA thì không.** `fetch(req): Promise<FetchResult>` là hợp đồng
   **1 URL, đồng bộ**. WSA *Realtime* khớp; nhưng thứ duy nhất khiến WSA hấp dẫn là **Push-Pull `/batch`
   (5.000 URL/POST)** — mà cái đó là **job-based** (job id + poll/callback) ⇒ **không** nhét được vào
   `FetchProvider` mà không làm méo interface. Muốn batch phải sinh interface thứ hai.
   Và batch **không cần thiết**: hot path là cron lấy **1 kỳ mới**; re-parse sau khi sửa parser **không
   cần fetch lại** (đã có `bodyGz` trong `submissions` — đó là lý do nó tồn tại); backfill là việc hiếm,
   và ở rate limit **50 req/s** của plan trả phí thì 5.000 URL tuần tự ≈ 100 giây. Batch giải một bài
   toán ta không có.

### 5.3 Header Oxylabs có giá trị vận hành thật

| Header | Dùng vào đâu trong ResultFeed |
| --- | --- |
| `X-Oxylabs-Successful-Status-Codes` | Vietlott trả status lạ cho kỳ **chưa công bố**. Khai là "thành công" ⇒ Unblocker **không** đốt 5 lần retry (retry = latency + rác + tiền cho cùng câu trả lời "chưa có"). Khớp đúng §1.1 "KHÔNG retry khi nội dung sai" |
| `X-Oxylabs-Final-Url` (response) | Phát hiện redirect — Vietlott redirect khi `id` không tồn tại. Không có header này thì "trang kỳ khác" trông y như "trang kỳ mình xin" |
| `X-Oxylabs-Session-Id` | Giữ cùng IP cho chuỗi list → detail nếu site set cookie |
| `X-Oxylabs-Geo-Location: Vietnam` | Đọc trang từ IP Việt Nam khi cần so sánh nội dung theo geo |
| `x-oxylabs-render` **để trống** | Trang detail Vietlott là ASP.NET server-rendered ⇒ **không** render = nhanh nhất. Chỉ bật `html` nếu probe cho thấy thiếu data (render đẩy timeout lên ~180s) |

### 5.4 Đăng ký tài khoản Oxylabs — chạy probe càng sớm càng tốt

Chọn tier thấp nhất đủ dùng (Micro) — không cần tier to vì dung lượng dùng thật rất nhỏ (§5). Chạy probe
G0 **ngay** trên **free trial 1GB ≈ 10k results (no credit card)** — con số này gần bằng **một tháng
traffic production** (~13,2k request), nên trial đủ để vừa probe vừa soak-test, không chỉ smoke-test.

⚠️ Web Unblocker tính **per-GB** (cả upstream + downstream, chỉ tính request thành công), tức kiểu billing
mà D1c đã phê. Nhưng lời phê của D1c là về *phải viết lại transport khi site bật Cloudflare* — Web Unblocker
đã tự xử lý CAPTCHA/JS nên **không mắc** lỗi đó. Không được suy rộng thành "per-GB nói chung là ổn".

### 5.5 `context.dev` — secondary, không làm phụ thuộc duy nhất

**Độ tin cậy — dữ kiện, không cảm tính:**

| Tiêu chí | context.dev | Oxylabs |
| --- | --- | --- |
| Tuổi / quy mô | thành lập **2025**, **4 người**, **$500k**, YC S26 | 15.000+ khách, nhiều năm |
| Chứng nhận | SOC 2 **Type 1** (Type 2 đang observation) | **ISO/IEC 27001:2022** |
| Bảo hiểm | không nêu | **Technology E&O + Cyber Insurance** |
| Khách tham chiếu | Mintlify, daily.dev, Rho, 400+ | Stanford, Forbes, Trivago, ICIJ, Bellingcat |

Founder (Yahia Bakour — ex-Amazon SDE2, Principal SWE Sunrun, đã bán StockAlarm.io) và việc có SOC 2 Type 1 +
Trust Center cho thấy đây **không phải** dịch vụ hạng ba. Nhưng ba điểm khiến nó không thể là primary cho
**đường tiền**:

1. **4 người / $500k / 1 tuổi** ⇒ rủi ro không phải "gian" mà là **business continuity**: pivot, bị mua,
   hết runway. Kết quả xổ số nuôi settlement tiền thật — không đặt trên một nhà cung cấp seed-stage duy nhất
   làm **primary**; secondary thì hợp lý vì rủi ro chỉ hiện ra khi primary đã hỏng.
2. **SOC 2 Type 1 ≠ Type 2.** Type 1 = kiểm soát *được mô tả* tại một thời điểm; Type 2 = *được chứng minh
   vận hành* qua nhiều tháng. Đừng đọc "SOC 2" thành tương đương ISO 27001 vận hành lâu năm.

**Vai trò đúng: provider thứ hai.** Đây chính là thứ `FetchProvider` sinh ra để làm. Giá trị: nếu Oxylabs
đổi ý hoặc gặp sự cố, ta lật provider bằng một dòng config chứ không đứng im.

#### Phù hợp kỹ thuật — tốt, kèm MỘT cái bẫy

| Tiêu chí | Đánh giá |
| --- | --- |
| Cloudflare / DataDome / reCAPTCHA | ✅ tự xử lý, **mọi plan, không phụ phí** |
| Billing | ✅ 1 credit / trang thành công, **request bị block không tính tiền**, **dự toán tốt hơn per-GB của Oxylabs** |
| Geo | ✅ có `country` ⇒ `country=vn` |

🔴 **BẪY vi phạm D2:** mặc định của họ trả **Markdown** — tức **vendor đã parse hộ**, đúng thứ D2 cấm.
Phải dùng endpoint **Scrape HTML** (trả DOM đã render). Không chỉ là vấn đề nguyên tắc: Markdown làm **mất
cấu trúc bảng** mà phép kiểm checksum (§3) dựa vào ⇒ vừa sai kiến trúc vừa sai dữ liệu. **Tuyệt đối không**
dùng `Scrape Markdown` / `Extract` cho đường tiền.

**Hai phép đo bổ sung phải thêm vào probe kỹ thuật (§5.6):**

| # | Đo gì | Vì sao |
| --- | --- | --- |
| P10 | `maxAgeMs` — buộc về 0/nhỏ nhất | Họ có cache. Nhận trang cache = **lấy kỳ cũ tưởng kỳ mới**, cùng loại lỗi với `nocatche` (§2.2) |
| P11 | **WSA `content_encoding: base64` có áp được cho HTML** (doc chỉ nói cho image)? | Nếu base64 trả bytes gốc thật thì Web Scraper API lấy lại được provenance đã mất ở §5.2, và `/batch` thành lợi thế ròng. Đo bằng cách so `sha256` của bytes decode từ base64 với bytes Unblocker trả cho **cùng URL, cùng thời điểm** — trùng thì WSA đạt |

### 5.6 Probe kỹ thuật — chạy trên provider đang chốt trước khi viết adapter thật

Đo đúng thứ tự này (dừng ngay khi fail, cân nhắc đổi provider nếu fail sớm):

| # | Đo gì | Pass khi |
| --- | --- | --- |
| P1 | `GET` trang detail Keno qua provider | `200`, HTML chứa 20 số + 4 checksum |
| P2 | Lặp P1 **20 lần liên tục** | ≥ 19/20 `200`, không CAPTCHA loop |
| P5 | Trang detail Bingo18 | `200`, số **giữ đúng thứ tự** |
| P6 | Nguồn confirm thứ hai | `200` |
| P7 | p50/p95 latency của P1 | p95 < 15s |
| P8 | Chi phí thực tế cho P1–P7 | khớp bảng giá đã báo |

### 5.7 Nếu cả Oxylabs và context.dev đều không đạt probe

Đường lùi kỹ thuật, thứ tự thử — mỗi bước chỉ tốn 1 `FetchProvider` implementation mới, không đụng gì
ở tầng adapter/domain/consensus:

1. **Provider unblocker khác** (ScraperAPI, ZenRows, Smartproxy, …) — cùng loại, đổi 1 class.
2. **Tự vận hành exit node ở VN** (VPS/dịch vụ IP dân dụng VN) — ẩn IP hạ tầng chính, tự chịu phần vượt
   Cloudflare (đây là điều D1c muốn tránh ban đầu, nhưng vẫn là lựa chọn hợp lệ nếu cần).
3. **Chrome extension** — người/máy mở trang thật, đẩy HTML về qua 1 endpoint nhận `{ url, body }`, ghi
   thẳng vào `submissions` giống một `FetchProvider` khác. Không có gì trong kiến trúc ngăn cách này;
   là một điểm cắm khác cho cùng interface.
4. **Nhà cung cấp feed xổ số thương mại** (`xosoapi.online`, `manycai`, …) — mua kết quả đã chuẩn hoá
   thay vì tự fetch. Không authoritative (họ cũng lấy lại, không có nguồn gốc chính chủ), chỉ đủ vai
   `SourceRole.Confirming`, và phải kiểm chất lượng/độ trễ trước khi dùng.

## 6. Checklist

- [ ] Không có `fetch()` trực tiếp tới site nguồn ở bất kỳ đâu — grep `vietlott.vn`/`http` trong `resultfeed*`.
- [ ] `FetchProvider.fetch` không decode/trim/sửa `body`.
- [ ] `SourceAdapter.parse` là pure: không import repo, không `Date.now()`, không `process.env`.
- [ ] Parser **không sort**, **không dedupe**, **không tự tính checksum**.
- [ ] Mỗi adapter có fixture HTML thật commit + test assert số & checksum.
- [ ] `parserVersion` bump khi sửa selector; fixture cũ giữ lại.
- [ ] Retry chỉ cho lỗi transport, không retry "kỳ chưa có".
- [ ] `nocatche` (hoặc cache-buster tương đương) luôn có giá trị biến thiên.
- [ ] `nextFetchAt` có jitter ±20%.
- [ ] Submission được lưu **trước** khi parse.
- [ ] Adapter site A không import gì từ site B.