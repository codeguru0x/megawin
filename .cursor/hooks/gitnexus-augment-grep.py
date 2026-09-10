#!/usr/bin/python3
"""
TẦNG 1 — `postToolUse` matcher `Grep`: bồi quan hệ graph vào kết quả Grep.

VÌ SAO CHẠY SAU GREP, KHÔNG PHẢI TRƯỚC:
Agent nhìn **source trước, graph sau** → không còn cửa nào để kết luận từ graph khi
chưa đọc source. Khớp đúng nguyên tắc của chính GitNexus: *"Source beats graph. The
graph navigates; current source is authoritative."* Và nó xoá bỏ bài toán "agent phải
tự nhớ gọi GitNexus" — thứ mà rule/skill/attach-tay đều không giải được.

KHÁC GÌ HOOK CỦA VENDOR (`gitnexus-cursor-integration/hooks/gitnexus-hook.cjs`):
Vendor chạy cả `Grep|Read|Shell`. Đo thật trên repo này (2026-09-08, GitNexus 1.6.11):

  • nhánh `Read`  → CHẾT CỨNG. Vendor lấy basename rồi xoá ký tự không phải [A-Za-z0-9_]:
    `calculate-financials.ts` → `calculatefinancials` → augment trả **0 symbol**.
    Repo này 100% file kebab-case (Biome `useFilenamingConvention`) nên mọi basename
    thành chuỗi lowercase liền, không bao giờ khớp symbol camelCase/PascalCase.
  • nhánh `Shell` → agent hay dùng regex alternation (`a|b`) → augment trả **0 symbol**.
  • nhánh `Grep`  → THẮNG THẬT: `upsertGameDaily` → 1 symbol + `Calls: findOneAndUpdate`;
    `DrawFinancial` → 5 symbol + `Called by: execute`. Đúng tầng thông tin Grep
    không bao giờ cho được.

→ Hook này CHỈ giữ nhánh `Grep`, thêm guard pattern + denylist + dedupe.
Chi tiết đo đạc: `docs/tooling/gitnexus-notes.md` §11.
"""

import re
import sys

sys.path.insert(0, __file__.rsplit("/", 1)[0])

from _gitnexus_common import (  # noqa: E402
    acquire_slot,
    debug,
    emit,
    find_repo_root,
    read_event,
    run_gitnexus,
    strip_ansi,
)

# Chỉ augment khi pattern là 1 identifier "sạch" — đúng dạng symbol trong graph.
# Chặn regex (`a|b`), path (`src/foo`), string literal, glob. Đo thật: alternation → 0 hit.
IDENTIFIER_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]{4,}$")

# Tên quá phổ thông → augment chỉ trả symbol ngẫu nhiên không liên quan.
# Danh sách này lấy từ 177 property site mà `analyze` báo không resolve được
# (gitnexus-notes.md §2) + tên file/hàm lặp nhiều nhất trong repo.
# Đo thật: `data` → 3 symbol cùng 1 file reports/types.ts; `index` → 3 symbol ngẫu nhiên.
DENYLIST = frozenset(
    {
        "index",
        "data",
        "body",
        "children",
        "after",
        "before",
        "base",
        "empty",
        "config",
        "types",
        "utils",
        "handler",
        "execute",
        "result",
        "value",
        "params",
        "input",
        "output",
        "options",
        "context",
        "schema",
        "route",
        "props",
        "state",
    }
)

# Số symbol tối đa giữ lại. Augment trả tối đa ~5; giữ nguyên nhưng cắt phòng xa.
MAX_SYMBOLS = 6


def extract_pattern(tool_input):
    """
    Lấy pattern từ `tool_input` của Grep.

    Docs Cursor liệt kê matcher nhưng KHÔNG chốt tên field per-tool, nên thử vài alias.
    Bật `GITNEXUS_HOOK_DEBUG=1` để in payload thật nếu Cursor đổi hợp đồng.
    """
    for key in ("pattern", "query", "regex", "search", "searchQuery", "q"):
        val = tool_input.get(key)
        if isinstance(val, str) and val:
            return val
    return None


def parse_symbols(stderr_text):
    """
    Bóc danh sách symbol từ output `gitnexus augment`.

    CLI in ra **stderr** (banner + block `[GitNexus] N related symbols found:`).
    Trả về list dòng đã dedupe, giữ nguyên thứ tự.
    """
    text = strip_ansi(stderr_text)
    if "[GitNexus]" not in text:
        return []

    lines = []
    seen = set()
    started = False
    for raw in text.splitlines():
        line = raw.rstrip()
        if "[GitNexus]" in line:
            started = True
            continue
        if not started:
            continue
        if not line.strip():
            continue
        # Augment hay trả cùng 1 symbol 2 lần (đo thật: `KenoOpsAlertType` → 2 dòng
        # y hệt). Dedupe theo nội dung đã normalize whitespace.
        key = " ".join(line.split())
        if key in seen:
            continue
        seen.add(key)
        lines.append(line)
        if len(lines) >= MAX_SYMBOLS * 2:  # ×2 vì mỗi symbol có thể kèm dòng `Calls:`
            break
    return lines


def main():
    event = read_event()
    tool_input = event.get("tool_input") or {}
    cwd = event.get("cwd") or ""

    pattern = extract_pattern(tool_input)
    if not pattern:
        debug("không lấy được pattern từ tool_input keys=%s" % list(tool_input))
        return

    if not IDENTIFIER_RE.match(pattern):
        debug("bỏ qua: %r không phải identifier sạch" % pattern)
        return

    if pattern.lower() in DENYLIST:
        debug("bỏ qua: %r nằm trong denylist" % pattern)
        return

    repo_root = find_repo_root(cwd)
    if not repo_root:
        debug("không tìm thấy .gitnexus của repo từ cwd=%s" % cwd)
        return

    release = acquire_slot(repo_root)
    if not release:
        debug("hết slot lock — bỏ qua")
        return

    try:
        _stdout, stderr = run_gitnexus(["augment", "--", pattern], repo_root, timeout=7)
    finally:
        release()

    symbols = parse_symbols(stderr or "")
    if not symbols:
        debug("augment %r trả 0 symbol" % pattern)
        return

    # Nhắc verify đi kèm NGAY trong context: graph là lower-bound, không phải trần.
    # Không có dòng này, agent dễ coi danh sách symbol là đầy đủ (gitnexus-notes.md §2:
    # dispatchBoundary 598 — pattern `extends UseCase<In, Out>` là vùng graph mù).
    body = "\n".join(
        [
            "[GitNexus graph] Quan hệ liên quan tới `%s` (từ code graph, KHÔNG phải kết quả Grep):" % pattern,
            "",
            *symbols,
            "",
            "Graph là LOWER-BOUND: danh sách trên là sàn, không phải trần. Repo có 598 dispatch",
            "boundary (`extends UseCase<In, Out>`) nên caller bind qua base class KHÔNG được truy.",
            "Cần đầy đủ → `cypher` (repo: \"megawin\") thu hẹp, rồi Grep xác nhận, rồi Read chốt logic.",
        ]
    )
    emit({"additional_context": body})


if __name__ == "__main__":
    main()
