/**
 * Khai báo type cho matcher của `@testing-library/jest-dom` (vd `toBeInTheDocument`).
 *
 * Runtime đã được nạp sẵn qua `setupFiles` của preset `jsdomConfig`
 * (`@megawin/vitest-config`) — nhưng `setupFiles` KHÔNG dạy TypeScript về matcher mới, nên không có
 * file này thì `tsc --noEmit` báo `Property 'toBeInTheDocument' does not exist`.
 *
 * Đặt ở `test/` (không phải `src/`) vì matcher chỉ tồn tại trong môi trường test.
 */

/// <reference types="@testing-library/jest-dom/vitest" />
