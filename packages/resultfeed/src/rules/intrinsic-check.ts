/**
 * ResultFeed – Intrinsic Check (rule layer, pure)
 *
 * Kiểm checksum nguồn TỰ công bố so với số nguồn cũng tự công bố (`numbersDisplay`).
 *
 * Đây là lớp verify MẠNH NHẤT có được từ 1 nguồn duy nhất: nếu parser đọc lệch
 * bảng/lệch cột thì số và checksum sẽ không còn khớp nhau. Chạy được cho Keno
 * (chẵn/lẻ/lớn/nhỏ) và Bingo18 (tổng + Lớn/Hòa/Nhỏ).
 *
 * Lotto535/Mega645/Power655/Max3d/Max3dpro KHÔNG có checksum nguồn tự công bố (nguồn
 * nạp lịch sử không kèm cờ kiểm chứng nào) — theo quyết định đã chốt, coi việc số ĐÚNG
 * HÌNH THỨC/MIỀN theo luật chơi chính là lớp verify duy nhất (tự nó đóng vai trò checksum):
 * đúng hình thức ⇒ `Passed`, sai hình thức (số lượng/miền/trùng lặp) ⇒ `Failed`. KHÁC với
 * Keno/Bingo18 — 2 game này CÓ khả năng nhận `NotAvailable` khi nguồn không kèm checksum
 * nào trong `claimed` (dù đã đúng hình thức) — 5 game format-only ở trên không có nhánh
 * `NotAvailable`, vì hình thức đã là điều kiện KẾT LUẬN được, không phải "không kết luận
 * được".
 *
 * ⚠️ Hằng số biên (Bingo18 Lớn ≥ 12…) tự khai báo ở đây, KHÔNG import từ
 * `@megawin/game-bingo18` hay `@megawin/game-keno`. Dùng chung hằng số với core thì khi
 * core sai, phép kiểm sai theo và không phát hiện được gì (00-overview.md §6).
 */

import { IntrinsicState, ResultFeedGameKey } from "../entities/enums";

// ─────────────────────────────────────────────
// Hằng số biên — TỰ KHAI BÁO, không import từ game-*
// ─────────────────────────────────────────────

const KENO_NUMBER_COUNT = 20;
const KENO_MIN = 1;
const KENO_MAX = 80;
/** 1-40 = nhỏ, 41-80 = lớn. */
const KENO_BIG_SMALL_BOUNDARY = 40;

const BINGO18_NUMBER_COUNT = 3;
const BINGO18_DICE_MIN = 1;
const BINGO18_DICE_MAX = 6;
/** Tổng 3-9 = nhỏ. */
const BINGO18_SMALL_MAX = 9;
/** Tổng 12-18 = lớn. Tổng 10-11 = hoà. */
const BINGO18_BIG_MIN = 12;

/** Tổng số phần tử `numbersDisplay` — 5 main + 1 đặc biệt (quy ước ở index cuối). */
const LOTTO535_TOTAL_COUNT = 6;
const LOTTO535_MAIN_COUNT = 5;
const LOTTO535_MAIN_MIN = 1;
const LOTTO535_MAIN_MAX = 35;
const LOTTO535_SPECIAL_MIN = 1;
const LOTTO535_SPECIAL_MAX = 12;

const MEGA645_NUMBER_COUNT = 6;
const MEGA645_MIN = 1;
const MEGA645_MAX = 45;

/** Tổng số phần tử `numbersDisplay` — 6 main + 1 bonus (quy ước ở index cuối). */
const POWER655_TOTAL_COUNT = 7;
const POWER655_MAIN_COUNT = 6;
const POWER655_MIN = 1;
const POWER655_MAX = 55;

const MAX3D_TRIPLET_MIN = 0;
const MAX3D_TRIPLET_MAX = 999;
/** Tổng số triplet — Đặc biệt 2 + Nhất 4 + Nhì 6 + Ba 8 = 20 (khớp `MAX3D_TIER_COUNTS` ở canonicalize.ts). */
const MAX3D_TOTAL_TRIPLET_COUNT = 20;

