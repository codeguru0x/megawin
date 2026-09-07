# p2-05 — Log quyết định + hiển thị trên Hub + vai trò Mira

> **Phase:** P2 · **Status:** ⏳ pending · **Phụ thuộc:** p2-04 (settle) · **Chặn:** — (plan cuối)
> **Nguồn:** [`keno-bingo18-autopilot-eve-feasibility.analysis.md`](../../analysis/keno-bingo18-autopilot-eve-feasibility.analysis.md) §3.2 điểm 3, §3.3
> **Đổi số 06/09/2026:** file này TRƯỚC là `p2-03-autopilot-decision-log-ui.plan.md`, viết khi
> Auto-Pilot chỉ có 1 giai đoạn (kết sổ). Sau khi mở rộng thành 4 giai đoạn (`p2-02` mở/đóng bán,
> `p2-03` nhận kết quả, `p2-04` kết sổ — xem [`p2-01`](./p2-01-autopilot-config.plan.md) §0), nội dung
> chi tiết bên dưới **vẫn tập trung vào giai đoạn kết sổ** (rủi ro tiền thật cao nhất, cần log chặt
> nhất) — không viết lại toàn bộ cho cả 4 giai đoạn. Xem §9 cho hướng dẫn áp dụng pattern này cho
> `p2-02`/`p2-03`.

## 1. Vì sao log là plan riêng, không gộp vào p2-04

> *"Không có Monitor, Auto-Pilot là 1 hộp đen không ai theo dõi được."* — §4 analysis

Log **không phải** tính năng phụ. Nó là điều kiện để dry-run ([`p2-04`](./p2-04-autopilot-settle-engine.plan.md) §4)
có ý nghĩa: không có log, không có cách nào biết máy **định** làm gì trong tuần dry-run.

Nhưng tách plan vì: `p2-04` chỉ cần **ghi** log (backend), `p2-05` (file này) làm phần **đọc** (UI +
retention + tích hợp Mira). Ghi log là bắt buộc cho `p2-04` hoạt động; đọc log là việc riêng, làm sau được.

> **Thứ tự thực tế:** phần **ghi** (§2, §3) thuộc `p2-04` về mặt thời gian — phải xong cùng lúc worker
> chạy. Phần **đọc** (§4, §5, §6) là `p2-05`. Plan này tài liệu hoá **cả hai** để thiết kế collection
> không bị quyết định nửa vời trong `p2-04`.

## 2. Collection

`{game}_auto_settle_decisions` — theo §3.2 analysis.

```typescript
/**
 * Log quyết định Auto-Pilot — 1 doc cho MỖI lần chạy worker, KHÔNG phải mỗi kỳ.
 *
 * Vì sao gộp theo lần chạy: worker chạy mỗi 3 phút × 24h = 480 lần/ngày. Nếu mỗi kỳ 1 doc,
 * 480 × ~120 kỳ = 57.600 doc/ngày cho MỖI game — phần lớn là "kỳ này vẫn không đủ điều kiện",
 * lặp lại y nguyên. Gộp theo lần chạy: 480 doc/ngày, mỗi doc chứa mảng quyết định.
 *
 * Trade-off đã cân: truy vấn "kỳ X từng bị bỏ qua vì gì" phải quét theo `evaluatedAt` +
 * unwind mảng, chậm hơn query trực tiếp theo `drawId`. Chấp nhận được vì đây là truy vấn
 * tra soát (thỉnh thoảng), không phải truy vấn nóng của Hub UI (§4 dùng cách khác).
 */
export interface AutoSettleDecisionLogDoc {
  _id?: ObjectId;
  /** Thời điểm worker chạy. Index chính. */
  evaluatedAt: Date;
  /** `enabled` tại thời điểm chạy — phân biệt dry-run với chạy thật. */
  enabled: boolean;
  /** Ngưỡng đã dùng — để tra "lúc đó ngưỡng là bao nhiêu" sau khi config đã đổi. */
  configSnapshot: OpsAutoSettleConfig;
  /** Tổng số kỳ đã đánh giá. */
  evaluatedCount: number;
  /** Kỳ đủ điều kiện + kết quả settle (nếu `enabled`). */
  eligible: AutoSettleLogEntry[];
  /** Kỳ không đủ + lý do. */
  skipped: AutoSettleLogEntry[];
}

/** Một kỳ trong log. */
export interface AutoSettleLogEntry {
  drawId: string;
  reasons: AutoSettleSkipReason[];
  /**
   * 9 field của `AutoSettleMetrics` (`p2-04` §2) — SỐ TIỀN THẬT từ preview, không phải proxy.
   * Ghi đủ cho MỌI kỳ (đạt hoặc không) vì đây là tập số liệu dùng hiệu chuẩn ngưỡng.
   *
   * Sửa 07/09/2026 lần 2: bản trước là `{ revenue, entries, exposure, alertsCritical }` —
   * `exposure` đã bị loại khỏi quyết định kết sổ (`p2-01` §3.4.2). Dùng thẳng
   * `AutoSettleMetrics`, KHÔNG khai lại inline (`code-quality-standards.mdc` §5).
   */
  metrics: AutoSettleMetrics;
  /**
   * Kết quả gọi bulk-settle cho kỳ này. `undefined` khi dry-run hoặc khi kỳ bị skip.
   * Ghi lại để tra "máy định settle nhưng có settle được không".
   */
  settleResult?: { ok: boolean; errorCode?: string };
}
```

