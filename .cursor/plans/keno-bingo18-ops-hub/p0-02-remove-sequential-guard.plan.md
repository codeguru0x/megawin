---
name: ""
overview: ""
todos: []
isProject: false
---

# p0-02 — Bỏ guard settle/void tuần tự (Keno + Bingo18)

> **Phase:** P0 · **Status:** ⏳ pending · **Phụ thuộc:** p0-01 (CHẶN CỨNG) · **Chặn:** p0-04
> **Nguồn:** [`sequential-settle-guard.analysis.md`](../../analysis/keno-bingo18-sequential-settle-guard.analysis.md)
> **Scope:** `game-keno-application`, `game-bingo18-application` — **KHÔNG đụng 5 game còn lại**

## 1. Vấn đề

4 chỗ chặn settle/void khi kỳ trước chưa hoàn thành:

| File | Dòng | Error code |
|---|---|---|
| `game-keno-application/src/use-cases/draws/trigger-settle.ts` | 54-60 | `DRAW_SETTLE_ORDER` |
| `game-keno-application/src/use-cases/draws/void-draw.ts` | 72-78 | `DRAW_VOID_ORDER` |
| `game-bingo18-application/src/use-cases/draws/trigger-settle.ts` | 54-60 | `DRAW_SETTLE_ORDER` |
| `game-bingo18-application/src/use-cases/draws/void-draw.ts` | 73-79 | `DRAW_VOID_ORDER` |

Cả 4 gọi `drawRepo.findUnfinishedDrawBefore(input.drawId)` và throw nếu tìm thấy kỳ trước còn dở.

Hệ quả thật: 1 kỳ Keno quarantine lúc 07:16 → **112 kỳ liên tiếp** publish được nhưng không kỳ nào
settle được. Với Keno ~119 kỳ/ngày (`drawIntervalMinutes = 8`) và Bingo18 ~158 kỳ/ngày
(`drawIntervalMinutes = 6`), một kỳ tắc là cả ngày tắc.

> Hai con số này lấy từ `DEFAULT_PLAY_CONFIG`:
> [`game-keno/src/rules/financials.ts:231-232`](../../../packages/game-keno/src/rules/financials.ts)
> (`salesCloseBeforeSeconds: 60`, `drawIntervalMinutes: 8`) và
> [`game-bingo18/src/rules/financials.ts:128-129`](../../../packages/game-bingo18/src/rules/financials.ts)
> (`salesCloseBeforeSeconds: 30`, `drawIntervalMinutes: 6`).
> **Cả hai cấu hình được per-tenant** → mọi chỗ cần chu kỳ phải **đọc config**, không hardcode.
> Bản plan trước ghi sai (Keno 4 phút, Bingo18 3 phút) — đã sửa.

## 2. Vì sao guard này an toàn để bỏ (Keno/Bingo18) nhưng KHÔNG an toàn cho 5 game kia

Guard tồn tại vì lo "trả thưởng/đối soát sai thứ tự thời gian". Kiểm tra thực tế từng thứ:

| Câu hỏi | Keno / Bingo18 | 3 game jackpot (L535/M645/P655) |
|---|---|---|
| Kết quả kỳ T có phụ thuộc kỳ T-1? | **Không** — RNG độc lập | Không |
| Tiền thưởng kỳ T có phụ thuộc kỳ T-1? | **Không** — prize table cố định, cap theo kỳ | **CÓ** — `JackpotCycleDoc.jp1Current` rollover |
| Rollup daily có phụ thuộc thứ tự? | **Không** — re-aggregate toàn bộ theo `financialDate` | Không |
| Ví người chơi có phụ thuộc thứ tự? | **Không** — cộng/trừ độc lập mỗi entry | Không |

Keno/Bingo18 **không có jackpot** (xác nhận: `financial-reporting-system.mdc` §11.2 — `jackpotContribution`
bị bỏ hoàn toàn khỏi report của 2 game này). Không có giá trị nào chảy từ kỳ T-1 sang kỳ T.

→ Guard là **ràng buộc vận hành** ("người xử lý kỳ cũ nhất trước"), **không** phải ràng buộc tài chính.

Max3D/Max3DPro cũng không có jackpot nhưng **chưa được phân tích và chưa có nhu cầu** (tần suất thấp)
→ ngoài scope, giữ nguyên guard.

## 3. Thay đổi code

### 3.1 Xoá 4 block guard

Xoá nguyên block (comment + call + throw). Với `trigger-settle.ts` (Keno, dòng 50-60):

```typescript
// ── XOÁ TOÀN BỘ khối này ──
    // Guard thứ tự kết sổ: phải settle TUẦN TỰ theo thời gian. ...
    const unfinishedPrior = await this.drawRepo.findUnfinishedDrawBefore(input.drawId);
    if (unfinishedPrior) {
      throw new AppException("DRAW_SETTLE_ORDER", `...`);
    }
```

**Xoá cả comment** — theo `code-quality-standards.mdc` §4, comment chỉ được xoá khi code nó mô tả bị
xoá hoàn toàn. Đây đúng là trường hợp đó.

### 3.2 Cập nhật JSDoc class — BẮT BUỘC, không được bỏ

