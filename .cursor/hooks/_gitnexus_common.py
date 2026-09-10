#!/usr/bin/python3
"""
Tiện ích dùng chung cho 3 hook GitNexus (`.cursor/hooks/gitnexus-*.py`).

VÌ SAO DÙNG PYTHON, KHÔNG DÙNG NODE:
Cursor là app GUI macOS → tiến trình con KHÔNG thừa hưởng PATH của shell (chỉ có
`/usr/bin:/bin:/usr/sbin:/sbin`). Đây đúng là lỗi đã làm MCP `gitnexus` không nạp
được (xem `docs/tooling/gitnexus-notes.md` §1). `node` nằm ở `/opt/homebrew/bin`
→ KHÔNG gọi được bằng tên trần; còn `/usr/bin/python3` luôn có sẵn.

`/opt/homebrew/bin/gitnexus` là symlink tới `dist/cli/index.js` với shebang
`#!/usr/bin/env node` → chạy nó vẫn cần `node` trong PATH. Vì vậy mọi lần spawn
đều phải truyền PATH đã bồi (xem `augmented_env`).
"""

import json
import os
import re
import shutil
import subprocess
import sys
import time

# Thư mục chứa binary do package manager cài — GUI app không tự có trong PATH.
EXTRA_PATH_DIRS = ("/opt/homebrew/bin", "/usr/local/bin", "/opt/local/bin")

ANSI_RE = re.compile(r"\x1b\[[0-9;]*[A-Za-z]")

# Slot lock: giới hạn số hook chạy song song để không nhiều tiến trình cùng mở
# index SQLite. Cùng tham số với `hook-lock.cjs` của GitNexus (3 slot / stale 30s).
MAX_INFLIGHT = 3
STALE_MS = 30_000


def read_event():
    """Đọc payload JSON của Cursor từ stdin. Payload lỗi → trả dict rỗng (fail-open)."""
    try:
        return json.loads(sys.stdin.read() or "{}")
    except Exception:
        return {}


def emit(payload):
    """In JSON ra stdout — kênh duy nhất Cursor đọc. Không in gì = 'không can thiệp'."""
    sys.stdout.write(json.dumps(payload, ensure_ascii=False))


def debug(msg):
    """Ghi log khi bật `GITNEXUS_HOOK_DEBUG=1`. Chỉ ra stderr — stdout dành cho JSON."""
    if os.environ.get("GITNEXUS_HOOK_DEBUG"):
        sys.stderr.write("[gitnexus-hook] %s\n" % msg)


def augmented_env():
    """env với PATH đã bồi thêm EXTRA_PATH_DIRS để shebang `env node` resolve được."""
    env = dict(os.environ)
    parts = [d for d in EXTRA_PATH_DIRS if os.path.isdir(d)]
    env["PATH"] = os.pathsep.join(parts + [env.get("PATH", "")])
    return env


def find_repo_root(cwd):
    """
    Tìm repo đã index: đi ngược tối đa 5 cấp tìm thư mục `.gitnexus` **của repo**.

    Bỏ qua `~/.gitnexus` (registry global) — nhận diện bằng `registry.json`/`repos/`,
    hai file này không tồn tại trong index của repo.
    """
    d = os.path.abspath(cwd)
    for _ in range(5):
        candidate = os.path.join(d, ".gitnexus")
        if os.path.isdir(candidate):
            is_global = os.path.exists(os.path.join(candidate, "registry.json")) or os.path.isdir(
                os.path.join(candidate, "repos")
            )
            if not is_global:
                return d
        parent = os.path.dirname(d)
        if parent == d:
            break
        d = parent
    return None


def acquire_slot(repo_root):
    """
    Chiếm 1 trong MAX_INFLIGHT slot. Trả về hàm release, hoặc None nếu hết slot.

    FAIL-CLOSED có chủ đích: không tạo được thư mục lock → trả None (bỏ qua hook)
    thay vì chạy tự do, tránh fan-out nhiều tiến trình cùng mở index.
    Slot mồ côi (process đã chết hoặc file quá STALE_MS) được thu hồi.
    """
    lock_dir = os.path.join(repo_root, ".gitnexus", ".hook-locks")
    try:
        os.makedirs(lock_dir, exist_ok=True)
    except Exception:
        return None

    mypid = str(os.getpid())
    for slot in range(MAX_INFLIGHT):
        path = os.path.join(lock_dir, "slot-%d.lock" % slot)
        for _ in range(2):
            try:
                fd = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o644)
                os.write(fd, mypid.encode())
                os.close(fd)

                def release(_p=path, _pid=mypid):
                    try:
                        # Chỉ xoá khi slot vẫn thuộc mình — nếu bị coi là stale và
                        # hook khác đã chiếm, file giờ là của nó.
                        with open(_p) as f:
                            if f.read().strip() == _pid:
                                os.unlink(_p)
                    except Exception:
                        pass

                return release
            except FileExistsError:
                if _is_stale(path):
                    try:
                        os.unlink(path)
                        continue  # thử lại slot này sau khi thu hồi
                    except Exception:
                        pass
                break
            except Exception:
                break
    return None


def _is_stale(path):
    """Slot coi là mồ côi khi PID đã chết, hoặc file cũ hơn STALE_MS."""
    try:
        age_ms = (time.time() - os.path.getmtime(path)) * 1000
        if age_ms > STALE_MS:
            return True
        with open(path) as f:
            pid = int(f.read().strip())
        os.kill(pid, 0)
        return False
    except (ProcessLookupError, ValueError):
        return True
    except PermissionError:
        return False
    except Exception:
        return True


def run_gitnexus(args, cwd, timeout):
    """
    Chạy CLI gitnexus. Trả về (stdout, stderr) hoặc (None, None) nếu không chạy được.

    `augment` in kết quả ra **stderr** (banner + block `[GitNexus]`) — đây là hành vi
    của CLI, không phải lỗi; vì vậy caller đọc stderr.
    """
    env = augmented_env()
    exe = shutil.which("gitnexus", path=env["PATH"])
    if not exe:
        debug("không tìm thấy binary gitnexus trong PATH=%s" % env["PATH"])
        return (None, None)
    try:
        proc = subprocess.run(
            [exe] + list(args),
            cwd=cwd,
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=timeout,
        )
        return (proc.stdout.decode("utf-8", "replace"), proc.stderr.decode("utf-8", "replace"))
    except Exception as exc:
        debug("gitnexus %s thất bại: %s" % (" ".join(args), exc))
        return (None, None)


def strip_ansi(text):
    return ANSI_RE.sub("", text or "")