**Lưu `configSnapshot` mỗi lần chạy** là điểm dễ bỏ. Không có nó, 3 tháng sau nhìn log thấy "kỳ doanh
thu 20 triệu được auto-settle" mà không biết lúc đó ngưỡng là 25 triệu (hợp lệ) hay 10 triệu (bug).

### 2.1 Index

```typescript
{
  collection: KenoCollections.AutoSettleDecisions,
  key: { evaluatedAt: -1 },
  options: { name: "idx_evaluatedAt_desc" },
  purpose: "Đọc N lần chạy gần nhất cho panel Auto-Pilot + TTL cleanup theo thời gian",
}
```

**TTL index** để tự dọn:

```typescript
{
  collection: KenoCollections.AutoSettleDecisions,
  key: { evaluatedAt: 1 },
  options: { name: "idx_evaluatedAt_ttl", expireAfterSeconds: AUTO_SETTLE_LOG_TTL_SECONDS },
  purpose:
    "Tự xoá log cũ. 480 doc/ngày/game × 2 game — giữ 30 ngày là đủ cho tra soát, " +
    "không cần lưu vĩnh viễn (audit log settle chính thức đã có ở audit collection).",
}
```

`AUTO_SETTLE_LOG_TTL_SECONDS = 30 * 24 * 3600` (30 ngày). Khai `as const` + JSDoc giải thích con số.

> **Lưu ý:** Mongo cần **2 index riêng** cho `evaluatedAt` nếu muốn cả sort desc và TTL — hoặc dùng 1
> index `{ evaluatedAt: 1 }` cho cả hai (Mongo dùng được index tăng cho sort giảm). **Verify khi code**:
> ưu tiên 1 index duy nhất `{ evaluatedAt: 1 }` + `expireAfterSeconds`, kiểm tra `explain()` xác nhận
> sort desc vẫn IXSCAN. Bớt 1 index = bớt chi phí ghi.

**Log này KHÔNG thay audit log settle.** Audit chính thức (ai/khi/kỳ nào được settle) đã có từ
`TriggerSettleUseCase`. Log này chỉ giải thích **vì sao máy chọn/không chọn** — nên TTL 30 ngày là đủ.

## 3. Ghi log — thuộc p2-04

Worker ghi **1 doc mỗi lần chạy**, **sau** khi đánh giá và (nếu có) settle. Ghi **cả** khi dry-run.

```typescript
// Ghi log SAU khi có kết quả settle → 1 lần write duy nhất, không phải write rồi update.
// Nếu bulk-settle throw, vẫn ghi log với `settleResult` phản ánh lỗi — mất log là mất khả
// năng debug đúng lúc cần nhất.
```

