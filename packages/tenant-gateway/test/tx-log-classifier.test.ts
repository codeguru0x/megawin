/**
 * PURE — không DB.
 *
 * Unit test cho tx-log-classifier: phân loại kết cục transaction → status + error.
 * Logic thuần, không chạm DB/HTTP.
 */

import { ApiClientError } from "@megawin/http-client";
import { describe, expect, it } from "vitest";

import { TxLogStatus } from "../src/entities/enums";
import { classifyBatchOuterReject, classifyItem, classifyThrown } from "../src/shared/tx-log-classifier";

describe("classifyItem", () => {
  it("success = true → Success, không có error", () => {
    expect(classifyItem({ success: true })).toEqual({ status: TxLogStatus.Success });
  });

  it("success = false có error → Failed + giữ code/message", () => {
    const out = classifyItem({ success: false, error: { code: "INSUFFICIENT", message: "thiếu" } });
    expect(out.status).toBe(TxLogStatus.Failed);
    expect(out.error).toEqual({ code: "INSUFFICIENT", message: "thiếu" });
  });

  it("success = false thiếu error → fallback code UNKNOWN", () => {
    const out = classifyItem({ success: false });
    expect(out.error?.code).toBe("UNKNOWN");
  });
});

describe("classifyBatchOuterReject", () => {
  it("đánh dấu batchOuterRejected = true", () => {
    const out = classifyBatchOuterReject({ code: "REJECT", message: "cả batch" });
    expect(out.status).toBe(TxLogStatus.Failed);
    expect(out.error?.batchOuterRejected).toBe(true);
    expect(out.error?.code).toBe("REJECT");
  });

  it("thiếu outerError → fallback BATCH_REJECTED", () => {
    expect(classifyBatchOuterReject().error?.code).toBe("BATCH_REJECTED");
  });
});

describe("classifyThrown", () => {
  it("TIMEOUT → giữ code TIMEOUT, httpStatus 408 khi status <= 0", () => {
    const out = classifyThrown(new ApiClientError(0, { code: "TIMEOUT", message: "timeout" }));
    expect(out.error?.code).toBe("TIMEOUT");
    expect(out.error?.httpStatus).toBe(408);
  });

  it("HTTP status > 0 → code HTTP_<status> + httpStatus", () => {
    const out = classifyThrown(new ApiClientError(503, { code: "NETWORK_ERROR", message: "x" }));
    expect(out.error?.code).toBe("HTTP_503");
    expect(out.error?.httpStatus).toBe(503);
  });

  it("network failure (status 0) → NETWORK_ERROR, không ghi httpStatus", () => {
    const out = classifyThrown(new ApiClientError(0, { code: "NETWORK_ERROR", message: "dns" }));
    expect(out.error?.code).toBe("NETWORK_ERROR");
    expect(out.error?.httpStatus).toBeUndefined();
  });

  it("lỗi không phải ApiClientError → NETWORK_ERROR + message", () => {
    const out = classifyThrown(new Error("boom"));
    expect(out.error?.code).toBe("NETWORK_ERROR");
    expect(out.error?.message).toBe("boom");
  });
});
