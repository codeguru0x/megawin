# p2-04a — Extract `computeEntryPayout` thành hàm pure (refactor thuần)

> **Phase:** P2 · **Status:** ⏳ pending · **Phụ thuộc:** không · **Chặn:** `p2-04b`
> **Loại:** REFACTOR THUẦN — không thêm feature, không đổi hành vi, không đổi shape DB
> **Tạo 07/09/2026** sau khi chốt hướng "kết sổ thử" (dry-settle) ở nhánh riêng.

## 0. Vì sao plan này tồn tại và vì sao nó phải là PR RIÊNG

`p2-04b` (kết sổ thử) cần tính **chính xác** số tiền phải trả của một kỳ, bằng **đúng** công
thức mà settle thật dùng. Logic đó hiện **viết inline trong vòng lặp** của
`SettleEntriesBatchUseCase` (`settle-entries.ts:115-178`) — không có hàm nào bọc nó.

Chỉ có hai cách để `p2-04b` dùng lại:

| Cách | Hệ quả |
|---|---|
| **Copy sang nhánh preview** | **2 nguồn chân lý cho code tiền.** Sửa bảng giải hoặc thêm play type ở một bên, bên kia lệch âm thầm. Preview báo "an toàn" theo công thức cũ, settle thật trả theo công thức mới. **KHÔNG chấp nhận được.** |
| **Extract thành hàm pure dùng chung** | 1 nguồn chân lý. Đây là plan này. |

**Vì sao phải tách PR riêng:** đây là refactor trên **đường tiền đang chạy production**. Trộn nó
vào cùng PR với feature preview thì diff review lẫn lộn giữa "chỗ nào chỉ di chuyển code" và "chỗ
nào là logic mới" — đúng loại PR mà bug tài chính lọt qua. PR này phải review được bằng câu hỏi
duy nhất: *"có chỗ nào đổi hành vi không?"* Câu trả lời đúng phải là **không có chỗ nào**.

## 1. Vị trí hàm mới

**File:** `packages/game-keno/src/rules/entry-payout.ts` (package **domain**, pure, không I/O)

Đặt ở `game-keno/rules/` cùng chỗ `calculateCappedPrize`, `odds.ts` — không đặt ở
`game-keno-application` vì hàm này không được biết gì về DB. `game-keno-application` (settle) và
worker (preview) đều import xuống được; ngược lại thì không.

```typescript
/**
 * Tính payout cho MỘT entry từ boards + kết quả kỳ + bảng giải.
 *
 * PURE: không I/O, không đọc DB, không `Date.now()`, không random. Cùng input → cùng
 * output, mọi lần, mọi nơi. Đây là điều kiện để `SettleEntriesBatchUseCase` (ghi DB) và
 * kết sổ thử (không ghi DB) dùng CHUNG một công thức tiền.
 *
 * KHÔNG áp payout cap ở đây — cap cần biết TỔNG số bộ trúng toàn kỳ, không tính được ở
 * phạm vi 1 entry. Hàm này trả `cappableBoards` để caller tự cộng dồn rồi áp cap sau
 * (settle thật: `ApplyPayoutCapsUseCase`; kết sổ thử: `applyCapsToTally`, xem `p2-04b`).
 *
 * @param boards - `entry.entrySummary.boards`. Mảng rỗng → trả winAmount 0, boardPayouts rỗng.
 * @param result - Kết quả kỳ (20 số + bigCount/smallCount/evenCount/oddCount).
 * @param prizes - Bảng giải từ GameConfig. Thiếu bảng của 1 playType → giải 0 (an toàn, không throw).
 */
export function computeEntryPayout(
  boards: readonly EntryBoardForPayout[],
  result: DrawResultForPayout,
  prizes: EntryPayoutPrizeTables,
): EntryPayoutComputation;

/** Kết quả tính payout của 1 entry — chưa áp cap. */
export interface EntryPayoutComputation {
  /** Payout từng board, `winAmount` đã nhân `betCount`. Thứ tự giữ nguyên theo `boards` đầu vào. */
  boardPayouts: EntryBoardPayout[];
  /** Σ(boardPayouts[].winAmount) — trước cap. */
  winAmount: number;
  /** true khi có ≥1 board pickCount ∈ {8,9,10} và matchCount === pickCount. */
  hasCappablePrize: boolean;
  /**
   * Chi tiết board trúng trọn bậc cappable — để caller cộng dồn cho bước cap.
   *
   * `pickCount` là bậc (8/9/10), `betCount` là hệ số nhân của board đó.
   * Caller cộng: `boardCount[pickCount] += 1` và `betCountSum[pickCount] += betCount`.
   * Đếm **theo BOARD** (mỗi phần tử = 1 board), khớp `aggregateTopPrizeWinnerCounts`
   * (`entry-repo.ts:435-461` dùng `$sum: 1` sau `$unwind`) — xem §4.
   */
  cappableBoards: CappableBoardRef[];
}

/** Tham chiếu 1 board trúng trọn bậc 8/9/10, dùng cho bước áp cap. */
export interface CappableBoardRef {
  /** Bậc chơi: 8, 9, hoặc 10. */
  pickCount: number;
  /** Hệ số nhân của board (snapshot lúc đặt cược). */
  betCount: number;
}
```

