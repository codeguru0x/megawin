/**
 * Power 6/55 – Integration test: GetComboPopularityPlayerUseCase (p1-01, minh bạch chia jackpot)
 *
 * Test tích hợp thật với DB (không mock) — theo tiền lệ `get-ops-snapshot.test.ts`. Đi qua
 * ĐÚNG đường thật (entry-repo + combo-stats-repo → use-case) để bắt lỗi tích hợp giữa các
 * tầng, đặc biệt công thức `jackpotUnits` (3 nhánh standard/bao5/bao7-18 — xem JSDoc
 * `ComboStatsRepository.sumJackpotUnitsForStandardSet`).
 *
 * `GetComboPopularityPlayerUseCase extends UseCase` → `run()` trả **raw output**
 * (`PlayerComboPopularityOutput`), KHÔNG phải HTTP response — success envelope
 * (`{ success, data }` + `statusCode`) do middleware ở biên Lambda bọc, ngoài phạm vi test này.
 * Test dùng `safeRun()` để assert cả 2 nhánh bằng cùng 1 shape `AppResult`: nhánh lỗi trả
 * `{ success: false, error: { code } }` thay vì throw, nên case hợp lệ và case 400 viết đối xứng.
 *
 * ## Rủi ro test (R1/R2/R4 trong plan p1-01)
 *
 * - **R1** (oracle dò bộ số hệ thống): case 2 (combo tồn tại nhưng KHÔNG sở hữu) và case 3
 *   (combo không tồn tại) PHẢI trả response giống hệt nhau `{found:false}` — không phân biệt.
 * - **R2** (`jackpotUnits` sai công thức): case 1 seed đủ 3 nhánh (standard + bao5 ⊂ S +
 *   bao7 ⊇ S) VÀ 1 nhánh nhiễu (bao5 KHÔNG ⊂ S) để xác nhận nhánh nhiễu KHÔNG được cộng.
 * - **R4** (`sets/expandedLines` lệch khi gộp nhiều betCount): case 1 dùng betCount=2 cho
 *   combo standard chính — `sets` trả về phải phản ánh đúng, không lệch do chia dư.
 *
 * `drawId` giả lập rõ ràng không trùng draw thật (`9997-...`) để không đụng dữ liệu thật;
 * cleanup toàn bộ ở `afterAll`.
 */

import { EntryOutcome, EntryStatus } from "@megawin/game-core/entities";
import { PlayType } from "@megawin/game-power655/entities";
import { buildComboKey, getLineCount } from "@megawin/game-power655/rules";
import type { AppResult } from "@megawin/shared/errors";
import { ObjectId } from "mongodb";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { globalConfigCache } from "../../src/caches/global-config.cache";
import { ComboStatsRepository } from "../../src/infras/repos/combo-stats-repo";
import { EntryRepository } from "../../src/infras/repos/entry-repo";
import type { ComboStatsDelta } from "../../src/infras/repos/types";
import type { PlayerComboPopularityOutput } from "../../src/use-cases/player/dto/player.dto";
import { GetComboPopularityPlayerUseCase } from "../../src/use-cases/player/get-combo-popularity";
import { insertDefaultGlobalConfig } from "./helpers/seed-global-config";

const DRAW_ID = "9997-01-01.001";
const UNIT_PRICE = 10_000;

const entryRepo = new EntryRepository();
const comboRepo = new ComboStatsRepository();
const useCase = new GetComboPopularityPlayerUseCase();

/**
 * Chuẩn hoá `AppResult` của `safeRun()` về 1 shape phẳng cho tiện assert.
 *
 * Thay cho helper `unwrap(JSON.parse(body))` thời `ApiGatewayUseCase`: use-case giờ trả raw,
 * không còn `statusCode`/`body` để parse. Nhánh lỗi lấy `error.code` (vd `BAD_REQUEST`) —
 * chính là code mà middleware biên sẽ map sang HTTP 400.
 */
function unwrap(result: AppResult<PlayerComboPopularityOutput>): {
  success: boolean;
  data?: PlayerComboPopularityOutput;
  errorCode?: string;
} {
  return result.success ? { success: true, data: result.data } : { success: false, errorCode: result.error.code };
}