**Ghi log không được làm worker fail.** Bọc `try/catch` riêng: nếu ghi log lỗi, log ra CloudWatch rồi
tiếp tục — không để việc ghi log chặn/rollback việc settle đã xảy ra.

Nhưng **ngược lại không đúng**: nếu settle lỗi, vẫn phải ghi log. Thứ tự: settle → ghi log (kể cả khi
settle throw, bắt lỗi rồi ghi).

## 4. Hiển thị trên Hub — 2 nơi

### 4.1 Badge tại dòng kỳ (Queue Table)

Theo §3.3 analysis: kỳ bị Auto-Pilot bỏ qua hiện badge *"Auto-Pilot bỏ qua: {reason}"*.

**Vấn đề performance:** Hub snapshot có 4 query cố định (p0-03). Thêm query đọc log cho 150 kỳ sẽ phá
ràng buộc đó.

**Giải pháp: đọc log của LẦN CHẠY GẦN NHẤT — đúng 1 doc.**

```typescript
/**
 * Đọc quyết định Auto-Pilot gần nhất — ĐÚNG 1 doc, không phụ thuộc số kỳ.
 *
 * Hub cần biết "lần chạy vừa rồi máy nghĩ gì về từng kỳ". Log gộp theo lần chạy (§2) nên
 * 1 doc đã chứa quyết định cho MỌI kỳ → 1 query `findOne` sort `evaluatedAt` desc là đủ.
 *
 * Đây chính là lý do §2 chọn gộp theo lần chạy thay vì mỗi kỳ 1 doc: nếu tách, Hub sẽ cần
 * `$in` 150 drawId + group — đắt hơn nhiều cho đúng cùng thông tin.
 */
async getLatestDecisionLog(): Promise<AutoSettleDecisionLogDoc | null>;
```

Query Hub thành **5** (từ 4). Tăng 1, không phụ thuộc N — vẫn giữ ràng buộc gốc. **Ghi rõ điều này
trong JSDoc `GetOpsHubSnapshotUseCase`** để con số "4 query" trong p0-03 không thành sai lệch tài liệu.

Chỉ query khi `autoSettle` có tồn tại (game đã cấu hình) — game chưa dùng Auto-Pilot giữ 4 query.

Badge chỉ hiện cho kỳ trong `skipped` với `reasons` **không rỗng**. Map `AutoSettleSkipReason` → label
tiếng Việt qua `Record<AutoSettleSkipReason, string>` (compiler bắt thiếu khoá khi thêm lý do mới).

Nhiều lý do → hiện lý do **quan trọng nhất** trên badge + tooltip liệt kê đủ. Thứ tự ưu tiên:

```
NoPreview | PreviewIncomplete | PreviewStaleResult | PreviewMismatchDetected
                                          ← nhóm "dữ liệu không dùng được" đứng ĐẦU
  > AlreadySettled > NotPublished          ← trạng thái
  > CriticalAlert > WarningAlert           ← alert
  > CapTriggered > SingleEntryPayoutTooHigh ← tập trung rủi ro / nhánh cap
  > PayoutRatioTooHigh > PayoutAbsoluteTooHigh > NetProfitTooLow > RevenueTooHigh ← ngưỡng tiền
  > ZeroRevenue > DelayNotElapsed > RunLimitReached  ← chờ / không đáng lo
```

**Nhóm `Preview*` phải đứng đầu**, kể cả trên `CriticalAlert`. Lý do: khi một trong 4 lý do đó xuất hiện,
mọi lý do khác trong cùng `reasons[]` được suy từ **số liệu không dùng được** — hiện badge "Tỷ lệ trả
thưởng quá cao" cho một kỳ mà preview mới quét 30% entries là **thông tin sai lệch chủ động**, staff sẽ đi
nới ngưỡng thay vì chờ preview xong. Badge phải nói đúng vấn đề gốc.