export interface IntrinsicCheckResult {
  state: IntrinsicState;
  /** Lý do lệch — text cho vận hành đọc. `null` khi `Passed`/`NotAvailable`. */
  mismatch: string | null;
}

function passed(): IntrinsicCheckResult {
  return { state: IntrinsicState.Passed, mismatch: null };
}

function failed(mismatch: string): IntrinsicCheckResult {
  return { state: IntrinsicState.Failed, mismatch };
}

function notAvailable(): IntrinsicCheckResult {
  return { state: IntrinsicState.NotAvailable, mismatch: null };
}

// ─────────────────────────────────────────────
// Keno
// ─────────────────────────────────────────────

/**
 * Keno: 20 số, miền `01`-`80` (zero-pad), KHÔNG trùng số. Checksum nguồn công bố:
 * `even`/`odd`/`big`/`small` (đếm số, không phải tổng).
 */
function checkKeno(numbersDisplay: string[], claimed: Record<string, string | number>): IntrinsicCheckResult {
  // ── 1. Hình thức ──────────────────────────────────────────────────────────
  if (numbersDisplay.length !== KENO_NUMBER_COUNT) {
    return failed(`Keno phải có ${KENO_NUMBER_COUNT} số, nhận được ${numbersDisplay.length}.`);
  }

  const seen = new Set<string>();
  const parsed: number[] = [];
  for (const raw of numbersDisplay) {
    const n = Number(raw);
    if (!Number.isInteger(n) || n < KENO_MIN || n > KENO_MAX) {
      return failed(`Số "${raw}" ngoài miền hợp lệ ${KENO_MIN}-${KENO_MAX}.`);
    }
    if (seen.has(raw)) {
      return failed(`Keno không được trùng số — "${raw}" xuất hiện ≥ 2 lần.`);
    }
    seen.add(raw);
    parsed.push(n);
  }

  // ── 2. Checksum nguồn công bố ─────────────────────────────────────────────
  const hasAnyChecksum = ["even", "odd", "big", "small"].some((k) => k in claimed);
  if (!hasAnyChecksum) {
    return notAvailable();
  }

  const evenCount = parsed.filter((n) => n % 2 === 0).length;
  const oddCount = parsed.length - evenCount;
  const smallCount = parsed.filter((n) => n <= KENO_BIG_SMALL_BOUNDARY).length;
  const bigCount = parsed.length - smallCount;

  const checks: Array<[key: string, actual: number]> = [
    ["even", evenCount],
    ["odd", oddCount],
    ["big", bigCount],
    ["small", smallCount],
  ];

  for (const [key, actual] of checks) {
    if (!(key in claimed)) {
      continue;
    }
    const claimedValue = Number(claimed[key]);
    if (claimedValue !== actual) {
      return failed(`Checksum "${key}" lệch: nguồn công bố ${claimed[key]}, tính lại từ số = ${actual}.`);
    }
  }

  return passed();
}

// ─────────────────────────────────────────────
// Bingo18
// ─────────────────────────────────────────────

/**
 * Bingo18: 3 số, miền `1`-`6`, ĐƯỢC TRÙNG (3 xúc xắc độc lập). Checksum nguồn công bố:
 * `sum` (tổng) + `bigSmallDraw` (phân loại `small`/`draw`/`big` theo biên nguồn công bố).
 */
