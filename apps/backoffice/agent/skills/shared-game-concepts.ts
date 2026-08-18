/**
 * Skill eve: `shared-game-concepts` — khái niệm dùng chung cho cả 7 game (p1-02 §5.1).
 *
 * Gộp 3 doc `_shared/*.md` (từ vựng, vòng đời vé, dòng tiền) thành 1 skill — đây là nền tảng
 * đọc TRƯỚC khi đọc skill riêng của từng game. Nội dung import bằng `?raw` từ `@megawin/ops-docs`
 * (nguồn duy nhất, cũng render ở `/guides` cho staff — xem GATE §0 của plan).
 *
 * Tài liệu này CỐ Ý không có con số cấu hình nào — mọi số liệu (mệnh giá, tiền giải, hoa hồng…)
 * phải lấy bằng tool `getGameConfig`/`getGameJackpot` tại chính lượt trả lời.
 *
 * ⚠️ Sửa 3 file `.md` nguồn là ĐỔI LUÔN hành vi skill này (bundle inline lúc build, không đọc
 * runtime) — xem quy trình đồng bộ ở `.cursor/rules/ops-docs-agent-sync.mdc`.
 */

import glossary from "@megawin/ops-docs/docs/games/_shared/glossary.md?raw";
import moneyFlow from "@megawin/ops-docs/docs/games/_shared/money-flow.md?raw";
import ticketLifecycle from "@megawin/ops-docs/docs/games/_shared/ticket-lifecycle.md?raw";
import { defineSkill } from "eve/skills";

export default defineSkill({
  description:
    "Dùng khi nhân viên hỏi về khái niệm áp dụng chung cho mọi game: board/panel, line, " +
    "betCount, betUnitCount, vòng đời vé (place-bet → chờ quay → settle → payout, void & hoàn " +
    "tiền), hoặc dòng tiền vận hành (revenue → hoa hồng đại lý → trả thưởng → lợi nhuận). Tài " +
    "liệu này KHÔNG chứa con số nào — mọi số liệu phải lấy bằng getGameConfig cho game cụ thể " +
    "trong chính lượt trả lời. Đọc trước khi đọc skill riêng của từng game.",
  markdown: [glossary, ticketLifecycle, moneyFlow].join("\n\n---\n\n"),
});
