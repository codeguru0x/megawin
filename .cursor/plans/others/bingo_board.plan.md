---
name: Dynamic board panels
overview: Cho phép player cược tối thiểu 1 board và tối đa theo game config (maxBasicBoardsPerTicket) thay vì giới hạn cứng số panel. boardNo A..Z, AA, AB... sinh tự động theo số board gửi lên. Zod chỉ chặn hard cap; giới hạn động theo config kiểm ở use-case. Làm bingo18 hoàn chỉnh (validation, hiển thị màu, SDK docs, rule) làm mẫu cho 6 game còn lại.
todos:
  - id: helper
    content: Tạo packages/shared/src/utils/alpha-label.ts (numberToAlphaLabel base-1 + alphaLabelToNumber + alphaLabelSequence), export qua utils/index.ts, kèm comment giải thích rõ
    status: completed
  - id: refine
    content: Thêm boardsSequentialRefine() vào apps/api-player/src/lib/schemas.ts dùng alphaLabelSequence (giữ boardsOrderRefine cũ cho 6 game chưa migrate)
    status: completed
  - id: handler
    content: "Sửa handler bingo18 place-bet: boardNo z.string(), max BINGO18_MAX_BOARDS (hard cap), dùng boardsSequentialRefine, cập nhật JSDoc header"
    status: completed
  - id: usecase
    content: Use-case bingo18 place-bet — làm rõ check maxBasicBoardsPerTicket (config động) là nguồn giới hạn thật, cập nhật comment min 1 / max theo config
    status: completed
  - id: board-color
    content: Tạo helper màu board động (backoffice) map boardNo -> palette tuần hoàn theo alphaLabelToNumber, thay BOARD_COLORS cứng trong entry-detail-dialog bingo18
    status: completed
  - id: sdk-docs
    content: Cập nhật JSDoc Bingo18BoardInput trong player-sdk (boardNo động, bỏ "tối đa 6"), ghi CHANGELOG player-sdk
    status: completed
  - id: rule-docs
    content: Cập nhật .cursor/rules/bingo18-game-rules.mdc các chỗ "A-F / tối đa 6 boards / 6 panels" thành board động theo config
    status: completed
  - id: verify
    content: check-types shared + api-player + backoffice, unit test alpha-label, verify thủ công >6 boards
    status: completed
  - id: shared-const
    content: Đưa hard cap BINGO18_MAX_BOARDS (=100) vào @megawin/game-bingo18/rules; handler place-bet import dùng chung; ràng buộc maxBasicBoardsPerTicket ≤ hard cap ở schema update config (backoffice API + form) + cập nhật rule
    status: completed
isProject: false
---

# Cho phép board động (A..Z, AA..) theo game config — bingo18 làm mẫu

## Bối cảnh (kết quả nghiên cứu)

- `boardNo` là **`string` tự do** xuyên suốt: player-sdk ([bingo18/types.ts:38](packages/player-sdk/src/bingo18/types.ts)), DB ticket/entry ([ticket.ts:97](packages/game-bingo18/src/entities/ticket.ts)), mapper, settle, feed, DTO. Ràng buộc cứng "A..F" **chỉ tồn tại ở Zod handler place-bet**.
- Handler bingo18 giới hạn qua `z.enum(BINGO18_BOARD_NO)` + `.max(6)` + `boardsOrderRefine(BINGO18_BOARD_NO)` ([place-bet.ts:55-152](apps/api-player/src/handlers/bingo18/place-bet.ts)).
- Use-case **đã** re-check `boardInputs.length > play.maxBasicBoardsPerTicket` ([place-bet.ts:69-71](packages/game-bingo18-application/src/use-cases/place-bet/place-bet.ts)) — đây là giới hạn động thật theo config.
- `boardsOrderRefine` ép `boards[i].boardNo === validBoardNos[i]` với mảng cố định ([schemas.ts:60-64](apps/api-player/src/lib/schemas.ts)).
- Backoffice hiển thị boardNo trực tiếp; màu board dùng `BOARD_COLORS` cứng chỉ có A-F + fallback `?? BOARD_COLORS.A`. CSS vars `--board-a..f` định nghĩa ở [globals.css:156-163, 227-234](apps/backoffice/src/app/globals.css) (6 màu, có dark mode). Bingo18 chỉ dùng `BOARD_COLORS` tại 1 file: [entry-detail-dialog.tsx:44-51](apps/backoffice/src/app/(main)/games/bingo18/reports/settle/_lib/sections/entry-detail-dialog.tsx).