Trong nhóm đó, **`PreviewMismatchDetected` cần UI riêng biệt** — nó không phải "kỳ này chưa đủ dữ liệu"
mà là "**máy đang tính sai tiền, toàn bộ Auto-Pilot kết sổ đã bị chặn cứng**". Hiện nó như một badge lý do
bình thường cạnh 15 lý do khác là **hạ thấp mức độ nghiêm trọng**. Yêu cầu:

- Banner đỏ **cấp trang** (không phải badge cấp dòng), text: *"Auto-Pilot kết sổ đang bị chặn: kết sổ thử
  lệch settle thật ở kỳ X"* + link tới kỳ lệch + link tới alert.
- Badge dòng vẫn hiện, nhưng label ghi rõ "chặn toàn hệ thống", không phải "kỳ này không đạt".

`DelayNotElapsed` và `RunLimitReached` xếp cuối vì chúng **tự hết** ở nhịp cron sau — không cần staff làm
gì. Hiện chúng nổi bật sẽ tạo cảm giác có việc phải xử lý trong khi không có.

`ZeroRevenue` xếp cuối cùng nhóm "không đáng lo" — khác bản trước. Trước đây nó **đáng nghi** (không phân
biệt được "thật sự 0 cược" với "stats chưa hút entry"); giờ `preview.complete === true` đã bảo đảm quét
xong, nên `ZeroRevenue` nghĩa đúng nghĩa: kỳ không ai cược, settle tay 1 giây.

### 4.2 Panel "Hoạt động Auto-Pilot"

Zone mới trên Hub (dưới KPI, trên bảng), **chỉ hiện khi** `autoSettle` tồn tại.

Nội dung:
- Badge trạng thái: **`ĐANG BẬT`** (green) / **`DRY-RUN`** (amber) / **`TẮT`** (slate).
- Lần chạy gần nhất: `evaluatedAt` + `"{n} kỳ đủ điều kiện, {m} kỳ bỏ qua"`.
- Khi dry-run: cảnh báo rõ *"Đang chạy thử — máy KHÔNG kết sổ. Đây là các kỳ máy sẽ kết sổ nếu bật."*
- Link "Xem lịch sử" → dialog list N lần chạy gần nhất.

**Badge `DRY-RUN` phải nổi bật.** Nhầm dry-run với đang bật là nhầm nghiêm trọng theo cả 2 chiều: tưởng
máy đang làm (thực ra không) hoặc tưởng máy chưa làm (thực ra đang làm).

Trạng thái suy từ `enabled` của **config hiện tại**, không phải `enabled` trong log (log là lịch sử).
Nhưng nếu 2 giá trị khác nhau → hiện thêm *"Cấu hình vừa đổi, chờ nhịp chạy tiếp theo"*.

### 4.3 Dialog lịch sử

`findMany({}, { sort: { evaluatedAt: -1 }, limit: 50 })` — **`limit` tường minh** (trần 500 im lặng,
p0-03 §1). Chỉ query khi dialog mở (`enabled: dialogOpen`).

Mỗi dòng: `evaluatedAt`, badge dry-run/thật, số eligible/skipped, số settle thành công/lỗi. Click → xem
chi tiết kỳ của lần chạy đó.

## 5. Vai trò Mira — chỉ ĐỌC, chỉ GIẢI THÍCH

> *"để Mira (nếu cần) trả lời câu hỏi 'vì sao' bằng cách **đọc lại log này** (KHÔNG suy luận)"* — §3.2

Ranh giới tuyệt đối:

| Mira ĐƯỢC | Mira KHÔNG ĐƯỢC |
|---|---|
| Đọc log quyết định, tóm tắt bằng tiếng Việt | Quyết định kỳ nào đủ điều kiện |
| Trả lời "vì sao kỳ X bị bỏ qua" bằng `reasons` **có trong log** | Suy luận lý do không có trong log |
| Tổng hợp "tuần này máy bỏ qua nhiều nhất vì lý do gì" | Đề xuất tự động đổi ngưỡng |
| Chỉ ra kỳ cần người xem | Gọi bất kỳ mutation nào (settle/void/config) |

