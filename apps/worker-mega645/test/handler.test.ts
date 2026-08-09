/**
 * Glue wiring test — worker-mega645 (mock use-case, KHÔNG chạm DB).
 *
 * Worker chỉ là glue: `new UseCase()` + `handler = (e) => useCase.run(e)`.
 * Mock use-case để verify handler delegate đúng event và trả kết quả use-case,
 * không kết nối DB thật. Logic nghiệp vụ đã test ở game-mega645-application.
 */

import { describe, expect, it, vi } from "vitest";

const runMock = vi.fn().mockResolvedValue({ settledCount: 3 });

vi.mock("@megawin/game-mega645-application/use-cases/settle", () => ({
  SettleEntriesBatchUseCase: class {
    run = runMock;
  },
}));

const { handler } = await import("../src/handlers/settle/settle-entries");

describe("worker-mega645 settle-entries handler", () => {
  it("delegate event tới useCase.run và trả kết quả", async () => {
    const event = { drawId: "2999-01-01.001" } as never;

    const res = await handler(event);

    expect(runMock).toHaveBeenCalledWith(event);
    expect(res).toEqual({ settledCount: 3 });
  });
});
