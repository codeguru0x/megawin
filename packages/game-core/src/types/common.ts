/**
 * Game Core – Common Types
 *
 * Kiểu dùng chung, không thuộc domain cụ thể nào (draw/betting-stats/ops).
 */

/**
 * Ngày dạng ISO string "YYYY-MM-DD".
 * Dùng cho drawDate, report grouping – aggregation nhanh hơn Date object.
 * Timezone cố định: Asia/Ho_Chi_Minh.
 */
export type ISODateString = string;

/**
 * Re-export MongoDB Long type – dùng cho feedVersion field trong entry documents.
 * Các game packages import từ đây thay vì depend trực tiếp vào mongodb.
 */
export type { Long } from "mongodb";
