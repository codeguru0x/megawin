/**
 * Skill eve: `max3dpro` — sản phẩm Max 3D Pro (p1-02 §5.1).
 *
 * Gộp 3 doc `max3dpro/*.md` (tổng quan, nội dung đặt cược, điều kiện trúng & trả thưởng) thành
 * 1 skill. Nội dung import bằng `?raw` từ `@megawin/ops-docs` — nguồn duy nhất, cũng render ở
 * `/guides` cho staff (xem GATE §0 của plan).
 *
 * ⚠️ Sửa 3 file `.md` nguồn là ĐỔI LUÔN hành vi skill này (bundle inline lúc build, không đọc
 * runtime). Đổi tên field trong game config cũng phải soát lại doc — xem quy trình ở
 * `.cursor/rules/ops-docs-agent-sync.mdc`.
 */

import howToPlay from "@megawin/ops-docs/docs/games/max3dpro/how-to-play.md?raw";
import overview from "@megawin/ops-docs/docs/games/max3dpro/overview.md?raw";
import payout from "@megawin/ops-docs/docs/games/max3dpro/payout.md?raw";
import { defineSkill } from "eve/skills";

export default defineSkill({
  description:
    "Dùng khi nhân viên hỏi về sản phẩm Max 3D Pro: cách chơi cặp ordered bộ ba, chơi " +
    "MultiNumber/MultiDigit, điều kiện trúng 8 hạng giải (gồm Đặc biệt/Phụ Đặc biệt), luật gộp " +
    "giải, trúng ngược thứ tự, hoặc giá cược. Tài liệu này KHÔNG chứa con số nào — mọi số liệu " +
    "(mệnh giá, tiền giải) phải lấy bằng getGameConfig cho max3dpro trong chính lượt trả lời.",
  markdown: [overview, howToPlay, payout].join("\n\n---\n\n"),
});