**Nguyên tắc chốt (từ trao đổi):**
1. **Zod chỉ check hard cap** (số cố định trong code, chống abuse). **Giới hạn động theo config kiểm ở use-case.**
2. Helper sinh label chữ cái đặt ở shared, **tên tổng quát** (không gắn "board") vì có thể tái dùng để đánh thứ tự chữ cái ở package khác. **Base nhập vào ghi rõ.**
3. Số board động -> **màu board phải deterministic cho mọi boardNo** (kể cả G, H, AA...), không hardcode A-F.
4. Làm **trọn vẹn bingo18** (validation + hiển thị + SDK docs + rule) rồi mới nhân ra game khác.

Kết luận: không đụng DB/mapper/settle/feed/DTO (boardNo vẫn string). Chỉ đổi validation handler, hiển thị màu, và tài liệu.

## Giải pháp

### 1. Helper chữ cái dùng chung — `packages/shared/src/utils/alpha-label.ts` (mới)

Tên tổng quát `numberToAlphaLabel` (không gắn "board"), **base-1** để khớp trực giác "phần tử thứ 1 = A". Có hàm ngược + sinh sequence. Export qua barrel [utils/index.ts](packages/shared/src/utils/index.ts).

```ts
/**
 * Chuyển một số thứ tự (base-1) thành nhãn chữ cái kiểu bảng tính:
 * `1 -> "A"`, `2 -> "B"`, ..., `26 -> "Z"`, `27 -> "AA"`, `28 -> "AB"`, `703 -> "AAA"`.
 *
 * "base-1" nghĩa là ĐẦU VÀO BẮT ĐẦU TỪ 1 (phần tử thứ nhất = "A"), KHÔNG phải 0.
 * Dùng cho: đánh số board (A, B, C...), hoặc bất kỳ nơi cần thứ tự chữ cái từ số.
 *
 * @param ordinal Số thứ tự, bắt đầu từ 1. Ném RangeError nếu < 1.
 * @returns Nhãn chữ cái in hoa.
 */
export function numberToAlphaLabel(ordinal: number): string {
  if (!Number.isInteger(ordinal) || ordinal < 1) {
    throw new RangeError(`ordinal phải là số nguyên >= 1, nhận: ${ordinal}`);
  }
  let label = "";
  // Hệ đếm "bijective base-26": mỗi vòng lấy 1 chữ cái từ phải sang trái.
  // Trừ 1 để đưa về dải 0..25 rồi cộng 65 (mã ASCII của 'A') ra ký tự.
  // Sau đó chia 26 để xử lý chữ cái hàng cao hơn (AA, AB...).
  let remaining = ordinal;
  while (remaining > 0) {
    const zeroBased = (remaining - 1) % 26; // 0..25
    const letter = String.fromCharCode(65 + zeroBased); // 'A'..'Z'
    label = letter + label;
    remaining = Math.floor((remaining - 1) / 26);
  }
  return label;
}

/**
 * Hàm ngược của {@link numberToAlphaLabel}: `"A" -> 1`, `"Z" -> 26`, `"AA" -> 27`.
 * Trả về số thứ tự **base-1**. Ném RangeError nếu chuỗi rỗng hoặc có ký tự ngoài A-Z.
 */
export function alphaLabelToNumber(label: string): number {
  if (!/^[A-Z]+$/.test(label)) {
    throw new RangeError(`label phải là chuỗi A-Z in hoa, nhận: "${label}"`);
  }
  let ordinal = 0;
  for (const ch of label) {
    ordinal = ordinal * 26 + (ch.charCodeAt(0) - 64); // 'A' -> 1 (bijective)
  }
  return ordinal;
}

/**
 * Sinh chuỗi nhãn chữ cái liên tục độ dài `count`: `alphaLabelSequence(3) -> ["A","B","C"]`.
 * @param count Số lượng nhãn (>= 0).
 */
export function alphaLabelSequence(count: number): string[] {
  return Array.from({ length: count }, (_, i) => numberToAlphaLabel(i + 1));
}
```

Kèm unit test: `A, B, Z (26), AA (27), AB (28), AZ, BA, ZZ (702), AAA (703)`; round-trip `alphaLabelToNumber(numberToAlphaLabel(n)) === n`.

### 2. `boardsSequentialRefine()` — [apps/api-player/src/lib/schemas.ts](apps/api-player/src/lib/schemas.ts)

Biến thể mới, tự sinh sequence theo độ dài boards (không cần mảng cố định). Giữ `boardsOrderRefine` cũ để 6 game chưa migrate không vỡ.

```ts
import { alphaLabelSequence } from "@megawin/shared/utils";

/** Boards phải đúng thứ tự A, B, C... liên tục từ đầu (dynamic panels, không giới hạn danh sách cố định). */
export function boardsSequentialRefine(): (boards: Array<{ boardNo: string }>) => boolean {
  return (boards) => {
    const expected = alphaLabelSequence(boards.length);
    return boards.every((b, i) => b.boardNo === expected[i]);
  };
}
```

