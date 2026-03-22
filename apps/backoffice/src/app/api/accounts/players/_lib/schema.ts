import { z } from "zod";

/** Validate MongoDB ObjectId hex string (24 lowercase hex chars). */
const objectIdHex = z.string().regex(/^[0-9a-f]{24}$/, "cursor phải là ObjectId hex 24 ký tự");

/** Query params cho GET /api/accounts/players (cursor-based pagination) */
export const listPlayersQuerySchema = z.object({
  tenantId: z.string().min(1, "tenantId là bắt buộc."),
  /**
   * entity.id (ObjectId hex) của record cuối trang hiện tại → lấy trang tiếp (next).
   * Mutually exclusive với before.
   */
  after: objectIdHex.optional(),
  /**
   * entity.id (ObjectId hex) của record đầu trang hiện tại → lấy trang trước (prev).
   * Mutually exclusive với after.
   */
  before: objectIdHex.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