### 1.1 Type đầu vào — tối thiểu hoá, KHÔNG nhận cả entity

Hàm nhận **structural type hẹp nhất đủ dùng**, không nhận `TicketEntryEntity`. Lý do: preview đọc
entry qua `getEntriesForStatsAfter` → nhận `EntryForStats` (projection mỏng), **không phải** entity
đầy đủ. Nếu signature đòi entity thì preview không gọi được, lại phải copy.

```typescript
/** Board tối thiểu cần cho tính payout — cả settle và preview đều thoả. */
export interface EntryBoardForPayout {
  boardNo: string;
  playType: KenoPlayType;
  /** Số đã chọn (basic play types). undefined với side bet. */
  numbers?: string[];
  /** Lựa chọn side bet (big/small/even/odd). undefined với basic. */
  bet?: string;
  /** Hệ số nhân. `undefined` → 1 (entries cũ trước khi có field này). */
  betCount?: number;
}

/** Kết quả kỳ ở dạng tối thiểu cần cho match. */
export interface DrawResultForPayout {
  winningNumbers: string[];
  bigCount: number;
  smallCount: number;
  evenCount: number;
  oddCount: number;
}

/** Ba bảng giải cần cho 12 play type của Keno. */
export interface EntryPayoutPrizeTables {
  basic: BasicPrizes;
  bigSmall: BigSmallPrizes;
  evenOdd: EvenOddPrizes;
}
```

> Dùng `BasicPrizes`/`BigSmallPrizes`/`EvenOddPrizes` **named type** từ `@megawin/game-keno/entities`
> — **không** viết `GameConfig["basicPrizes"]` (`code-quality-standards.mdc` §5.4 cấm indexed-access
> khi field đã có type riêng).

## 2. Nội dung hàm = di chuyển nguyên khối, không sửa gì

Khối được di chuyển: `settle-entries.ts:113-178` (từ `const boards = ...` đến hết vòng `for`), cộng
`winAmount = sumBy(...)` ở dòng 177.

**Giữ nguyên tuyệt đối 5 điểm dễ bị "dọn dẹp" nhầm:**

1. **`betCount ?? 1`** (dòng 117) — fallback cho entries cũ. Không đổi thành `betCount!`.
2. **Bridge bảng giải bậc động** (dòng 122-125):
   ```typescript
   const pickCount = board.numbers!.length;
   const prizeTable = playTypePrizes ? { [String(pickCount)]: playTypePrizes } : {};
   ```
   Trông lạ nhưng đúng: `lookupBasicPrize` tra theo `pickCount` runtime, không theo tên playType.
   Bảng rỗng → trả 0, **không throw**. Đây là hành vi an toàn có chủ đích, giữ y nguyên.
3. **`KENO_BASIC_PLAY_TYPE_SET.has(...)` rồi mới `else if` side bet** — thứ tự nhánh giữ nguyên.
   Play type lạ (không thuộc 3 nhánh) → **không push board nào**, im lặng bỏ qua. Giữ đúng vậy.
4. **`winAmount = matchResult.winAmount * betCount`** — nhân ở board level, cả 3 nhánh.
5. **Shape `EntryBoardPayout` khác nhau giữa basic và side bet** — basic có
   `matchCount`/`pickCount` số, side bet có `matchCount: null, pickCount: null` + `bet` + `outcome`.
   Không "hợp nhất cho gọn".

**KHÔNG di chuyển vào hàm** (giữ ở use-case, vì có I/O hoặc không thuần):

- `generateId()` cho `payoutTx` — sinh giá trị mới mỗi lần gọi ⇒ **phá tính pure**. Preview không
  cần `payoutTx`. Giữ ở `SettleEntriesBatchUseCase`.
