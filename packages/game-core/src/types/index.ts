/**
 * Game Core – Shared Types Barrel
 *
 * Các kiểu dữ liệu dùng chung cho tất cả game trong hệ thống — tách theo domain
 * để tránh 1 file phình quá nhiều type không liên quan (common/draw/betting-stats/
 * ops-alert). Import: `import { ... } from "@megawin/game-core/types"`.
 */

export * from "./common";
export * from "./draw";
export * from "./betting-stats";
export * from "./ops-alert";
