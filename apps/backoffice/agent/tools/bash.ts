/**
 * Tool `bash` — chạy shell trong sandbox của agent (xem `agent/sandbox/sandbox.ts`).
 *
 * TRẠNG THÁI: **ĐÃ BẬT** (trước 16/08 từng `disableTool()` vì sandbox chưa bootstrap được nên
 * mọi lần gọi đều treo — xem plan `p0-04` §0.1). File này KHÔNG chỉ để ghi chú: nó thay
 * description mặc định ("Execute a shell command in the workspace sandbox.") bằng scope nghiệp vụ
 * cụ thể, vì description trần khiến model tưởng bash là đường tra cứu vạn năng và gọi nó thay vì
 * dùng tool báo cáo hoặc `clientContext`.
 *
 * KHÔNG gắn `approval` ⇒ mặc định không cần staff duyệt (quyết định của user 16/08). Chấp nhận
 * được vì bash bị bao bởi HAI lớp:
 *
 * 1. **VM isolation** — chạy trong sandbox, KHÔNG thấy `process.env` của app (không có
 *    `MONGODB_URI`, không có AWS credential).
 * 2. **`networkPolicy: "deny-all"`** — sandbox không có egress, kể cả DNS.
 *
 * Cả hai lớp KHÔNG dựa vào niềm tin: `bootstrap` ở `agent/sandbox/sandbox.ts` **assert** chúng mỗi
 * lần build template (probe `/dev/tcp` + liệt kê TÊN biến env nhạy cảm) và fail-closed nếu sai. Đây
 * là điểm quan trọng — dạng allowlist theo domain từng **inert** trên microsandbox 0.6.9 mà không
 * có dấu hiệu gì trong log; nếu không có assertion thì `never()` đã mất cơ sở trong im lặng. Trên
 * Vercel Sandbox, assertion egress đã chạy thật và PASS ở build 18/08 ⇒ lớp (2) có hiệu lực ở
 * production, không chỉ ở local.
 *
 * API (eve ≥ 0.45): `defineBashTool` đã bị xoá — override bằng `defineTool({ ...bash, … })`
 * từ `eve/tools/bash`.
 */

import { defineTool } from "eve/tools";
import { bash } from "eve/tools/bash";

export default defineTool({
  ...bash,
  description: [
    "Chạy lệnh shell trong sandbox Linux cô lập (cwd `/workspace`), KHÔNG có mạng.",
    "",
    "BẮT BUỘC DÙNG CHO MỌI PHÉP TÍNH ngoài cộng/trừ hai số nhỏ: tổng nhiều dòng, phần trăm,",
    "tỷ lệ, chênh lệch giữa các kỳ, chia bình quân, làm tròn tiền. TUYỆT ĐỐI không tự nhẩm rồi",
    "ghi kết quả vào câu trả lời — chạy `python3` ở đây và dùng đúng con số nó in ra.",
    "",
    "Có sẵn `/workspace/money.py` (Decimal, chuẩn tiền VND):",
    "  python3 -c 'from money import fmt, total; print(fmt(total([1234567, 89000])))'",
    "  → in `1.323.567 VND`. total() tổng chính xác, pct(v, '12.5') lấy 12,5%,",
    "    ratio(part, whole) ra %, vnd() làm tròn HALF_UP, fmt() format kiểu VN.",
    "Tính nhiều bước thì ghi file rồi chạy (`cat > calc.py <<'EOF' … EOF; python3 calc.py`).",
    "Đọc `/workspace/README.md` để biết chi tiết.",
    "",
    "CÔNG CỤ CÓ SẴN: `python3` (+`pip`), `node`, `pnpm`, `jq`, `rg`, `git`, `awk`, `sed`, coreutils.",
    "",
    "KHÔNG DÙNG CHO:",
    "- Lấy ngày/giờ hiện tại — đã có sẵn trong `clientContext` (`now`, `today`, `financialDate`)",
    "  theo giờ Việt Nam; giờ trong sandbox là UTC nên `date` sẽ trả sai.",
    "- Truy vấn số liệu MegaWin — sandbox KHÔNG kết nối được database. Dùng các tool báo cáo.",
    "- Tải nội dung web hoặc `pip install` — sandbox chặn toàn bộ egress.",
  ].join("\n"),
});