### 3. Handler bingo18 place-bet — [apps/api-player/src/handlers/bingo18/place-bet.ts](apps/api-player/src/handlers/bingo18/place-bet.ts)

Zod = hard cap only; config động do use-case lo.

- Xoá const `BINGO18_BOARD_NO` (A-F). **Không khai báo hard cap trong handler** — import từ config chung của game (xem mục 8):

```ts
import { BINGO18_MAX_BOARDS } from "@megawin/game-bingo18/rules";
```

- `baseBoardFields.boardNo`: `z.enum(BINGO18_BOARD_NO)` -> `z.string()`.
- `bingo18PlaceBetBodySchema.boards`: `.max(BINGO18_BOARD_NO.length)` -> `.max(BINGO18_MAX_BOARDS)`; `.refine(boardsOrderRefine(BINGO18_BOARD_NO), ...)` -> `.refine(boardsSequentialRefine(), ...)`.
- Cập nhật JSDoc header (dòng 26: `boardNo: "A"-"F" — tối đa 6 boards`) thành: `boardNo sinh động A, B, C...; số board tối đa theo game config, hard cap ${BINGO18_MAX_BOARDS} ở schema`.

### 4. Use-case bingo18 place-bet — [place-bet.ts:66-71](packages/game-bingo18-application/src/use-cases/place-bet/place-bet.ts)

Không đổi logic (check `> play.maxBasicBoardsPerTicket` đã đúng), làm rõ comment: boardNo động, min 1 (Zod), max = config; đây là **nơi duy nhất** enforce giới hạn động.

### 5. Màu board động — backoffice bingo18

Vấn đề: `BOARD_COLORS` cứng A-F, board động (G, AA...) mất màu. Giải pháp deterministic, tái dùng CSS vars sẵn có:

- Tạo helper dùng chung backoffice, ví dụ `apps/backoffice/src/lib/board-color.ts`:

```ts
import { alphaLabelToNumber } from "@megawin/shared/utils";

/** 6 CSS vars màu board đã định nghĩa trong globals.css (có dark-mode). */
const BOARD_COLOR_VARS = [
  "var(--board-a)",
  "var(--board-b)",
  "var(--board-c)",
  "var(--board-d)",
  "var(--board-e)",
  "var(--board-f)",
] as const;

/**
 * Màu ổn định cho 1 boardNo bất kỳ (A, B, ... Z, AA, ...).
 * Map theo thứ tự chữ cái rồi tuần hoàn qua 6 palette -> board thứ 7 (G) lại dùng màu A.
 * Deterministic: cùng boardNo luôn ra cùng màu. An toàn với boardNo lạ.
 */
export function boardColorVar(boardNo: string): string {
  let index: number;
  try {
    index = (alphaLabelToNumber(boardNo) - 1) % BOARD_COLOR_VARS.length;
  } catch {
    index = 0; // fallback cho boardNo không hợp lệ
  }
  return BOARD_COLOR_VARS[index];
}
```

- Sửa [entry-detail-dialog.tsx](apps/backoffice/src/app/(main)/games/bingo18/reports/settle/_lib/sections/entry-detail-dialog.tsx): xoá const `BOARD_COLORS` (dòng 44-51), thay mọi `BOARD_COLORS[x] ?? BOARD_COLORS.A` bằng `boardColorVar(x)`.
- (Cân nhắc mở rộng palette lên nhiều màu hơn trong globals.css nếu muốn tránh lặp màu sớm — ngoài scope bắt buộc; 6 màu tuần hoàn là đủ và nhất quán.)

### 6. Player SDK docs — [packages/player-sdk/src/bingo18/types.ts:33-38](packages/player-sdk/src/bingo18/types.ts)

Không đổi type (`boardNo: string` giữ nguyên -> không breaking). Cập nhật JSDoc `Bingo18BoardInput.boardNo`: bỏ "tối đa 6 boards / A-F", đổi thành mô tả động:

```
Ký hiệu board, sinh theo thứ tự chữ cái: "A", "B", "C", ... "Z", "AA", ...
Bắt đầu từ "A" và liên tục theo số board. Số board tối đa lấy từ game config
(maxBasicBoardsPerTicket). Không được trùng boardNo.
```

Ghi CHANGELOG player-sdk (`### Changed` — docs-only, PATCH) theo [player-sdk-jsdoc rule](.cursor/rules/player-sdk-jsdoc.mdc). Không bump version.

### 7. Rule bingo18 — [.cursor/rules/bingo18-game-rules.mdc](.cursor/rules/bingo18-game-rules.mdc)

