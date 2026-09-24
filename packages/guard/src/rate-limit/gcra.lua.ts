/**
 * Lua GCRA — 1 EVAL, 1 key, 1 value (TAT).
 *
 * Phác thảo: analysis §7.1. `now_ms` truyền **từ Lambda qua ARGV**, KHÔNG lấy
 * đồng hồ từ Redis (lệnh server-side bị coi non-deterministic ở một số
 * version/replica). Đánh đổi: clock skew giữa các Lambda; không đáng kể ở
 * thang phút.
 *
 * KEYS[1] = guard:rl:v1:<route>:<subjectType>_<hash(subjectId)>
 *
 * Key thật **không** chứa `{}` (`hashKeyPart` trả hex thuần) → 1 key duy nhất
 * → cluster-safe không phụ thuộc hash tag.
 *
 * Trả mảng 3 số: `{ allowed(0|1), retryAfterMs, remainingBurst }`.
 */

/**
 * Script GCRA đầy đủ — nạp qua `EVAL` (tự vào script cache) / gọi lại qua `EVALSHA`.
 *
 * TTL `PX` = `max(1, ceil(new_tat - now + dt))` → key tự hết hạn, không cần
 * cleanup job. `PX` kẹp ≥ 1 vì Redis reject `PX 0` (`invalid expire time`).
 */
export const GCRA_LUA_SCRIPT = `
-- ARGV[1] = emission_interval_ms  (ms) = floor(window_ms / limit)
-- ARGV[2] = delay_tolerance_ms    (ms) = emission_interval_ms * burst
-- ARGV[3] = now_ms                (ms) = epoch từ caller (KHÔNG lấy đồng hồ Redis)
local tat = tonumber(redis.call('GET', KEYS[1])) or tonumber(ARGV[3])
local now = tonumber(ARGV[3])
local ei, dt = tonumber(ARGV[1]), tonumber(ARGV[2])
-- ei < 1 (kể cả 0 / nil / không parse được): TAT không tiến + PX 0 hoặc inf ở remainingBurst.
-- Sàn 1ms khớp clamp ở gcra-math.ts. Không đổi công thức remainingBurst phía dưới.
if ei == nil or ei < 1 then ei = 1 end
if dt == nil or dt < 0 then dt = 0 end
if tat < now then tat = now end
local allow_at = tat - dt
if now < allow_at then
  return { 0, math.ceil(allow_at - now), 0 }
end
local new_tat = tat + ei
-- PX phải >= 1: Redis reject PX 0 ("invalid expire time") → script error → fail-open.
local px = math.ceil(new_tat - now + dt)
if px < 1 then px = 1 end
redis.call('SET', KEYS[1], new_tat, 'PX', px)
-- remainingBurst = LOWER BOUND, không phải canonical GCRA.
-- Canonical là (dt + ei - (new_tat - now)) / ei = giá trị dưới đây + 1.
-- Đo 2026-09-22 (burst=4): trả 3,2,1,0,-1 thay vì 4,3,2,1,0; \`parseDecision\` clamp -1 → 0.
-- GIỮ NGUYÊN có chủ đích: lệch về phía THẤP hơn thực tế → client backoff sớm hơn, không bao
-- giờ muộn hơn (đúng hướng cho cơ chế phòng thủ). Với burst=0 (mặc định repo) hai công thức
-- cho kết quả GIỐNG NHAU. Vector 3,2,1,0,0 đã khoá bằng test R21 — đừng "sửa" thành canonical.
return { 1, 0, math.floor((now - (new_tat - dt)) / ei) }
`.trim();
