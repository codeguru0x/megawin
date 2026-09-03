/**
 * Glue wiring test — resultfeed-worker fetch-vietlott-bingo18 (mock use-case, KHÔNG chạm DB).
 * Xem JSDoc `vietlott-keno.test.ts` cho lý giải chi tiết.
 */

import { describe, expect, it, vi } from "vitest";

const runMock = vi.fn().mockResolvedValue({ status: "not_due" });

vi.mock("@megawin/resultfeed-application/use-cases/fetch", () => ({
  FetchAndParseUseCase: class {
    run = runMock;
  },
}));

vi.mock("@megawin/resultfeed-application/sources", () => ({
  vietlottDetailAdapter: { sourceId: "vietlott-detail" },
}));

const { handler } = await import("../../../src/handlers/fetch/vietlott-bingo18");

describe("resultfeed-worker fetch-vietlott-bingo18 handler", () => {
  it("delegate tới useCase.run và trả kết quả", async () => {
    const res = await handler();

    expect(runMock).toHaveBeenCalledWith();
    expect(res).toEqual({ status: "not_due" });
  });
});