- `settledAt: now` / `publishedAt: now` — thời gian. Giữ ở use-case.
- `outcome: hasWin ? Win : Loss` — 1 dòng, không thuộc phép tính tiền. Giữ ở use-case.

## 3. `SettleEntriesBatchUseCase` sau refactor

Vòng lặp thân co lại còn:

```typescript
for (const entry of entries) {
  const { boardPayouts, winAmount, hasCappablePrize } = computeEntryPayout(
    entry.entrySummary?.boards ?? [],
    result,
    { basic: config.basicPrizes, bigSmall: config.bigSmallPrizes, evenOdd: config.evenOddPrizes },
  );
  const hasWin = winAmount > 0;

  settleOps.push({
    entryId: entry.id,
    hasCappablePrize,
    payout: {
      winAmount,
      payoutAmount: winAmount,
      boardPayouts,
      settledAt: now,
      payoutTx: hasWin ? generateId() : undefined,
    } satisfies EntryPayout,
    outcome: hasWin ? EntryOutcome.Win : EntryOutcome.Loss,
    result: { /* … không đổi … */ } satisfies EntryResult,
  });
}
```

`cappableBoards` **không dùng** ở settle thật (nó đã có `aggregateTopPrizeWinnerCounts` đếm từ DB) —
chỉ preview dùng. Không sao: hàm trả thêm field, caller bỏ qua.

**JSDoc của use-case:** cập nhật đoạn "LƯU Ý VỀ PAYOUT CAPS" (dòng 19-27) để trỏ sang
`entry-payout.ts` cho phần công thức, giữ nguyên phần giải thích vì sao cap tách step riêng.
**KHÔNG xoá** comment nào — sửa cho khớp vị trí mới (`code-quality-standards.mdc` §4).

## 4. `winnerCount` — ghi rõ khác biệt, KHÔNG sửa ở PR này

Hai đường đếm "bộ trúng" đang **lệch nhau** trong code hiện tại:

| Đường | Cách đếm | Vị trí |
|---|---|---|
| Settle thật (áp cap) | `$sum: 1` sau `$unwind` → **đếm BOARD** | `entry-repo.ts:435-461` |
| Ops betting-stats | `capSets.pickN += board.betCount` → **đếm theo betCount** | `stats-accumulator.ts:200-208` |

Lệch khi có board `betCount > 1`. **Cách đúng cho tiền là đếm BOARD** — vì `calculateCappedPrize`
trả giải **per-unit**, rồi `apply-payout-caps.ts:169-176` mới nhân `betCount` lại cho từng board.
Nếu `winnerCount` đã gồm `betCount` thì tiền bị chia hai lần.

Nên: `cappableBoards` trả **1 phần tử / board**, và `p2-04b` đếm `boardCount += 1`.

**PR này KHÔNG sửa `stats-accumulator.ts`.** Đó là chỉ số cảnh báo (`capSetsNear`), không phải
đường tiền, và sửa nó sẽ đổi hành vi alert đang chạy — vi phạm "refactor thuần". Ghi vào backlog:

> **Backlog:** `stats-accumulator.ts:200-208` đếm `capSets` theo `betCount` còn settle đếm theo
> board ⇒ chỉ số `capSetsNear` cảnh báo sớm hơn thực tế khi có board `betCount > 1`. Không sai
> nguy hiểm (cảnh báo sớm ≠ bỏ sót) nhưng nên đồng bộ để 2 con số trong Hub UI không vênh nhau.

## 5. Test — bằng chứng "không đổi hành vi"

**File:** `packages/game-keno/src/rules/entry-payout.test.ts`

### 5.1 Test golden đối chiếu — quan trọng nhất

Trước khi sửa `settle-entries.ts`, snapshot output của code cũ thành fixture; sau khi sửa, assert
`computeEntryPayout` ra **bit-identical**.