function checkBingo18(numbersDisplay: string[], claimed: Record<string, string | number>): IntrinsicCheckResult {
  // ── 1. Hình thức ──────────────────────────────────────────────────────────
  if (numbersDisplay.length !== BINGO18_NUMBER_COUNT) {
    return failed(`Bingo18 phải có ${BINGO18_NUMBER_COUNT} số, nhận được ${numbersDisplay.length}.`);
  }

  const parsed: number[] = [];
  for (const raw of numbersDisplay) {
    const n = Number(raw);
    if (!Number.isInteger(n) || n < BINGO18_DICE_MIN || n > BINGO18_DICE_MAX) {
      return failed(`Số "${raw}" ngoài miền hợp lệ ${BINGO18_DICE_MIN}-${BINGO18_DICE_MAX}.`);
    }
    parsed.push(n);
  }

  const sum = parsed.reduce((s, n) => s + n, 0);

  const hasAnyChecksum = "sum" in claimed || "bigSmallDraw" in claimed;
  if (!hasAnyChecksum) {
    return notAvailable();
  }

  // ── 2. Checksum tổng ──────────────────────────────────────────────────────
  if ("sum" in claimed) {
    const claimedSum = Number(claimed.sum);
    if (claimedSum !== sum) {
      return failed(`Checksum "sum" lệch: nguồn công bố ${claimed.sum}, tính lại từ số = ${sum}.`);
    }
  }

  // ── 3. Kiểm config chéo — phân loại Lớn/Hòa/Nhỏ theo BIÊN NGUỒN công bố ────
  // Nguồn tự nói "đây là Lớn/Hòa/Nhỏ" — nếu biên ta tự khai (§ hằng số) không khớp
  // phân loại nguồn đưa ra, đó là dấu hiệu nguồn đã đổi luật, KHÔNG được im lặng bỏ qua.
  if ("bigSmallDraw" in claimed) {
    const claimedLabel = String(claimed.bigSmallDraw);
    const expectedLabel = sum <= BINGO18_SMALL_MAX ? "small" : sum >= BINGO18_BIG_MIN ? "big" : "draw";
    if (claimedLabel !== expectedLabel) {
      return failed(
        `Checksum "bigSmallDraw" lệch: nguồn công bố "${claimedLabel}", biên tự khai cho tổng ${sum} = "${expectedLabel}" — có thể nguồn đã đổi luật.`,
      );
    }
  }

  return passed();
}

// ─────────────────────────────────────────────
// Lotto 5/35 — format-only
// ─────────────────────────────────────────────

/**
 * Lotto 5/35: 5 số main miền `01`-`35` (KHÔNG trùng) + 1 số đặc biệt miền `01`-`12` (số
 * cuối cùng trong mảng, có thể trùng giá trị với main — 2 miền độc lập, xem
 * `parse-lotto535.ts`). Không có checksum tự công bố — đúng hình thức/miền chính là
 * điều kiện `Passed` duy nhất (xem JSDoc đầu file).
 */
function checkLotto535Format(numbersDisplay: string[]): IntrinsicCheckResult {
  if (numbersDisplay.length !== LOTTO535_TOTAL_COUNT) {
    return failed(
      `Lotto535 phải có ${LOTTO535_TOTAL_COUNT} số (5 main + 1 đặc biệt), nhận được ${numbersDisplay.length}.`,
    );
  }

  const mainNumbers = numbersDisplay.slice(0, LOTTO535_MAIN_COUNT);
  const specialNumber = numbersDisplay[LOTTO535_MAIN_COUNT];

  const seen = new Set<string>();
  for (const raw of mainNumbers) {
    const n = Number(raw);
    if (!Number.isInteger(n) || n < LOTTO535_MAIN_MIN || n > LOTTO535_MAIN_MAX) {
      return failed(`Số main "${raw}" ngoài miền hợp lệ ${LOTTO535_MAIN_MIN}-${LOTTO535_MAIN_MAX}.`);
    }
    if (seen.has(raw)) {
      return failed(`Lotto535 5 số main không được trùng nhau — "${raw}" xuất hiện ≥ 2 lần.`);
    }
    seen.add(raw);
  }

  const specialN = Number(specialNumber);
  if (!Number.isInteger(specialN) || specialN < LOTTO535_SPECIAL_MIN || specialN > LOTTO535_SPECIAL_MAX) {
    return failed(`Số đặc biệt "${specialNumber}" ngoài miền hợp lệ ${LOTTO535_SPECIAL_MIN}-${LOTTO535_SPECIAL_MAX}.`);
  }

  return passed();
}

