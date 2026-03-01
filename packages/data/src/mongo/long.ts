/**
 * MongoDB BSON Long (Int64) Utilities
 *
 * BSON Long không thể JSON.stringify an toàn:
 *   JSON.stringify(Long.fromNumber(42)) → {"low":42,"high":0,"unsigned":false}
 *
 * Khi trả API hoặc chuyển sang entity layer, phải convert sang string.
 *
 * Import: `import { longToString } from "@megawin/data/mongo"`
 */

import type { Long } from "mongodb";

/**
 * Convert BSON Long → string an toàn.
 *
 * Xử lý cả trường hợp value đã là number hoặc string
 * (edge case khi test hoặc khi MongoDB driver trả plain number cho giá trị nhỏ).
 */
export function longToString(value: Long | number | string): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return value.toString();
  return value.toString();
}
