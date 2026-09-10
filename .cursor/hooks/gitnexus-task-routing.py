#!/usr/bin/python3
"""
TẦNG 2 — `preToolUse` matcher `Task`: chèn routing GitNexus vào prompt subagent.

VÌ SAO CẦN:
Task subagent chạy trong context RIÊNG — **không** nhận `always_applied_workspace_rules`,
không nhận `AGENTS.md`/`CLAUDE.md`, không nhận danh sách namespace MCP. Đã kiểm chứng
2026-09-07 bằng cách đọc transcript JSONL của 1 subagent `explore`: số lần xuất hiện của
`always_applied`, `AGENTS.md`, `CLAUDE.md`, `dynamic_tool_catalog` đều **bằng 0**.
Xem `.cursor/rules/gitnexus-code-graph.mdc` §7.

Đây là hành vi kiến trúc của Task tool — KHÔNG sửa được bằng cách viết thêm rule, cũng
không sửa được bằng cách user attach rule vào prompt (rule chỉ vào context agent chính).
Hook `preToolUse` là kênh DUY NHẤT vá được, nhờ output `updated_input`.

CHỦ Ý GIỮ KHỐI NGẮN: subagent thường làm việc thuộc "vùng graph mù" (Next.js App Router,
DTO field, string literal) — nơi Grep/Glob mới là đúng. Khối chèn vào chỉ nói *khi nào*
cần graph và *lệnh cụ thể*, không ép graph-first.
"""

import sys

sys.path.insert(0, __file__.rsplit("/", 1)[0])

from _gitnexus_common import debug, emit, read_event  # noqa: E402

# Subagent không làm việc với code graph → không chèn gì, tránh loãng prompt.
SKIP_TYPES = frozenset({"browser-use", "bugbot", "security-review", "cursor-guide", "ci-investigator"})

# Từ khoá cho thấy task CẦN quan hệ (caller/blast radius) chứ không chỉ cần nội dung.
# Không match → vẫn chèn, nhưng subagent tự đọc bảng và chọn Grep là hợp lệ.
ROUTING_BLOCK = """
─────────────────────────────────────────────────────────────────────────────
BỔ SUNG BẮT BUỘC — Code graph GitNexus (bạn KHÔNG tự thấy thông tin này)

Repo này có code graph đã index, truy cập qua MCP namespace `project-0-megawin-gitnexus`
(dùng `GetDynamicTools` để lấy schema, rồi `CallDynamicTool`). MỌI lệnh phải truyền
`repo: "megawin"`.

DÙNG GRAPH khi cần QUAN HỆ (cái gì nối với cái gì):
  • Đếm/liệt kê caller, ai implement interface  → tool `cypher` (mạnh nhất)
  • Ngữ cảnh 1 symbol cụ thể                    → tool `context`
  • Đường đi từ A tới B                         → tool `trace`
  • Import vòng                                 → tool `check`
  KHÔNG gọi: `rename`, `shape_check`, `api_impact`, `explain`, `pdg_query` (trả rỗng
  trên repo này). `impact` chỉ là lower-bound, `query` chỉ là BM25 không semantic.

DÙNG Grep/Glob/Read (ĐÚNG, không cần graph) cho "vùng graph MÙ":
  Next.js App Router (`page.tsx`, `route.ts`, Server Action) · field trong DTO/entity ·
  Zod schema ↔ handler ↔ DTO · string literal / collection name / `as const` value ·
  Mongo pipeline / dot-path · sidebar-nav / config array · `extends UseCase<…>` gọi qua
  base class (598 dispatch boundary — graph mù đúng pattern chủ đạo của repo).

BẮT BUỘC XÁC NHẬN LẠI: kết quả graph là **lower-bound** — số trả về là sàn, không phải
trần. Rỗng / `risk: "UNKNOWN"` / `impactedCount: 0` KHÔNG nghĩa "không ai dùng", chỉ
nghĩa "graph không truy được". Quy trình: graph thu hẹp ứng viên → Grep xác nhận →
Read chốt logic. KHÔNG kết luận ở bước 1.

Symbol trùng tên: repo có 7 game song song nên mọi tên use-case trùng 7 lần. Gọi bằng
`name` trần sẽ nhận `status: "ambiguous"` — truyền `uid` hoặc `file_path`. Format uid:
`Class:packages/game-keno-application/src/use-cases/settle/calculate-financials.ts:CalculateFinancialsUseCase`

Khi báo cáo: nói rõ kết luận nào từ graph, kết luận nào từ đọc code. Không trộn lẫn.
─────────────────────────────────────────────────────────────────────────────
""".strip()


def main():
    event = read_event()
    tool_input = event.get("tool_input") or {}

    subagent_type = (tool_input.get("subagent_type") or "").strip()
    if subagent_type in SKIP_TYPES:
        debug("bỏ qua subagent_type=%s" % subagent_type)
        return

    prompt = tool_input.get("prompt")
    if not isinstance(prompt, str) or not prompt.strip():
        debug("không có prompt để chèn (keys=%s)" % list(tool_input))
        return

    # Idempotent: nếu agent chính đã tự chèn (hoặc hook chạy 2 lần), không chèn lại.
    if "project-0-megawin-gitnexus" in prompt:
        debug("prompt đã có routing GitNexus — bỏ qua")
        return

    updated = dict(tool_input)
    updated["prompt"] = "%s\n\n%s" % (prompt, ROUTING_BLOCK)
    emit({"permission": "allow", "updated_input": updated})


if __name__ == "__main__":
    main()
