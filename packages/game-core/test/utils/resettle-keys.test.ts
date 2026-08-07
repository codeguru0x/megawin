/**
 * Game Core – Unit test: `buildResettleLockKey` + `buildResettleBatchKey`
 *
 * PURE — không DB, không cần quy tắc test staging chung.
 *
 * Trọng tâm: convention key `{game}:resettle:...` PHẢI đồng nhất giữa acquire
 * (BO API TriggerResettle) và release (worker FinalizeSettle) — sai lệch format
 * sẽ khiến lock không release đúng (chỉ được TTL release sau 5 phút).
 */

import { describe, it, expect } from "vitest";
import { buildResettleLockKey, buildResettleBatchKey } from "../../src/utils/resettle-keys";
import { GameProduct } from "../../src/entities";

describe("buildResettleLockKey", () => {
  it("Đúng logic — format {game}:resettle:{drawId}", () => {
    expect(buildResettleLockKey(GameProduct.Bingo18, "2026-03-07.001")).toBe(
      "bingo18:resettle:2026-03-07.001",
    );
  });

  it("Đúng logic — cùng game + drawId → luôn sinh ra CÙNG key (acquire/release phải khớp)", () => {
    const keyA = buildResettleLockKey(GameProduct.Keno, "2026-03-07.045");
    const keyB = buildResettleLockKey(GameProduct.Keno, "2026-03-07.045");
    expect(keyA).toBe(keyB);
  });

  it("Logic ngược — game khác nhau, cùng drawId → key khác nhau (không đụng lock giữa các game)", () => {
    const keyKeno = buildResettleLockKey(GameProduct.Keno, "2026-03-07.001");
    const keyLotto = buildResettleLockKey(GameProduct.Lotto535, "2026-03-07.001");
    expect(keyKeno).not.toBe(keyLotto);
  });
});

describe("buildResettleBatchKey", () => {
  it("Đúng logic — format {game}:resettle:{drawId}:{resettleId}:{kind}", () => {
    const key = buildResettleBatchKey(
      GameProduct.Keno,
      "2026-03-07.045",
      "01919b8f-abcd-7000-8000-000000000000",
      "reversal",
    );
    expect(key).toBe(
      "keno:resettle:2026-03-07.045:01919b8f-abcd-7000-8000-000000000000:reversal",
    );
  });

  it("Đúng logic — kind khác nhau (reversal vs payout) → batchKey khác nhau, tránh trộn batch", () => {
    const resettleId = "01919b8f-abcd-7000-8000-000000000000";
    const reversalKey = buildResettleBatchKey(
      GameProduct.Mega645,
      "2026-03-07.001",
      resettleId,
      "reversal",
    );
    const payoutKey = buildResettleBatchKey(
      GameProduct.Mega645,
      "2026-03-07.001",
      resettleId,
      "payout",
    );
    expect(reversalKey).not.toBe(payoutKey);
  });

  it("Logic ngược — resettleId khác nhau (2 phiên resettle cùng drawId) → batchKey khác nhau", () => {
    const keyA = buildResettleBatchKey(
      GameProduct.Power655,
      "2026-03-07.001",
      "resettle-session-1",
      "payout",
    );
    const keyB = buildResettleBatchKey(
      GameProduct.Power655,
      "2026-03-07.001",
      "resettle-session-2",
      "payout",
    );
    expect(keyA).not.toBe(keyB);
  });
});