| Case | Kỳ vọng |
|---|---|
| Entry 2 board basic (pick4 trúng 3, pick6 trúng 6) | `boardPayouts` 2 phần tử, `winAmount` = Σ, thứ tự giữ nguyên |
| Entry basic + bigSmall + evenOdd cùng lúc | 3 phần tử, đúng shape từng loại (`matchCount: null` với side bet) |
| Board `betCount = 5` trúng | `winAmount` = per-unit × 5 |
| Board `betCount = undefined` (entry cũ) | Coi như 1, không NaN |
| pick10 trúng 10/10 | `hasCappablePrize: true`, `cappableBoards` = `[{ pickCount: 10, betCount }]` |
| pick10 trúng 9/10 | `hasCappablePrize: false`, `cappableBoards` rỗng |
| pick7 trúng 7/7 | `hasCappablePrize: false` (7 ∉ `CAPPABLE_PICK_COUNTS`) |
| 2 board pick8 đều trúng 8/8 trong CÙNG entry | `cappableBoards` **2 phần tử** (không dedupe theo entry) |
| `config.basicPrizes.pick5` thiếu | `winAmount` = 0, **không throw** |
| `boards` rỗng / `entrySummary` undefined | `winAmount` 0, `boardPayouts` rỗng, `hasCappablePrize` false |
| playType lạ không thuộc 3 nhánh | Không push board, không throw |
| Board thua | `isWin: false`, `winAmount: 0`, vẫn có mặt trong `boardPayouts` |

### 5.2 Test tính pure

- Gọi 2 lần cùng input → deep-equal output (bắt lỗi nếu ai lỡ đưa `Date.now()`/`generateId()` vào).
- Gọi xong, `boards` đầu vào **không bị mutate** (assert deep-equal với bản clone trước khi gọi).

### 5.3 Regression settle-entries

`settle-entries.test.ts` hiện có **phải pass không sửa một dòng nào**. Nếu phải sửa test để pass →
refactor đã đổi hành vi → dừng, tìm nguyên nhân. Đây là tiêu chí chặn merge.

## 6. Checklist

- [ ] Snapshot fixture từ code CŨ trước khi sửa (§5.1) — làm trước mọi thứ khác
- [ ] Tạo `packages/game-keno/src/rules/entry-payout.ts`, export qua `rules/index.ts`
- [ ] Type đầu vào là structural hẹp, **không** nhận `TicketEntryEntity` (§1.1)
- [ ] Dùng named type `BasicPrizes`/`BigSmallPrizes`/`EvenOddPrizes`, không indexed-access
- [ ] Di chuyển nguyên khối, giữ đủ 5 điểm ở §2
- [ ] `generateId`/`now`/`outcome` **ở lại** use-case (giữ hàm pure)
- [ ] `settle-entries.ts` gọi hàm mới; JSDoc "LƯU Ý VỀ PAYOUT CAPS" cập nhật, không xoá
- [ ] `entry-payout.test.ts` phủ đủ 12 case §5.1 + 2 case §5.2
- [ ] `settle-entries.test.ts` pass **không sửa** (§5.3)
- [ ] Ghi backlog lệch `winnerCount` (§4), **không** sửa `stats-accumulator.ts` ở PR này
- [ ] `pnpm check-types` + `pnpm lint` sạch
- [ ] Diff review: xác nhận **không dòng nào đổi hành vi** — chỉ di chuyển + gọi hàm

## 7. Rủi ro

| Rủi ro | Mức | Giảm thiểu |
|---|---|---|
| "Dọn dẹp" nhầm khi di chuyển (bỏ `?? 1`, hợp nhất shape board, "sửa" bridge bảng giải trông lạ) | **Cao** | §2 liệt kê đủ 5 điểm; test golden §5.1 bắt được; review theo checklist |
| Đưa `generateId()`/`Date` vào hàm ⇒ mất tính pure ⇒ preview không tái lập được | Trung bình | Test gọi-2-lần §5.2 |
| Signature đòi entity đầy đủ ⇒ preview không gọi được ⇒ vẫn phải copy | Trung bình | §1.1 chốt structural type; `p2-04b` verify gọi được bằng `EntryForStats` |
| Ai đó nhân `betCount` vào `cappableBoards.length` ⇒ cap chia tiền 2 lần | **Cao** | §4 ghi rõ; JSDoc `cappableBoards` nói thẳng "đếm theo BOARD"; test case "2 board pick8 cùng entry" |
| Trộn PR này với feature ⇒ review lẫn lộn ⇒ bug tài chính lọt | **Cao** | Chặn: PR chỉ chứa refactor. Không thêm collection/config/worker nào. |

## 8. Bingo 18

Bingo 18 có `settle-entries.ts` riêng với logic khác (18 số, cách chơi khác). **Không** port plan
này sang Bingo 18 ở phase P2 — chỉ làm khi Bingo 18 thực sự cần preview (`p1-04` sẽ đánh giá).
Không tạo abstraction chung cho 2 game khi mới có 1 ca sử dụng.
