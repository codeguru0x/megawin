/**
 * Glue wiring test — worker-tenant-dispatch main lane (mock, KHÔNG chạm DB).
 *
 * Handler: `useCase.run()` → nếu `isWorkerRunSkipped(result)` thì log skip, còn
 * lại log + trả result. Mock cả use-case lẫn helper để verify wiring, không DB.
 */

import { describe, it, expect, vi } from "vitest";

const runMock = vi.fn();

vi.mock("@megawin/worker-core/workers", () => ({
  isWorkerRunSkipped: (r: unknown) => (r as { skipped?: boolean })?.skipped === true,
}));

vi.mock("@megawin/tenant-dispatch/use-cases/process", () => ({
  ProcessMainDispatchBatchUseCase: class {
    run = runMock;
  },
}));

const { handler } = await import("../src/handlers/dispatch/process-batch");

describe("worker-tenant-dispatch process-batch handler", () => {
  it("trả result use-case khi không bị skip", async () => {
    runMock.mockResolvedValueOnce({ processed: 5 });
    expect(await handler()).toEqual({ processed: 5 });
  });

  it("trả nguyên result khi worker bị skip (locked)", async () => {
    const skipped = { skipped: true, reason: "locked" };
    runMock.mockResolvedValueOnce(skipped);
    expect(await handler()).toEqual(skipped);
  });
});