JSDoc của `TriggerSettleUseCase` hiện mô tả flow 4 bước và **không** nhắc guard thứ tự, nhưng JSDoc
của `VoidDrawUseCase` cần đọc lại kỹ. Quan trọng hơn: phải **thêm** ghi chú giải thích vì sao game này
KHÔNG có guard thứ tự, để người sau không "sửa lại cho giống 5 game kia":

```typescript
/**
 * Kết sổ kỳ quay Keno (settle lần đầu).
 *
 * ...
 *
 * KHÔNG có guard thứ tự kỳ (khác Lotto535/Mega645/Power655): Keno không có jackpot
 * rollover nên giá trị kỳ T không phụ thuộc kỳ T-1 — prize table cố định, payout cap
 * tính theo từng kỳ, rollup daily re-aggregate toàn bộ theo financialDate. Nhiều kỳ
 * settle SONG SONG là hợp lệ và cần thiết (~119 kỳ/ngày với drawIntervalMinutes = 8;
 * 1 kỳ tắc từng làm 112 kỳ sau đó không settle được). Chống double-trigger vẫn đủ 3
 * lớp: CAS status published→settling, deterministic SFN execution name, và settledAt
 * high-water mark.
 */
```

Bingo18 tương tự, đổi thành `~158 kỳ/ngày với drawIntervalMinutes = 6`.

### 3.3 `findUnfinishedDrawBefore` — GIỮ LẠI, không xoá

Method vẫn còn ở repo Keno (`draw-repo.ts:316`) và Bingo18 (`:304`) nhưng sẽ **không còn caller**.

**Quyết định: giữ.** Lý do:
- p1-01 sẽ dùng lại đúng khái niệm này cho KPI "kỳ backlog cũ nhất" trên Hub — cụ thể là ngưỡng
  `pendingCloseStuckSec` / `awaitingSettleStuckSec` cần biết kỳ cũ nhất còn dở
  (`ops-hub-page-layout.guideline.md` §8.3).
- Xoá rồi thêm lại trong cùng feature = diff nhiễu.
- Index `idx_status_drawId_desc` phục vụ nó **vẫn cần** cho `getUnfinishedDraws` (dùng chung, xem mô
  tả index ở `packages/game-bingo18/src/indexes/index.ts:168`).

**Bắt buộc:** thêm JSDoc ghi rõ hiện không có caller trong settle/void flow, để không ai nghĩ guard
vẫn còn hiệu lực:

```typescript
  /**
   * Tìm kỳ chưa hoàn thành có drawId nhỏ hơn `drawId` (kỳ cũ hơn còn dở).
   *
   * KHÔNG còn dùng làm guard chặn settle/void (đã bỏ — xem JSDoc TriggerSettleUseCase).
   * Giữ lại cho Ops Hub: xác định kỳ backlog cũ nhất để cảnh báo tồn đọng.
   */
```

### 3.4 Frontend — xử lý error code không còn phát sinh

Grep xác nhận khi lập plan: `DRAW_SETTLE_ORDER` / `DRAW_VOID_ORDER` **không xuất hiện** trong
`apps/backoffice/`. FE hiện hiển thị message từ server, không map theo code.

**Vẫn phải chạy lại trước khi sửa:**

```bash
rg -n 'DRAW_SETTLE_ORDER|DRAW_VOID_ORDER' apps packages
```

Sau khi xoá, 2 code này chỉ còn ở 5 game jackpot. Nếu FE có chỗ nào map code → giữ nguyên (vẫn đúng
cho 5 game kia), **không xoá**.

## 4. Tác động

| Vùng | Tác động |
|---|---|
| Keno + Bingo18 settle | Không còn chặn theo thứ tự. Nhiều kỳ settle song song được |
| Keno + Bingo18 void | Tương tự |
| 5 game còn lại | **Không đổi** — `git diff` không được chạm |
| Rollup daily | Số luồng ghi đồng thời tăng → **đây là lý do p0-01 phải xong trước**. p0-01 bản mới dùng **CAS `$eq` trên `version`** (không phải `Date.now()`): thua CAS thì re-aggregate, nên nhiều luồng song song vẫn ra số đúng |
| SFN / worker | Không đổi. Mỗi kỳ vẫn 1 execution riêng, tên deterministic |
| Ví người chơi | Không đổi |
| Mô hình vận hành theo batch | Bỏ guard là **điều kiện cần** cho batch chốt sổ 1 giờ (xem `ops-hub-page-layout.guideline.md` §0.1): batch chạm hàng chục kỳ cùng lúc, guard tuần tự làm batch vô nghĩa |

### Chống double-trigger sau khi bỏ guard — vẫn còn 3 lớp

Bỏ guard **không** làm yếu chống trùng. Kiểm chứng từng lớp trong code hiện tại:

1. **`settledAt` high-water mark** (`trigger-settle.ts:46-48`) — kỳ đã settle không đi lại luồng này.
2. **CAS status** — `drawRepo.triggerSettle(drawId)` (dòng 74) là `findOneAndUpdate` với điều kiện
   `status: Published`; 2 request đồng thời cho **cùng 1 kỳ** thì đúng 1 thắng, cái kia nhận
   `DRAW_INVALID_TRANSITION`.
