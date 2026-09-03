/**
 * Glue wiring test — resultfeed-worker consensus-tick (mock use-case, KHÔNG chạm DB).
 *
 * Worker chỉ là glue: `new ConsensusTickUseCase({ autoPublishUnverified })` + `handler = () =>
 * useCase.run()`. Mock use-case để verify (1) handler đọc đúng
 * `RESULTFEED_AUTO_PUBLISH_UNVERIFIED` từ `process.env` MỖI LẦN invoke (không cache module-scope)
 * và (2) delegate `run()` đúng kết quả. Logic nghiệp vụ (algorithm quyết định consensus) đã
 * test ở `resultfeed-application`.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const runMock = vi.fn().mockResolvedValue({ ticks: 1, evaluated: 2, agreed: 1, conflicted: 0, pending: 1 });
const constructorMock = vi.fn();

vi.mock("@megawin/resultfeed-application/use-cases/consensus", () => ({
  ConsensusTickUseCase: class {
    run = runMock;
    constructor(deps: unknown) {
      constructorMock(deps);
    }
  },
}));

const { handler } = await import("../../../src/handlers/consensus/tick");

const ORIGINAL_ENV = process.env.RESULTFEED_AUTO_PUBLISH_UNVERIFIED;

beforeEach(() => {
  constructorMock.mockClear();
  runMock.mockClear();
});

afterEach(() => {
  if (ORIGINAL_ENV === undefined) {
    delete process.env.RESULTFEED_AUTO_PUBLISH_UNVERIFIED;
  } else {
    process.env.RESULTFEED_AUTO_PUBLISH_UNVERIFIED = ORIGINAL_ENV;
  }
});

describe("resultfeed-worker consensus-tick handler", () => {
  it("RESULTFEED_AUTO_PUBLISH_UNVERIFIED không set → autoPublishUnverified=false", async () => {
    delete process.env.RESULTFEED_AUTO_PUBLISH_UNVERIFIED;

    const res = await handler();

    expect(constructorMock).toHaveBeenCalledWith({ autoPublishUnverified: false });
    expect(runMock).toHaveBeenCalledWith();
    expect(res).toEqual({ ticks: 1, evaluated: 2, agreed: 1, conflicted: 0, pending: 1 });
  });

  it("RESULTFEED_AUTO_PUBLISH_UNVERIFIED='true' → autoPublishUnverified=true", async () => {
    process.env.RESULTFEED_AUTO_PUBLISH_UNVERIFIED = "true";

    await handler();

    expect(constructorMock).toHaveBeenCalledWith({ autoPublishUnverified: true });
  });

  it("RESULTFEED_AUTO_PUBLISH_UNVERIFIED='false' (tường minh) → autoPublishUnverified=false", async () => {
    process.env.RESULTFEED_AUTO_PUBLISH_UNVERIFIED = "false";

    await handler();

    expect(constructorMock).toHaveBeenCalledWith({ autoPublishUnverified: false });
  });

  it("Giá trị bất kỳ khác 'true' (VD 'TRUE', '1') → autoPublishUnverified=false (so sánh strict)", async () => {
    process.env.RESULTFEED_AUTO_PUBLISH_UNVERIFIED = "1";

    await handler();

    expect(constructorMock).toHaveBeenCalledWith({ autoPublishUnverified: false });
  });
});