/** Seed 1 entry board — mặc định `Scheduled` (chưa settle), KHÔNG void. */
async function seedEntryBoard(params: {
  accountId: string;
  drawId?: string;
  status?: (typeof EntryStatus)[keyof typeof EntryStatus];
  playType: PlayType;
  mainNumbers: string[];
  betCount?: number;
}): Promise<void> {
  const { accountId, drawId = DRAW_ID, status = EntryStatus.Scheduled, playType, mainNumbers, betCount = 1 } = params;
  const expandedLines = getLineCount(playType);

  await entryRepo.insertEntries([
    {
      tenantId: "tenantTest",
      accountId,
      username: `user-${accountId}`,
      ticketId: new ObjectId().toHexString(),
      drawId,
      financialDate: "2026-08-09",
      tenant: { commissionRate: 0.2, commissionAmount: 0 },
      status,
      outcome: status === EntryStatus.Void ? EntryOutcome.Void : undefined,
      lineCount: expandedLines * betCount,
      betUnitCount: expandedLines * betCount,
      amount: expandedLines * betCount * UNIT_PRICE,
      unitPrice: UNIT_PRICE,
      entrySummary: {
        ticketNo: `P655-TEST-${accountId}`,
        boards: [
          {
            boardNo: "A",
            playType,
            mainNumbers,
            expandedLines,
            betCount,
          },
        ],
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ]);
}

/** Seed 1 combo-stats doc bằng delta thật (đi qua `bulkUpsertDelta` — không ghi thẳng). */
async function seedCombo(params: { playType: PlayType; mainNumbers: string[]; betCount: number; drawId?: string }) {
  const { playType, mainNumbers, betCount, drawId = DRAW_ID } = params;
  const comboKey = buildComboKey(playType, mainNumbers);
  const sets = getLineCount(playType) * betCount;
  const delta: ComboStatsDelta = {
    comboKey,
    drawId,
    playType,
    mainNumbers: [...mainNumbers].sort(),
    sets,
    amount: sets * UNIT_PRICE,
    accounts: new Map(),
  };
  await comboRepo.bulkUpsertDelta([delta], new ObjectId().toHexString());
}

async function cleanup(): Promise<void> {
  await entryRepo.deleteMany({ drawId: DRAW_ID });
  await comboRepo.deleteMany({ drawId: DRAW_ID });
}

beforeAll(async () => {
  await cleanup();
  await insertDefaultGlobalConfig();
  await globalConfigCache.invalidate();
});

afterAll(async () => {
  await cleanup();
});

describe("GetComboPopularityPlayerUseCase — case 1: bộ 6 số standard, jackpotUnits gộp đủ 3 nhánh", () => {
  const S = ["01", "05", "12", "23", "34", "45"];
  const accountId = "acc-case1";

  // Bao5 subset THẬT ⊂ S: bỏ số cuối "45" → 5 số còn lại.
  const bao5Subset = ["01", "05", "12", "23", "34"];
  // Bao5 KHÔNG ⊂ S (nhiễu) — thay "34" bằng "55" (không thuộc S).
  const bao5NotSubset = ["01", "05", "12", "23", "55"];
  // Bao7 superset ⊇ S: thêm 1 số ngoài S.
  const bao7Superset = [...S, "50"];

  beforeAll(async () => {
    // Account sở hữu board standard S — betCount=2 (R4: sets phải phản ánh đúng, không lệch).
    await seedEntryBoard({ accountId, playType: PlayType.Standard, mainNumbers: S, betCount: 2 });
    await seedCombo({ playType: PlayType.Standard, mainNumbers: S, betCount: 2 });

    // Nguồn 2: bao5 ⊂ S — account khác, betCount=1 → contribute 1 vào jackpotUnits.
    await seedCombo({ playType: PlayType.Bao5, mainNumbers: bao5Subset, betCount: 1 });

    // Nguồn 3: bao7 ⊇ S — account khác, betCount=1 → contribute 1 vào jackpotUnits.
    await seedCombo({ playType: PlayType.Bao7, mainNumbers: bao7Superset, betCount: 1 });

    // Nhiễu: bao5 KHÔNG ⊂ S — betCount=3, KHÔNG được cộng vào jackpotUnits.
    await seedCombo({ playType: PlayType.Bao5, mainNumbers: bao5NotSubset, betCount: 3 });
  });

  it("found=true, sets=2 (own combo), jackpotUnits=4 (2 standard + 1 bao5 + 1 bao7)", async () => {
    const res = unwrap(await useCase.safeRun({ accountId, drawId: DRAW_ID, numbers: S }));

    expect(res.success).toBe(true);
    expect(res.data).toEqual({
      found: true,
      sets: 2,
      jackpotUnits: 4,
    });
  });
});

describe("GetComboPopularityPlayerUseCase — case 2 vs 3: chống dò ẩn bộ số hệ thống (R1)", () => {
  const ownedNumbers = ["02", "03", "04", "05", "06", "07"];
  const playedByOthersNumbers = ["10", "11", "12", "13", "14", "15"];
  const neverPlayedNumbers = ["20", "21", "22", "23", "24", "25"];
  const accountId = "acc-case23";

  beforeAll(async () => {
    // Account CHỈ sở hữu 1 board (ownedNumbers) — dùng để đối chiếu response shape.
    await seedEntryBoard({ accountId, playType: PlayType.Standard, mainNumbers: ownedNumbers });
    // Combo "playedByOthersNumbers" CÓ tồn tại (người khác chơi) nhưng account KHÔNG sở hữu.
    await seedCombo({ playType: PlayType.Standard, mainNumbers: playedByOthersNumbers, betCount: 5 });
    // "neverPlayedNumbers" KHÔNG seed gì — combo không tồn tại.
  });

  it("case 2: combo tồn tại (người khác chơi) nhưng account chưa cược → {found:false}", async () => {
    const res = unwrap(await useCase.safeRun({ accountId, drawId: DRAW_ID, numbers: playedByOthersNumbers }));

    expect(res.success).toBe(true);
    expect(res.data).toEqual({ found: false });
  });

  it("case 3: combo không tồn tại → {found:false} — BYTE-GIỐNG case 2 (không phân biệt)", async () => {
    const res = unwrap(await useCase.safeRun({ accountId, drawId: DRAW_ID, numbers: neverPlayedNumbers }));

    expect(res.success).toBe(true);
    expect(res.data).toEqual({ found: false });
  });
});

describe("GetComboPopularityPlayerUseCase — case 4: board Bao9 — có sets, KHÔNG có jackpotUnits", () => {
  const bao9Numbers = ["01", "02", "03", "04", "05", "06", "07", "08", "09"];
  const accountId = "acc-case4";

  beforeAll(async () => {
    await seedEntryBoard({ accountId, playType: PlayType.Bao9, mainNumbers: bao9Numbers, betCount: 1 });
    await seedCombo({ playType: PlayType.Bao9, mainNumbers: bao9Numbers, betCount: 1 });
  });

  it("found=true, sets có giá trị, jackpotUnits undefined (board Bao không suy trước được mẫu số)", async () => {
    const res = unwrap(await useCase.safeRun({ accountId, drawId: DRAW_ID, numbers: bao9Numbers }));

    expect(res.success).toBe(true);
    expect(res.data?.found).toBe(true);
    expect(res.data?.sets).toBe(84); // C(9,6) = 84 lines × betCount 1.
    expect(res.data?.jackpotUnits).toBeUndefined();
  });
});

describe("GetComboPopularityPlayerUseCase — case 5: numbers không hợp lệ → 400, không lộ dữ liệu", () => {
  const accountId = "acc-case5";

  it("4 số (thiếu, không khớp playType nào) → 400 BAD_REQUEST", async () => {
    const res = unwrap(await useCase.safeRun({ accountId, drawId: DRAW_ID, numbers: ["01", "02", "03", "04"] }));

    expect(res.success).toBe(false);
    expect(res.errorCode).toBe("BAD_REQUEST");
  });

  it("16 số (giữa bao15 và bao18, không khớp playType nào) → 400 BAD_REQUEST", async () => {
    const numbers = Array.from({ length: 16 }, (_, i) => String(i + 1).padStart(2, "0"));
    const res = unwrap(await useCase.safeRun({ accountId, drawId: DRAW_ID, numbers }));

    expect(res.success).toBe(false);
    expect(res.errorCode).toBe("BAD_REQUEST");
  });

  it("6 số nhưng trùng nhau → 400 BAD_REQUEST", async () => {
    const res = unwrap(
      await useCase.safeRun({ accountId, drawId: DRAW_ID, numbers: ["01", "01", "03", "04", "05", "06"] }),
    );

    expect(res.success).toBe(false);
    expect(res.errorCode).toBe("BAD_REQUEST");
  });

  it('6 số nhưng có số ngoài "01".."55" → 400 BAD_REQUEST', async () => {
    const res = unwrap(
      await useCase.safeRun({ accountId, drawId: DRAW_ID, numbers: ["01", "02", "03", "04", "05", "56"] }),
    );

    expect(res.success).toBe(false);
    expect(res.errorCode).toBe("BAD_REQUEST");
  });
});

describe("GetComboPopularityPlayerUseCase — case 6: entry đã Void KHÔNG còn tính là sở hữu", () => {
  const voidedNumbers = ["30", "31", "32", "33", "34", "35"];
  const accountId = "acc-case6";

  beforeAll(async () => {
    await seedEntryBoard({
      accountId,
      playType: PlayType.Standard,
      mainNumbers: voidedNumbers,
      status: EntryStatus.Void,
    });
    // Combo vẫn có thể tồn tại (vd account khác cược) — nhưng account này KHÔNG sở hữu vì Void.
    await seedCombo({ playType: PlayType.Standard, mainNumbers: voidedNumbers, betCount: 1 });
  });

  it("board Void → {found:false} dù combo doc tồn tại", async () => {
    const res = unwrap(await useCase.safeRun({ accountId, drawId: DRAW_ID, numbers: voidedNumbers }));

    expect(res.success).toBe(true);
    expect(res.data).toEqual({ found: false });
  });
});

describe("GetComboPopularityPlayerUseCase — case 7: sở hữu nhưng combo-stats CHƯA kịp cập nhật (worker lag)", () => {
  const lagNumbers = ["40", "41", "42", "43", "44", "45"];
  const accountId = "acc-case7";

  beforeAll(async () => {
    // Account sở hữu board — nhưng KHÔNG seed combo doc (mô phỏng worker chưa chạy tick).
    await seedEntryBoard({ accountId, playType: PlayType.Standard, mainNumbers: lagNumbers });
  });

  it("sở hữu nhưng combo doc chưa có → {found:false}, KHÔNG throw", async () => {
    const res = unwrap(await useCase.safeRun({ accountId, drawId: DRAW_ID, numbers: lagNumbers }));

    expect(res.success).toBe(true);
    expect(res.data).toEqual({ found: false });
  });
});
