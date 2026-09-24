/**
 * p0-02 B1 — `deriveTx` PURE, không DB.
 *
 * Công thức là contract: cùng input luôn cùng `tx`. Vector #1 hard-code hex
 * để đổi namespace / thứ tự field / prefix version làm test đỏ.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { DebitPlayerService } from "../../src/services/debit-player-service";
import { DERIVE_TX_NAMESPACE, deriveTx } from "../../src/services/derive-tx";

/** Input cố định của vector #1 — không đổi nếu không đổi hex kỳ vọng. */
const VECTOR_ACCOUNT_ID = "acc-vector-fixed-001";
const VECTOR_KEY = "idem-key-vector-01";

/**
 * UUIDv5 của `v1|acc-vector-fixed-001|idem-key-vector-01`
 * với namespace {@link DERIVE_TX_NAMESPACE}.
 */
const VECTOR_TX = "893ea165-8ce9-5f1c-8ecd-1cef2f2314d7";

const UUID_V5 = /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("deriveTx — contract: cùng input → cùng tx", () => {
  // #1 — vector cố định. Đổi công thức = mọi key đã phát hành mất idempotent.
  it("vector cố định: input cụ thể → UUID hard-code", () => {
    expect(DERIVE_TX_NAMESPACE).toBe("8f3a2c1e-6b4d-4a91-9e07-2d5c8f1a3b6e");
    expect(deriveTx(VECTOR_ACCOUNT_ID, VECTOR_KEY)).toBe(VECTOR_TX);
  });

  // #2 — lẫn Date.now()/random sẽ làm set có nhiều phần tử.
  it("100 lần cùng input → đúng 1 tx", () => {
    const results = Array.from({ length: 100 }, () => deriveTx(VECTOR_ACCOUNT_ID, VECTOR_KEY));
    expect(new Set(results).size).toBe(1);
    expect(results[0]).toBe(VECTOR_TX);
  });

  // #3 — thiếu scope accountId thì player A replay được key của player B.
  it("accountId khác, key giống → tx khác", () => {
    const a = deriveTx("account-a", VECTOR_KEY);
    const b = deriveTx("account-b", VECTOR_KEY);
    expect(a).not.toBe(b);
  });

  // #4
  it("accountId giống, key khác → tx khác", () => {
    const a = deriveTx(VECTOR_ACCOUNT_ID, "idem-key-one");
    const b = deriveTx(VECTOR_ACCOUNT_ID, "idem-key-two");
    expect(a).not.toBe(b);
  });

  // #5 — tx ghi Mongo và gửi tenant; phải là UUID (36 ký tự), version 5.
  it("output là UUIDv5, dài 36", () => {
    const tx = deriveTx(VECTOR_ACCOUNT_ID, VECTOR_KEY);
    expect(tx).toMatch(UUID_V5);
    expect(tx).toHaveLength(36);
  });

  // #6 — header do client kiểm soát; ký tự lạ không được throw, vẫn cùng input → cùng tx.
  it("unicode / emoji / khoảng trắng không crash và vẫn cùng input → cùng tx", () => {
    const key = "key 🎲 tiếng Việt";
    const first = deriveTx(VECTOR_ACCOUNT_ID, key);
    const second = deriveTx(VECTOR_ACCOUNT_ID, key);
    expect(first).toBe(second);
    expect(first).toMatch(UUID_V5);
  });
});

describe("generateTx đã xoá — p0-02 B2 #23", () => {
  it("DebitPlayerService không còn method generateTx", () => {
    const svc = new DebitPlayerService();
    expect((svc as unknown as Record<string, unknown>).generateTx).toBeUndefined();
    expect(typeof svc.deriveTx).toBe("function");
  });

  // Smoke 7 game: chỗ sinh tx phải gọi deriveTx, không còn generateTx.
  it("cả 7 place-bet gọi deriveTx và không gọi generateTx", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const games = ["keno", "lotto535", "mega645", "power655", "max3d", "max3dpro", "bingo18"];

    for (const game of games) {
      const file = join(here, `../../../game-${game}-application/src/use-cases/place-bet/place-bet.ts`);
      const source = readFileSync(file, "utf8");
      expect(source, game).toContain("deriveTx(");
      expect(source, game).not.toContain("generateTx(");
    }
  });
});
