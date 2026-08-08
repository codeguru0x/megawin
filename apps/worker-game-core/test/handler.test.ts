/**
 * Glue wiring test — worker-game-core recover-tx-intents (mock, KHÔNG chạm DB).
 *
 * Handler news up `RecoverOrphanTxIntentsUseCase` + 7 ticket lookup services rồi
 * `handler = () => useCase.run()`. Mock toàn bộ để verify wiring, không DB.
 */

import { describe, expect, it, vi } from "vitest";

const runMock = vi.fn().mockResolvedValue({ recovered: 2 });

vi.mock("@megawin/game-core-application/use-cases", () => ({
  RecoverOrphanTxIntentsUseCase: class {
    run = runMock;
  },
}));

// 7 lookup service — stub rỗng, handler chỉ `new` chúng để build map checker.
vi.mock("@megawin/game-keno-application/services", () => ({ KenoTicketLookupService: class {} }));
vi.mock("@megawin/game-lotto535-application/services", () => ({
  Lotto535TicketLookupService: class {},
}));
vi.mock("@megawin/game-mega645-application/services", () => ({
  Mega645TicketLookupService: class {},
}));
vi.mock("@megawin/game-power655-application/services", () => ({
  Power655TicketLookupService: class {},
}));
vi.mock("@megawin/game-max3d-application/services", () => ({ Max3dTicketLookupService: class {} }));
vi.mock("@megawin/game-max3dpro-application/services", () => ({
  Max3dproTicketLookupService: class {},
}));
vi.mock("@megawin/game-bingo18-application/services", () => ({
  Bingo18TicketLookupService: class {},
}));

const { handler } = await import("../src/handlers/recovery/recover-tx-intents");

describe("worker-game-core recover-tx-intents handler", () => {
  it("delegate tới useCase.run và trả kết quả", async () => {
    const res = await handler();

    expect(runMock).toHaveBeenCalledOnce();
    expect(res).toEqual({ recovered: 2 });
  });
});
