/**
 * Glue wiring test — worker-max3dpro (mock use-case, KHÔNG chạm DB).
 *
 * Worker chỉ là glue: `new UseCase()` + `handler = (e) => useCase.run(e)`.
 * Mock use-case để verify handler delegate đúng event và trả kết quả use-case,
 * không kết nối DB thật. Logic nghiệp vụ đã test ở game-max3dpro-application.
 */

import { describe, it, expect, vi } from "vitest";

const runMock = vi.fn().mockResolvedValue({ settledCount: 3 });

vi.mock("@megawin/game-max3dpro-application/use-cases/settle", () => ({
  SettleEntriesBatchUseCase: class {
    run = runMock;
  },
}));

const { handler } = await import("../src/handlers/settle/settle-entries");

describe("worker-max3dpro settle-entries handler", () => {
  it("delegate event tới useCase.run và trả kết quả", async () => {
    const event = { drawId: "2999-01-01.001" } as never;

    const res = await handler(event);

    expect(runMock).toHaveBeenCalledWith(event);
    expect(res).toEqual({ settledCount: 3 });
  });
});
