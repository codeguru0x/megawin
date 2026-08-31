# DrawFeed — Fetch & Parse

Ba tầng, ranh giới cứng. Mỗi tầng chỉ biết tầng kế bên.

```
Transport  │ FetchProvider — thuê bytes. KHÔNG biết game, KHÔNG parse.
           │   BrightDataUnlockerProvider · <VendorKhác>Provider
───────────┼──────────────────────────────────────────────────────────
Adapter    │ SourceAdapter — biết 1 site: build URL, parse HTML/JSON của site đó.
           │   Hàm PURE. KHÔNG I/O, KHÔNG DB, KHÔNG biết site khác.
───────────┼──────────────────────────────────────────────────────────
Orchestr.  │ Use-case + repo — lịch chạy, lưu submission/observation, lock, alert.
```

## 1. Transport — `FetchProvider`

`packages/drawfeed-application/src/infras/providers/`.

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
   * Header tuỳ ý. ⚠️ Tránh dùng: một số vendor (Bright Data Web Unlocker) đòi
   * duyệt compliance khi bật custom header và có thể mất chế độ pay-per-success.
   * Nếu adapter cần header lạ → xem lại có endpoint GET thuần nào thay được không
   * (analysis §13.3 đã tránh được đúng bẫy này).
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
  providerRequestId: string | null;
  /** Meta thô của vendor (để debug/mở ticket). Không ai được parse field này ra logic. */
  providerMeta: Record<string, unknown>;
  /** Đơn vị tính phí vendor báo. Cộng dồn thành báo cáo chi phí. */
  costUnits: number;
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

### 1.1. `BrightDataUnlockerProvider`

```typescript
/**
 * Bright Data Web Unlocker API — ĐỒNG BỘ, 1 HTTP call trả body ngay.
 *
 * Vì sao Unlocker cho MỌI nguồn (không proxy): site bật Cloudflare/CAPTCHA sau
 * này không cần đổi gì; billing per-successful-request nên HTML to không tốn thêm.
 * Xem `00-overview.md` D1.
 *
 * Vì sao KHÔNG dùng Scraper Studio để extract: logic đường tiền phải nằm trong
 * repo có commit hash + CI. Xem analysis §8.3, §14.4.
 */
export class BrightDataUnlockerProvider implements FetchProvider {
  readonly providerId = "brightdata-unlocker";
  // POST https://api.brightdata.com/request
  // body: { zone, url, format: "raw", country?, ... }
  // Authorization: Bearer <BRIGHTDATA_UNLOCKER_TOKEN>
}
```

Dùng `@megawin/http-client` (`createHttpClient` + `withRetry`) — không tự viết fetch/retry.

**Retry:** chỉ retry lỗi **transport** (timeout, 5xx của vendor). **KHÔNG** retry khi vendor trả 200
mà nội dung sai (kỳ chưa có) — đó là việc của lịch fetch, không phải retry. Retry sai chỗ = trả tiền
nhiều lần cho cùng một câu trả lời "chưa có".

### 1.2. Chi phí phải đo được, không phải đoán

`costUnits` + `providerRequestId` lưu vào mọi `submissions` doc ⇒ báo cáo chi phí là một `$group`, và
đối soát được với hoá đơn vendor. Alert `cost_spike` khi chi phí ngày vượt ngưỡng — đây là cách phát
hiện vòng lặp retry hỏng **trước** khi thấy trên hoá đơn.

---

## 2. Adapter — mỗi site một cái, không biết nhau

`packages/drawfeed-application/src/sources/<sourceId>/`.

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
  readonly gameKeys: readonly DrawFeedGameKey[];

  /** Dựng request kế tiếp từ cursor. Nơi hiện thực "dự đoán id". */
  planNextFetch(input: { gameKey: DrawFeedGameKey; cursor: SourceCursorDoc }): FetchPlan;

  /** Dựng request re-anchor (đọc trang list) khi `needsReanchor`. */
  planReanchor(input: { gameKey: DrawFeedGameKey }): FetchPlan;

  /** Đọc bytes → dữ liệu kỳ. Throw `ParseError` khi không đọc được. */
  parse(input: { gameKey: DrawFeedGameKey; body: Buffer; contentType: string }): ParsedObservation;
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

