import { ulid } from "ulid";

/**
 * Tạo ULID mới
 * @returns ULID mới
 */
export const generateULID = (): string => {
  return ulid();
};