// ─────────────────────────────────────────────
// Mega 6/45 — format-only
// ─────────────────────────────────────────────

/** Mega 6/45: 6 số miền `01`-`45`, KHÔNG trùng. Không có bonus/special number. */
function checkMega645Format(numbersDisplay: string[]): IntrinsicCheckResult {
  if (numbersDisplay.length !== MEGA645_NUMBER_COUNT) {
    return failed(`Mega645 phải có ${MEGA645_NUMBER_COUNT} số, nhận được ${numbersDisplay.length}.`);
  }

  const seen = new Set<string>();
  for (const raw of numbersDisplay) {
    const n = Number(raw);
    if (!Number.isInteger(n) || n < MEGA645_MIN || n > MEGA645_MAX) {
      return failed(`Số "${raw}" ngoài miền hợp lệ ${MEGA645_MIN}-${MEGA645_MAX}.`);
    }
    if (seen.has(raw)) {
      return failed(`Mega645 không được trùng số — "${raw}" xuất hiện ≥ 2 lần.`);
    }
    seen.add(raw);
  }

  return passed();
}

// ─────────────────────────────────────────────
// Power 6/55 — format-only
// ─────────────────────────────────────────────

/**
 * Power 6/55: 6 số main miền `01`-`55` (KHÔNG trùng) + 1 bonus miền `01`-`55` (số cuối
 * cùng trong mảng — quay từ 49 quả bóng còn lại nên KHÔNG được trùng bất kỳ số main nào,
 * khác Lotto535 nơi 2 miền độc lập).
 */
function checkPower655Format(numbersDisplay: string[]): IntrinsicCheckResult {
  if (numbersDisplay.length !== POWER655_TOTAL_COUNT) {
    return failed(
      `Power655 phải có ${POWER655_TOTAL_COUNT} số (6 main + 1 bonus), nhận được ${numbersDisplay.length}.`,
    );
  }

  const mainNumbers = numbersDisplay.slice(0, POWER655_MAIN_COUNT);
  const bonusNumber = numbersDisplay.at(POWER655_MAIN_COUNT);
  if (bonusNumber === undefined) {
    return failed(`Power655 thiếu số bonus (index ${POWER655_MAIN_COUNT}).`);
  }

  const seen = new Set<string>();
  for (const raw of mainNumbers) {
    const n = Number(raw);
    if (!Number.isInteger(n) || n < POWER655_MIN || n > POWER655_MAX) {
      return failed(`Số main "${raw}" ngoài miền hợp lệ ${POWER655_MIN}-${POWER655_MAX}.`);
    }
    if (seen.has(raw)) {
      return failed(`Power655 6 số main không được trùng nhau — "${raw}" xuất hiện ≥ 2 lần.`);
    }
    seen.add(raw);
  }

  const bonusN = Number(bonusNumber);
  if (!Number.isInteger(bonusN) || bonusN < POWER655_MIN || bonusN > POWER655_MAX) {
    return failed(`Bonus "${bonusNumber}" ngoài miền hợp lệ ${POWER655_MIN}-${POWER655_MAX}.`);
  }
  if (seen.has(bonusNumber)) {
    return failed(
      `Bonus "${bonusNumber}" trùng với 1 trong 6 số main — bonus quay từ 49 bóng còn lại, không được trùng.`,
    );
  }

  return passed();
}

// ─────────────────────────────────────────────
// Max3d / Max3dpro — format-only
// ─────────────────────────────────────────────

