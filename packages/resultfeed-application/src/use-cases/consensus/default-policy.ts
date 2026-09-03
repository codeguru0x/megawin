/**
 * ResultFeed – Default ConflictPolicy (per-game, hardcoded cho G3)
 *
 * `03-consensus.plan.md §4` mô tả `ConflictPolicy` là cấu hình PER GAME, sửa được qua
 * backoffice. Backoffice API cho việc này thuộc `04-backoffice-api.plan.md` (CHƯA implement).
 *
 * Ở G3, `resultfeed` mới có ĐÚNG 1 nguồn (`vietlott-detail`, role `Authoritative`) cho cả
 * Keno và Bingo18 — chưa có nguồn `Confirming`/`Reference` nào để tạo ra khả năng LỆCH thật.
 * Vì vậy hardcode `HumanOnly` (mặc định an toàn nhất theo plan — "MẶC ĐỊNH, dùng cho G1–G5")
 * cho MỌI game tại đây, thay vì xây một cơ chế đọc config động chưa có nhu cầu thật.
 *
 * ⚠️ Khi `04-backoffice-api` implement config per-game editable, THAY hằng số này bằng field
 * đọc từ DB (VD `GameConsensusConfig.conflictPolicy`) — xoá file này, không giữ lại làm giá
 * trị default ngầm (tránh 2 nguồn chân lý).
 */

import { ConflictPolicy } from "@megawin/resultfeed/entities";

export const RESULTFEED_DEFAULT_CONFLICT_POLICY: ConflictPolicy = ConflictPolicy.HumanOnly;