3. **Deterministic SFN execution name** — `toExecutionName(drawId)` (dòng 93); lần start thứ hai nhận
   `ExecutionAlreadyExists` và được coi là thành công idempotent (dòng 99-104).

Ba lớp này bảo vệ **cùng một kỳ bị bấm 2 lần**. Guard vừa xoá bảo vệ **thứ tự giữa các kỳ khác nhau** —
việc mà không có ràng buộc tài chính nào đòi hỏi ở 2 game này.

## 5. Test

### 5.1 Unit

`packages/game-keno-application/test/trigger-settle.test.ts` (+ bản Bingo18)

| Case | Kỳ vọng |
|---|---|
| Settle kỳ T khi T-1 còn `Published` | **Thành công** (trước đây throw `DRAW_SETTLE_ORDER`) |
| Settle kỳ T khi T-1 đang `Settling` | **Thành công** |
| Settle kỳ T khi T-1 đang `Voiding` | **Thành công** |
| Settle kỳ chưa có `result` | Vẫn throw — guard này KHÔNG bị bỏ |
| Settle kỳ đã có `settledAt` | Vẫn throw `DRAW_ALREADY_SETTLED` |
| Settle kỳ ở `Scheduled` | Vẫn throw `DRAW_INVALID_TRANSITION` |
| Void kỳ T khi T-1 còn dở | **Thành công** |
| Void kỳ đã settle | Vẫn throw `DRAW_INVALID_TRANSITION` |

Bốn case "vẫn throw" quan trọng ngang các case "thành công" — chứng minh chỉ bỏ **đúng 1** guard.

### 5.2 Regression 5 game jackpot (bắt buộc)

```bash
rg -n 'DRAW_SETTLE_ORDER' packages/game-lotto535-application packages/game-mega645-application \
  packages/game-power655-application packages/game-max3d-application packages/game-max3dpro-application
```

Phải còn đủ 5 match. Chạy test suite của 5 game này, phải xanh không đổi.

### 5.3 Integration trên staging

1. Tạo tình huống backlog: publish 5 kỳ Keno liên tiếp, **không** settle kỳ đầu.
2. Settle kỳ thứ 3 → phải thành công.
3. Settle 3 kỳ còn lại **đồng thời** → cả 3 thành công.
4. Verify rollup bằng mongosh (§6.3 của [p0-01](./p0-01-daily-rollup-race-fix.plan.md)) — số phải khớp
   chính xác, **và** mọi doc tenant của lô có cùng `rollupVersion`.
5. Bấm settle **cùng 1 kỳ** 2 lần liên tiếp → lần 2 nhận `DRAW_INVALID_TRANSITION` hoặc idempotent
   success, **không** tạo 2 execution.

## 6. Review checklist

- [ ] Đúng **4 block** bị xoá, không nhiều hơn. `git diff --stat` chỉ chạm 2 package.
- [ ] `git diff` **không** chạm `game-lotto535-*`, `game-mega645-*`, `game-power655-*`,
      `game-max3d-*`, `game-max3dpro-*`.
- [ ] JSDoc class của cả 4 use-case đã cập nhật, có giải thích **vì sao** không cần guard.
- [ ] `findUnfinishedDrawBefore` giữ lại + JSDoc ghi rõ không còn caller trong settle/void.
- [ ] 3 lớp chống double-trigger còn nguyên (đọc lại code, không đoán).
- [ ] `pnpm check-types` + `pnpm lint` xanh.
- [ ] Grep `DRAW_SETTLE_ORDER|DRAW_VOID_ORDER` — còn đúng 5 game jackpot.
- [ ] **p0-01 đã merge và verify trên staging** trước khi merge PR này.

## 7. Rủi ro

| Rủi ro | Mức | Xử lý |
|---|---|---|
| Merge trước p0-01 → rollup sai ở tốc độ cao | 🔴 | **Chặn cứng ở review.** Ghi rõ trong PR description: "phụ thuộc p0-01 #<số>" |
| Vô tình xoá guard ở game jackpot | 🔴 | Checklist `git diff` + grep 5 match |
| Xoá lẫn guard khác (`settledAt`, status) | 🟡 | Test §5.1 có 4 case "vẫn throw" |
| Staff quen thứ tự cũ, bối rối | 🟢 | Hub (p1) hiển thị rõ kỳ backlog; không cần đào tạo lại |
| Load worker tăng đột biến khi settle backlog lớn | 🟡 | p0-04 cap concurrency = 5. **Không** bulk-settle 100 kỳ một lần trước khi có cap |
| Hardcode chu kỳ kỳ quay khi viết JSDoc/test | 🟢 | Đọc `drawIntervalMinutes` từ `DEFAULT_PLAY_CONFIG`; JSDoc ghi kèm tên field, không chỉ ghi con số |

## 8. Rollback

Revert commit. Guard quay lại ngay, không có state nào cần dọn. Kỳ đã settle song song vẫn đúng số —
guard chỉ chặn **hành động mới**, không ảnh hưởng dữ liệu đã ghi.