**Tool cho Mira (nếu làm):** chỉ 1 tool **read-only** đọc log. Theo `app-use-case-layering.mdc` §1: tool
AI mặc định gọi thẳng use-case của package + `serializeDates`, **không** cần file trong `server/ai/` trừ
khi phải gộp nhiều nguồn + gắn nhãn cho model. Ở đây 1 nguồn → gọi thẳng.

**Tool này là optional, làm sau cùng.** Panel §4.2 đã trả lời được mọi câu hỏi; Mira chỉ thêm tiện lợi.
Không để nó chặn plan.

**Nếu Mira trả lời khác log → là bug của Mira**, không phải "AI có góc nhìn khác". Prompt phải ràng
buộc: chỉ dùng dữ liệu trong tool result, không suy diễn.

## 6. Test

| Case | Kỳ vọng |
|---|---|
| Worker chạy dry-run | 1 doc log, `enabled: false`, `eligible` có dữ liệu, `settleResult` `undefined` |
| Worker chạy thật | `settleResult` có `ok` cho từng kỳ |
| Bulk-settle throw | **Vẫn** ghi log, `settleResult.ok = false` + `errorCode` |
| Ghi log lỗi | Worker **không** fail, có log CloudWatch |
| Hub với `autoSettle` chưa cấu hình | **4** query (không đọc log) |
| Hub với `autoSettle` đã cấu hình | **5** query, không phụ thuộc số kỳ |
| Kỳ trong `skipped` | Badge hiện lý do ưu tiên cao nhất + tooltip đủ lý do |
| Kỳ nhiều lý do | Badge = lý do ưu tiên cao nhất theo thứ tự §4.1 |
| Kỳ có `PreviewIncomplete` + `PayoutRatioTooHigh` | Badge = `PreviewIncomplete`, **không** phải ngưỡng tiền |
| Có `PreviewMismatchDetected` | **Banner đỏ cấp trang** + badge dòng ghi "chặn toàn hệ thống" |
| `enabled: false` | Panel badge **`DRY-RUN`** rõ ràng |
| `enabled: true` | Panel badge `ĐANG BẬT` |
| Config vừa đổi, chưa có nhịp chạy mới | Hiện "Cấu hình vừa đổi, chờ nhịp tiếp theo" |
| Dialog lịch sử đóng | **0** query |
| TTL sau 30 ngày | Doc cũ tự xoá (test bằng cách đặt TTL ngắn ở staging) |
| Thêm `AutoSettleSkipReason` mới | Compiler bắt `Record` label thiếu khoá |

## 7. Review checklist

- [ ] Log gộp **theo lần chạy**, không phải mỗi kỳ 1 doc. Có JSDoc giải thích trade-off.
- [ ] `configSnapshot` được lưu mỗi lần chạy.
- [ ] TTL index có, `AUTO_SETTLE_LOG_TTL_SECONDS` khai `as const` + JSDoc.
- [ ] Đã verify 1 index `{ evaluatedAt: 1 }` phục vụ cả sort desc và TTL (`explain()` dán vào PR).
- [ ] Ghi log lỗi **không** làm worker fail; settle lỗi **vẫn** ghi log.
- [ ] Hub thêm **đúng 1** query (`findOne`), chỉ khi `autoSettle` tồn tại.
- [ ] JSDoc `GetOpsHubSnapshotUseCase` cập nhật "4 → 5 query" với lý do.
- [ ] `limit` tường minh ở dialog lịch sử.
- [ ] Dialog `enabled: dialogOpen` — 0 query khi đóng.
- [ ] Badge `DRY-RUN` nổi bật, không lẫn với `ĐANG BẬT`.
- [ ] Label lý do qua `Record<AutoSettleSkipReason, string>` — compiler bắt thiếu khoá.
- [ ] `metrics` dùng thẳng type `AutoSettleMetrics`, **không** khai lại inline (§5 code-quality).
- [ ] Nhóm `Preview*` xếp **đầu** thứ tự badge, trên cả `CriticalAlert` (§4.1).
- [ ] `PreviewMismatchDetected` có **banner đỏ cấp trang**, không chỉ badge dòng.
- [ ] Mira (nếu làm) **chỉ read-only**, 1 tool, không mutation nào.
- [ ] Log này **không** thay audit log settle chính thức.
- [ ] `pnpm check-types` + `pnpm lint` xanh.

