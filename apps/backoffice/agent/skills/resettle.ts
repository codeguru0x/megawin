/**
 * Skill eve: `resettle` — quy trình KẾT SỔ LẠI kỳ quay đã công bố kết quả.
 *
 * Gộp 9 doc staff `resettle/{lotto535,mega645,power655}/type-{a,b1,b2}.md` — chỉ 3 game có Jackpot
 * mới có runbook này (jackpot cycle truyền tiền từ kỳ này sang kỳ sau nên sửa 1 kỳ có thể kéo theo
 * kỳ khác). Nội dung import bằng `?raw` từ `@megawin/ops-docs` — nguồn duy nhất, cũng render ở
 * `/guides` cho staff.
 *
 * KHÔNG nạp bản `resettle/_developer/**` (SSOT cho dev: cycle-ledger, troubleshooting). Skill này
 * phục vụ staff thao tác trên UI, không phải dev debug.
 *
 * ⚠️ Sửa 9 file `.md` nguồn là ĐỔI LUÔN hành vi skill này (bundle inline lúc build, không đọc
 * runtime). Xem quy trình đồng bộ ở `.cursor/rules/ops-docs-agent-sync.mdc`.
 */

import lotto535TypeA from "@megawin/ops-docs/docs/resettle/lotto535/type-a.md?raw";
import lotto535TypeB1 from "@megawin/ops-docs/docs/resettle/lotto535/type-b1.md?raw";
import lotto535TypeB2 from "@megawin/ops-docs/docs/resettle/lotto535/type-b2.md?raw";
import mega645TypeA from "@megawin/ops-docs/docs/resettle/mega645/type-a.md?raw";
import mega645TypeB1 from "@megawin/ops-docs/docs/resettle/mega645/type-b1.md?raw";
import mega645TypeB2 from "@megawin/ops-docs/docs/resettle/mega645/type-b2.md?raw";
import power655TypeA from "@megawin/ops-docs/docs/resettle/power655/type-a.md?raw";
import power655TypeB1 from "@megawin/ops-docs/docs/resettle/power655/type-b1.md?raw";
import power655TypeB2 from "@megawin/ops-docs/docs/resettle/power655/type-b2.md?raw";
import { defineSkill } from "eve/skills";

/**
 * Gắn nhãn game vào đầu từng doc trước khi gộp.
 *
 * BẮT BUỘC vì 9 doc có H1 TRÙNG NHAU giữa 3 game (đều là `# Kết sổ lại — Type A (...)`) — gộp trần
 * thì model không còn cách nào biết đoạn nào của game nào, dễ đọc bước của Power 6/55 (có số đặc
 * biệt, Jackpot 1 + Jackpot 2) rồi trả lời cho Mega 6/45. Nhãn đặt trước TỪNG doc, không phải mỗi
 * nhóm game, để ranh giới không bị mất khi context trôi xa.
 *
 * @param gameLabel - Nhãn game hiển thị, khớp `GAME_LABELS` (VD: `"Power 6/55"`).
 * @param doc - Nội dung markdown thô của doc.
 * @returns Doc đã có dòng nhãn game ở đầu.
 */
function labeled(gameLabel: string, doc: string): string {
  return `> **Hướng dẫn dưới đây CHỈ áp dụng cho game ${gameLabel}.**\n\n${doc}`;
}

export default defineSkill({
  description:
    "Dùng khi nhân viên hỏi về KẾT SỔ LẠI (resettle) một kỳ quay: sửa kết quả đã công bố sai rồi " +
    "tính lại tiền thắng. Bao gồm cách phân loại Type A (kỳ độc lập, không ai trúng Jackpot), " +
    "Type B1 (đổi người trúng Jackpot, kỳ mới nhất), Type B2 (kéo theo nhiều kỳ sau phải kết sổ " +
    "lại tuần tự); các bước bấm trên màn Vận hành (Sửa kết quả, nút Kết sổ lại màu cam, mục 'Mở " +
    "để kết sổ lại' trong menu ⋮); khi nào phải báo Quản trị viên (DBA) và đợi xác nhận chu kỳ " +
    "Jackpot; dấu hiệu hoàn tất; kỳ kẹt ở trạng thái đang kết sổ. CHỈ có hướng dẫn cho 3 game " +
    "Jackpot: Lotto 5/35, Mega 6/45, Power 6/55 — TUYỆT ĐỐI không suy diễn sang keno, max3d, " +
    "max3dpro, bingo18. Tài liệu KHÔNG chứa con số cấu hình.",
  markdown: [
    labeled("Lotto 5/35", lotto535TypeA),
    labeled("Lotto 5/35", lotto535TypeB1),
    labeled("Lotto 5/35", lotto535TypeB2),
    labeled("Mega 6/45", mega645TypeA),
    labeled("Mega 6/45", mega645TypeB1),
    labeled("Mega 6/45", mega645TypeB2),
    labeled("Power 6/55", power655TypeA),
    labeled("Power 6/55", power655TypeB1),
    labeled("Power 6/55", power655TypeB2),
  ].join("\n\n---\n\n"),
});
