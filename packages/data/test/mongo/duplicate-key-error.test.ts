import { describe, it, expect } from "vitest";
import { isDuplicateKeyError, isOnlyDuplicateKeyError } from "../../src/mongo/duplicate-key-error";

/** Giả lập `MongoServerError` đơn (vd từ findOneAndUpdate/insertOne): `.code` phẳng. */
const serverError = (code: number) => ({ code });

/**
 * Giả lập 1 phần tử `writeErrors` của `MongoBulkWriteError`: shape lồng `.err.code`
 * (WriteError trong driver có getter `code` + field `err: BulkWriteOperationError`).
 */
const writeError = (code: number) => ({ err: { code } });

/** Giả lập `MongoBulkWriteError`: có field `writeErrors` (mảng hoặc single-object). */
const bulkError = (writeErrors: unknown, topCode = 11000) => ({
  code: topCode,
  writeErrors,
});

describe("isDuplicateKeyError", () => {
  it("nhận diện lỗi đơn qua error.code", () => {
    expect(isDuplicateKeyError(serverError(11000))).toBe(true);
    expect(isDuplicateKeyError(serverError(121))).toBe(false);
  });

  it("nhận diện phần tử writeErrors qua error.err.code", () => {
    expect(isDuplicateKeyError(writeError(11000))).toBe(true);
    expect(isDuplicateKeyError(writeError(50))).toBe(false);
  });

  it("false cho null/undefined/object không có code", () => {
    expect(isDuplicateKeyError(null)).toBe(false);
    expect(isDuplicateKeyError(undefined)).toBe(false);
    expect(isDuplicateKeyError({})).toBe(false);
    expect(isDuplicateKeyError(new Error("boom"))).toBe(false);
  });
});

describe("isOnlyDuplicateKeyError", () => {
  it("bulk writeErrors dạng MẢNG toàn 11000 → true", () => {
    const err = bulkError([writeError(11000), writeError(11000)]);
    expect(isOnlyDuplicateKeyError(err)).toBe(true);
  });

  it("bulk writeErrors dạng MẢNG có lẫn lỗi khác → false", () => {
    const err = bulkError([writeError(11000), writeError(121)]);
    expect(isOnlyDuplicateKeyError(err)).toBe(false);
  });

  it("bulk writeErrors dạng SINGLE-OBJECT (OneOrMore) 11000 → true", () => {
    const err = bulkError(writeError(11000));
    expect(isOnlyDuplicateKeyError(err)).toBe(true);
  });

  it("bulk writeErrors dạng SINGLE-OBJECT không phải 11000 → false", () => {
    const err = bulkError(writeError(121));
    expect(isOnlyDuplicateKeyError(err)).toBe(false);
  });

  it("writeErrors RỖNG [] → false dù top-level code = 11000 (không rơi xuống error.code)", () => {
    // Bulk error không có write error nào (vd WriteConcernError) KHÔNG phải "toàn 11000".
    expect(isOnlyDuplicateKeyError(bulkError([], 11000))).toBe(false);
  });

  it("lỗi đơn KHÔNG có field writeErrors → kiểm trực tiếp error.code", () => {
    expect(isOnlyDuplicateKeyError(serverError(11000))).toBe(true);
    expect(isOnlyDuplicateKeyError(serverError(121))).toBe(false);
  });

  it("false cho null/undefined", () => {
    expect(isOnlyDuplicateKeyError(null)).toBe(false);
    expect(isOnlyDuplicateKeyError(undefined)).toBe(false);
  });
});