/**
 * Max3d/Max3dpro: 20 triplet `000`-`999` theo thứ tự CỐ ĐỊNH Đặc biệt(2) + Nhất(4) +
 * Nhì(6) + Ba(8), encode phẳng vào `numbersDisplay` (xem maintainer note ở
 * `parse-max3d.ts`). Triplet ĐƯỢC TRÙNG nhau (không phải số duy nhất như xổ số truyền
 * thống) — chỉ kiểm số lượng + miền, không kiểm trùng lặp.
 */
function checkMax3dFormat(numbersDisplay: string[]): IntrinsicCheckResult {
  if (numbersDisplay.length !== MAX3D_TOTAL_TRIPLET_COUNT) {
    return failed(`Max3d/Max3dpro phải có ${MAX3D_TOTAL_TRIPLET_COUNT} triplet, nhận được ${numbersDisplay.length}.`);
  }

  for (const raw of numbersDisplay) {
    if (raw.length !== 3 || !/^\d{3}$/.test(raw)) {
      return failed(`Triplet "${raw}" phải đúng 3 chữ số (zero-pad "000"-"999").`);
    }
    const n = Number(raw);
    if (!Number.isInteger(n) || n < MAX3D_TRIPLET_MIN || n > MAX3D_TRIPLET_MAX) {
      return failed(`Triplet "${raw}" ngoài miền hợp lệ ${MAX3D_TRIPLET_MIN}-${MAX3D_TRIPLET_MAX}.`);
    }
  }

  return passed();
}

/**
 * Dispatcher format-only cho 5 game KHÔNG có checksum tự công bố (Lotto535/Mega645/
 * Power655/Max3d/Max3dpro) — xem JSDoc đầu file. Luôn trả `Passed`/`Failed`, không có
 * nhánh `NotAvailable`.
 */
function checkFormatOnly(gameKey: ResultFeedGameKey, numbersDisplay: string[]): IntrinsicCheckResult {
  switch (gameKey) {
    case ResultFeedGameKey.Lotto535: {
      return checkLotto535Format(numbersDisplay);
    }
    case ResultFeedGameKey.Mega645: {
      return checkMega645Format(numbersDisplay);
    }
    case ResultFeedGameKey.Power655: {
      return checkPower655Format(numbersDisplay);
    }
    case ResultFeedGameKey.Max3d:
    case ResultFeedGameKey.Max3dpro: {
      return checkMax3dFormat(numbersDisplay);
    }
    default: {
      throw new Error(`checkFormatOnly: gameKey "${gameKey}" không thuộc nhóm format-only.`);
    }
  }
}

/**
 * Kiểm checksum nguồn TỰ công bố so với số nguồn cũng tự công bố (Keno/Bingo18), hoặc
 * kiểm format/miền theo luật chơi cho 5 game không có checksum (xem JSDoc đầu file).
 *
 * Keno/Bingo18 không công bố checksum nào ⇒ {@link IntrinsicState.NotAvailable}, KHÔNG
 * phải {@link IntrinsicState.Passed}. `NotAvailable` không được dùng làm cơ sở nâng độ
 * tin cậy. 5 game format-only không có nhánh `NotAvailable`.
 */
export function checkIntrinsic(
  gameKey: ResultFeedGameKey,
  numbersDisplay: string[],
  claimed: Record<string, string | number>,
): IntrinsicCheckResult {
  switch (gameKey) {
    case ResultFeedGameKey.Keno: {
      return checkKeno(numbersDisplay, claimed);
    }
    case ResultFeedGameKey.Bingo18: {
      return checkBingo18(numbersDisplay, claimed);
    }
    case ResultFeedGameKey.Lotto535:
    case ResultFeedGameKey.Mega645:
    case ResultFeedGameKey.Power655:
    case ResultFeedGameKey.Max3d:
    case ResultFeedGameKey.Max3dpro: {
      return checkFormatOnly(gameKey, numbersDisplay);
    }
    default: {
      const _exhaustive: never = gameKey;
      throw new Error(`Unknown gameKey: ${_exhaustive}`);
    }
  }
}
