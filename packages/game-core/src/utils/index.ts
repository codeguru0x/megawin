/**
 * Chuyển drawId thành tên execution hợp lệ cho AWS Step Functions.
 *
 * drawId "2026-03-02.001" → "2026-03-02-001"
 *
 * Deterministic: cùng drawId luôn ra cùng tên → AWS idempotent (same name + same input).
 * Ký tự hợp lệ: a-z A-Z 0-9 - _ (max 80 chars).
 */
export function toExecutionName(drawId: string): string {
  return drawId.replace(/\./g, "-");
}

export * from "./resettle-keys";