## 8. Rủi ro

| Rủi ro | Mức | Xử lý |
|---|---|---|
| Nhầm dry-run với đang bật | 🔴 | Badge nổi bật + cảnh báo text + test §6 |
| Mira "giải thích" bằng suy diễn không có trong log | 🔴 | Tool read-only + prompt ràng buộc + coi lệch là bug |
| Mira gọi mutation | 🔴 | Chỉ cấp tool read; review bắt buộc |
| Log phình DB (57k doc/ngày nếu tách theo kỳ) | 🟡 | Gộp theo lần chạy + TTL 30 ngày |
| Thêm query đọc log phá ràng buộc 4 query | 🟡 | 1 `findOne`, chỉ khi có config; cập nhật JSDoc |
| Mất log đúng lúc cần debug | 🟡 | Ghi log kể cả khi settle throw; `try/catch` riêng |
| Badge lý do thiếu → staff quyết sai | 🟡 | Tooltip liệt kê đủ (p2-04 §2.1 đã thu thập mọi lý do) |
| TTL xoá log còn cần tra | 🟢 | 30 ngày; audit chính thức vẫn còn |

## 9. Rollback

Phần **đọc** (UI): revert commit, Hub mất panel + badge nhưng chạy bình thường.

Phần **ghi**: **không** revert nếu Auto-Pilot đang bật — tắt `enabled` trước (p2-04 §8), vì tắt log mà
máy vẫn chạy là đúng tình trạng "hộp đen" mà toàn bộ plan này tồn tại để ngăn.

Collection log có thể `drop` sau khi đã tắt Auto-Pilot và không cần tra soát.

## 9. Áp dụng pattern này cho p2-02 (mở/đóng bán) và p2-03 (nhận kết quả)

Nội dung §2-§8 viết chi tiết cho **giai đoạn kết sổ** vì đây là giai đoạn rủi ro tiền thật cao nhất —
cần log chặt nhất để review. Khi triển khai `p2-02` và `p2-03`, áp dụng **cùng nguyên tắc**, KHÔNG
copy nguyên văn:

- **Collection riêng cho mỗi giai đoạn**, không gộp chung 1 collection cho cả 4 giai đoạn — mỗi giai
  đoạn có shape quyết định khác nhau (`AutoOpenPlan` không giống `AutoSettleDecision`). Đặt tên theo
  pattern `{game}_auto_{phase}_decisions` (VD `keno_auto_open_decisions`, `keno_auto_publish_decisions`).
- **Gộp theo lần chạy, không theo đối tượng** — với `auto-open` thì "đối tượng" là slot giờ quay chưa
  tạo, với `auto-publish` là kỳ đang chờ kết quả. Cùng lý do §2: tránh phình DB.
- **TTL 30 ngày** — giữ nguyên con số, không cần tính lại riêng cho mỗi giai đoạn trừ khi có lý do
  nghiệp vụ khác (VD auto-open ít rủi ro hơn, có thể rút ngắn TTL nếu muốn — không bắt buộc).
- **Badge trên Hub:** `auto-open`/`auto-close` ít cần badge per-draw (không có khái niệm "kỳ bị máy bỏ
  qua" theo cách người xem quan tâm hàng ngày) — ưu tiên panel "Hoạt động Auto-Pilot" (§4.2) mở rộng
  thêm tab cho từng giai đoạn, KHÔNG nhân bản 4 panel riêng.
- **Mira** đọc log của TẤT CẢ giai đoạn qua 1 tool tổng hợp (nếu làm) — không 4 tool riêng biệt, để
  tránh Mira phải biết "hỏi giai đoạn nào dùng tool nào".
- **Không có nghĩa `p2-02`/`p2-03` phải hoàn thành phần đọc trước khi merge phần ghi** — cùng nguyên
  tắc §1: ghi là bắt buộc đi cùng worker, đọc là việc riêng làm sau.