Sửa các chỗ khẳng định số panel cố định thành board động theo config:
- Mục 2 "Giới hạn: Tối đa 6 boards (panels A-F)".
- Mục 8 bảng so sánh "Panels A-F (tối đa 6)".
- Mục 9.3 "boardNo: A-F — tối đa 6 boards".
- Mục 11.20 "6 panels: boardNo A-F".
Ghi rõ: boardNo sinh động (A, B... AA...), số tối đa = `maxBasicBoardsPerTicket`, Zod chỉ hard cap.

### 8. Hard cap chung `BINGO18_MAX_BOARDS` + ràng buộc config ≤ hard cap

Đưa hard cap ra config chung của game thay vì hằng số cục bộ trong handler → 1 nguồn sự thật, dùng được ở place-bet lẫn validate game config.

- **Define hằng số** trong [packages/game-bingo18/src/rules/financials.ts](packages/game-bingo18/src/rules/financials.ts) (cùng nơi `DEFAULT_BINGO18_CONFIG`), export qua barrel `@megawin/game-bingo18/rules`:

```ts
/**
 * Hard cap tuyệt đối số board mỗi vé — chống payload lạm dụng.
 * KHÔNG phải giới hạn nghiệp vụ (thật là play.maxBasicBoardsPerTicket, có thể nhỏ hơn).
 * Trần cứng ở: Zod place-bet + Zod update game config (maxBasicBoardsPerTicket ≤ trần này).
 */
export const BINGO18_MAX_BOARDS = 100;
```

- **Handler place-bet** import `BINGO18_MAX_BOARDS` từ `@megawin/game-bingo18/rules` (xem mục 3), không tự khai báo.
- **Backoffice config schema (server)** [apps/backoffice/src/app/api/bingo18/config/_lib/schema.ts](apps/backoffice/src/app/api/bingo18/config/_lib/schema.ts): `maxBasicBoardsPerTicket: positiveInt.max(BINGO18_MAX_BOARDS, ...)` → không cho cấu hình vượt trần API.
- **Backoffice config form (client)** [play-rules-section.tsx](apps/backoffice/src/app/(main)/games/bingo18/config/game/_lib/play-rules-section.tsx): thêm `.max(BINGO18_MAX_BOARDS, ...)` để hiển thị lỗi sớm. Hằng số là số nguyên thuần → an toàn cho client bundle.
- **Rule bingo18**: ghi rõ `maxBasicBoardsPerTicket` bị ràng ≤ `BINGO18_MAX_BOARDS` → luôn ≤ trần API.

## Kiểm thử

- `pnpm --filter @megawin/shared check-types` + unit test alpha-label (mục 1).
- `pnpm --filter @megawin/api-player check-types`, `pnpm --filter @megawin/backoffice check-types`.
- Verify thủ công place-bet: 7+ boards A..G hợp lệ (nếu config cho phép); sai thứ tự (A,C) reject bởi Zod; vượt `maxBasicBoardsPerTicket` reject bởi use-case; vượt 100 reject bởi Zod.
- Backoffice: mở entry-detail-dialog vé có >6 boards, xác nhận màu tuần hoàn ổn định, không lỗi.

## Nhân rộng 6 game còn lại (plan riêng, sau khi review bingo18)

Dựa trên plan này, áp cùng pattern cho keno, lotto535, mega645, power655, max3d, max3dpro:
- **Hard cap chung**: define `{GAME}_MAX_BOARDS` trong `packages/game-{game}/src/rules/financials.ts` (cùng nơi `DEFAULT_{GAME}_CONFIG`), export qua `@megawin/game-{game}/rules`.
- Handler: `z.enum(VALID_BOARD_NOS)` -> `z.string()`; `.max(VALID_BOARD_NOS.length)` -> `.max({GAME}_MAX_BOARDS)` (import từ rules, không khai báo cục bộ); `boardsOrderRefine(VALID_BOARD_NOS)` -> `boardsSequentialRefine()`.
- **Ràng buộc config**: `maxBasicBoardsPerTicket` (hoặc `maxBoardsPerTicket`) trong Zod update game config (backoffice API `_lib/schema.ts` + form `play-rules-section.tsx`) thêm `.max({GAME}_MAX_BOARDS)` → config không vượt trần API.
- Use-case: xác nhận có check `maxBoardsPerTicket`/`maxBasicBoardsPerTicket` (đã có ở hầu hết game — verify từng game).
- Backoffice: thay `BOARD_COLORS` cứng bằng `boardColorVar()` ở entry-detail-dialog + winning-entries-dialog từng game.
- SDK docs + rule từng game.
- Dọn `VALID_BOARD_NOS` khai báo trùng 2 nơi (mega645/power655/max3d ở entities + schemas).
- Lưu ý max3d/max3dpro có 2 board sub-schema (basic/plus, multiNumber/multiDigit) đều cần đổi `boardNo`.
