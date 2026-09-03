/**
 * Glue wiring test — resultfeed-worker fetch-vietlott-keno (mock use-case, KHÔNG chạm DB).
 *
 * Worker chỉ là glue: `new FetchAndParseUseCase({...})` + `handler = () => useCase.run()`.
 * Mock use-case để verify handler delegate đúng và trả kết quả use-case, không kết nối
 * DB/provider thật. Logic nghiệp vụ đã test ở resultfeed-application.
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

const { handler } = await import("../../../src/handlers/fetch/vietlott-keno");

describe("resultfeed-worker fetch-vietlott-keno handler", () => {
  it("delegate tới useCase.run và trả kết quả", async () => {
    const res = await handler();

    expect(runMock).toHaveBeenCalledWith();
    expect(res).toEqual({ status: "not_due" });
  });
});
