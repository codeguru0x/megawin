#!/usr/bin/python3
"""
TẦNG 3 — `postToolUse`: nhắc verify NGAY SAU khi agent gọi 1 tool code graph.

VÌ SAO CẦN:
Rule §3 nói "graph là lower-bound, phải Grep xác nhận" — nhưng rule nằm ở đầu context,
còn khoảnh khắc agent thực sự cần nhớ điều đó là **lúc vừa nhận kết quả graph**, có thể
cách đó vài chục nghìn token. Hook này đặt lời nhắc đúng vào khoảnh khắc đó.

Bằng chứng vì sao lời nhắc này không phải thừa (gitnexus-notes.md §2): gọi `impact` trên
`CalculateFinancialsUseCase` trả `risk: "LOW"` kèm `causes.dispatchBoundary: 598` —
`risk` thấp CHỈ vì graph không truy được caller bind qua `extends UseCase<In, Out>`,
đúng pattern chủ đạo của repo. Đọc `risk` mà không đọc `boundaries` = kết luận sai.

CHỐNG NHIỄU: throttle theo thời gian (mặc định 15 phút/repo). Một phiên refactor gọi
graph 20 lần chỉ nhận lời nhắc 1 lần, không phải 20 lần.
"""

import hashlib
import os
import sys
import tempfile
import time

sys.path.insert(0, __file__.rsplit("/", 1)[0])

from _gitnexus_common import debug, emit, read_event  # noqa: E402

# Tool mà kết quả mang tính "lower-bound" → cần nhắc xác nhận lại.
# Cố tình BỎ `list_repos`, `check`, `group_*`: kết quả của chúng là xác định
# (`check --cycles` trả `cycleCount: 0` là sự thật đầy đủ, không phải sàn).
GRAPH_TOOLS = frozenset({"impact", "cypher", "context", "trace", "query", "route_map", "detect_changes"})

THROTTLE_SECONDS = 15 * 60


def resolve_tool_name(event):
    """
    Lấy tên tool graph từ payload, chịu được 2 hợp đồng khác nhau của Cursor:

    1. MCP gọi trực tiếp  → `tool_name` dạng `MCP:impact`
    2. MCP gọi qua wrapper → `tool_name` = `CallDynamicTool`, tên thật nằm trong
       `tool_input.toolName` kèm `tool_input.namespace`

    Trả về tên tool nếu thuộc GitNexus, ngược lại None.
    """
    raw = (event.get("tool_name") or "").strip()
    tool_input = event.get("tool_input") or {}

    if raw.startswith("MCP:"):
        return raw[4:] or None

    if raw == "CallDynamicTool":
        namespace = str(tool_input.get("namespace") or "")
        if "gitnexus" not in namespace:
            return None
        name = tool_input.get("toolName")
        return str(name) if name else None

    return None


def throttled(repo_key):
    """True nếu vừa nhắc trong THROTTLE_SECONDS. Cập nhật mốc thời gian khi cho phép."""
    digest = hashlib.sha1(repo_key.encode()).hexdigest()[:12]
    stamp = os.path.join(tempfile.gettempdir(), "gitnexus-verify-%s.stamp" % digest)
    now = time.time()
    try:
        if os.path.exists(stamp) and now - os.path.getmtime(stamp) < THROTTLE_SECONDS:
            return True
    except Exception:
        pass
    try:
        with open(stamp, "w") as f:
            f.write(str(now))
    except Exception:
        # Không ghi được mốc → vẫn cho nhắc lần này, chấp nhận nhắc lại lần sau.
        pass
    return False


def main():
    event = read_event()
    tool = resolve_tool_name(event)
    if not tool or tool not in GRAPH_TOOLS:
        return

    if throttled(event.get("cwd") or "megawin"):
        debug("đã nhắc verify trong %ds gần đây — bỏ qua" % THROTTLE_SECONDS)
        return

    lines = [
        "[GitNexus] Nhắc trước khi kết luận từ kết quả `%s` vừa nhận:" % tool,
        "• Kết quả graph là LOWER-BOUND (`epistemic: \"lower-bound\"`) — con số là sàn, không phải trần.",
        "• Rỗng / `risk: \"UNKNOWN\"` / `impactedCount: 0` KHÔNG nghĩa \"không ai dùng\", chỉ nghĩa",
        "  \"graph không truy được\". Đọc `boundaries` và `causes` TRƯỚC khi đọc `risk`:",
        "  repo này có `dispatchBoundary: 598` (`extends UseCase<In, Out>`) → `risk: \"LOW\"` thường sai.",
        "• Quy trình còn lại: Grep xác nhận danh sách → Read chốt logic. Chưa Grep thì chưa kết luận.",
        "• Code tài chính (`settle`/`payout`/`wallet`/`financial`/`commission`): tuyệt đối không dùng",
        "  kết quả graph làm bằng chứng duy nhất — phải đọc code + test.",
    ]
    emit({"additional_context": "\n".join(lines)})


if __name__ == "__main__":
    main()
