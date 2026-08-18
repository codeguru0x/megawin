/**
 * Skill eve: `mega645` — sản phẩm Mega 6/45 (p1-02 §5.1).
 *
 * Gộp 3 doc `mega645/*.md` (tổng quan, nội dung đặt cược, điều kiện trúng & trả thưởng) thành
 * 1 skill. Nội dung import bằng `?raw` từ `@megawin/ops-docs` — nguồn duy nhất, cũng render ở
 * `/guides` cho staff (xem GATE §0 của plan).
 *
 * ⚠️ Sửa 3 file `.md` nguồn là ĐỔI LUÔN hành vi skill này (bundle inline lúc build, không đọc
 * runtime). Đổi tên field trong game config cũng phải soát lại doc — xem quy trình ở
 * `.cursor/rules/ops-docs-agent-sync.mdc`.
 */

import howToPlay from "@megawin/ops-docs/docs/games/mega645/how-to-play.md?raw";
import overview from "@megawin/ops-docs/docs/games/mega645/overview.md?raw";
import payout from "@megawin/ops-docs/docs/games/mega645/payout.md?raw";
import { defineSkill } from "eve/skills";

export default defineSkill({
  description:
    "Dùng khi nhân viên hỏi về sản phẩm Mega 6/45: cách chơi, chọn 6 số, bao số, điều kiện trúng " +
    "từng hạng giải, cách trả thưởng, Jackpot đơn (không split), hoặc giá cược. Tài liệu này " +
    "KHÔNG chứa con số nào — mọi số liệu (mệnh giá, tiền giải, seed/số Jackpot) phải lấy bằng " +
    "getGameConfig/getGameJackpot cho mega645 trong chính lượt trả lời.",
  markdown: [overview, howToPlay, payout].join("\n\n---\n\n"),
});