---

## 3. Rule layer — kiểm checksum, thuộc DOMAIN không thuộc adapter

`packages/drawfeed/src/rules/intrinsic-check.ts`. Pure, không I/O.

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
  gameKey: DrawFeedGameKey,
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

Nguồn không công bố checksum nào ⇒ `IntrinsicState.NotAvailable`, **không phải** `Passed`. Phân biệt
này quan trọng: `NotAvailable` không được dùng làm cơ sở nâng độ tin cậy.

---

## 4. Workers — `apps/drawfeed-worker`

Mirror `apps/worker-keno`: Serverless Framework + esbuild + `serverless.yml` chia function theo file
`src/functions/*.yml`, dùng `@megawin/worker-core` cho lock/tick.

```
apps/drawfeed-worker/
├── serverless.yml
├── esbuild.config.mjs
├── src/
│   ├── functions/
│   │   ├── fetch.yml          ← 1 entry / source × game
│   │   └── consensus.yml
│   └── handlers/
│       ├── fetch/
│       │   ├── vietlott-keno.ts
│       │   └── vietlott-bingo18.ts
│       └── consensus/tick.ts
└── test/
```

| Function | Nhịp | Lock | Việc |
| --- | --- | --- | --- |
| `fetch-vietlott-keno` | cron 1 phút, tự bỏ qua nếu `nextFetchAt` chưa tới | `drawfeed:fetch:vietlott-detail:keno` | Fetch → submission → parse → observation |
| `fetch-vietlott-bingo18` | cron 1 phút | `drawfeed:fetch:vietlott-detail:bingo18` | như trên |
| `consensus-tick` | cron 1 phút | `drawfeed:consensus:all` | Observation → consensus (D5: tách riêng) |

**Vì sao cron 1 phút mà không cron đúng giờ quay:** giờ quay có thể trễ; cron 1 phút + `nextFetchAt`
trong cursor cho phép điều khiển nhịp **bằng dữ liệu** (sửa trong backoffice) thay vì bằng
`serverless.yml` (phải redeploy). Tick không đến hạn thì thoát ngay, gần như không tốn gì.

**Jitter bắt buộc:** `nextFetchAt` cộng ngẫu nhiên ±20% — nhịp đều tăm tắp là dấu hiệu bot rõ nhất,
và đây là lớp ẩn danh mà Unlocker **không** che được (analysis §12.7).

### 4.1. Pipeline một lần fetch

```
1. Lấy cursor → đến hạn chưa? chưa ⇒ thoát
2. source enabled? không ⇒ thoát
3. adapter.planNextFetch (hoặc planReanchor nếu needsReanchor)
4. provider.fetch → LƯU submissions NGAY (kể cả khi lỗi)      ← bằng chứng trước, xử lý sau
5. adapter.parse → lỗi ⇒ submission.state = parse_failed + alert ⇒ thoát
6. checkIntrinsic → Failed ⇒ vẫn LƯU observation (state=failed) + alert
7. drawPeriod == expectedPeriod? không ⇒ needsReanchor = true + alert period_gap
8. upsert observations (unique key ⇒ idempotent)
9. cập nhật cursor: lastConfirmedPeriod, nextFetchAt (+jitter), reset failures
```

**Bước 4 trước bước 5 là có chủ đích:** lưu bằng chứng **trước khi** thử hiểu nó. Parse lỗi mà không
có raw thì không sửa được parser — và ta đã trả tiền cho request đó rồi.

**Bước 6 vẫn lưu observation khi checksum lệch:** không được im lặng bỏ. Observation `failed` là dữ
liệu để người xem "nguồn nói gì mà sai" — chỉ là nó không được tham gia consensus.

---

## 5. Checklist

- [ ] Không có `fetch()` trực tiếp tới site nguồn ở bất kỳ đâu — grep `vietlott.vn`/`http` trong `drawfeed*`.
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
