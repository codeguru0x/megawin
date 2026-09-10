/**
 * Bulk draw action — hạ tầng điều phối bulk DÙNG CHUNG mọi game.
 *
 * Trước đây mỗi game copy nguyên bộ này (`bulk-runner.ts` giữa Keno và Bingo18 khác đúng 2
 * dòng import). Port Hub cho 5 game còn lại sẽ thành 5 bản copy nữa → gom về đây, mỗi game
 * chỉ giữ 4 use-case mỏng + input DTO riêng.
 *
 * Barrel này import {@link runBulkDrawAction} (kéo `@megawin/shared`) — Client Component
 * PHẢI import subpath `./use-cases/bulk-draw-action/limits`, KHÔNG import barrel này.
 */

export type { BulkDrawActionOutput, BulkDrawActionResult } from "./dto";
export { BULK_CONCURRENCY, BULK_MAX_DRAWS } from "./limits";
export { runBulkDrawAction } from "./runner";
