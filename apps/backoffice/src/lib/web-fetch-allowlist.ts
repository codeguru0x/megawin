/**
 * Allowlist domain cho tool `web_fetch`.
 *
 * TÁCH RA FILE RIÊNG (không để trong `agent/tools/web_fetch.ts`) vì đây là **hàng rào an ninh** —
 * cần test được độc lập. Import file tool sẽ kéo theo `eve/tools/defaults`, tức kéo theo cả năng
 * lực gọi HTTP thật; một test chỉ muốn kiểm tra logic chặn thì không nên có khả năng đó.
 *
 * Vì sao cần hàng rào: `web_fetch` chạy trong **app runtime** (cùng process Next.js, có full
 * `process.env`: `MONGODB_URI`, AWS creds…), KHÁC `bash` chạy trong sandbox VM không mạng. Cho model
 * fetch URL tuỳ ý là kênh exfiltration số liệu tài chính khi bị indirect prompt injection.
 * Xem `.cursor/plans/ai-panel/p0-04-sandbox-chat-ux.plan.md` §2.1.
 */

/**
 * Hostname được phép fetch. Allowlist (KHÔNG phải blocklist) vì blocklist luôn thiếu domain mới
 * của attacker.
 *
 * Scope nghiệp vụ (user chốt 16/08): trang Vietlott chính thức + trang kết quả xổ số để đối chiếu
 * số liệu quay thưởng. KHÔNG mở sang tin tức/mạng xã hội chung.
 *
 * Chỉ thêm domain khi có nhu cầu nghiệp vụ THẬT và người thêm đã đọc §2.1 của p0-04.
 */
export const WEB_FETCH_ALLOWED_HOSTS: ReadonlySet<string> = new Set([
  // ── Vietlott chính thức ──
  "vietlott.vn",
  "www.vietlott.vn",
  "info.vietlott-sms.vn",
  // ── Trang kết quả xổ số (đối chiếu số liệu quay thưởng) ──
  "xoso.com.vn",
  "www.xoso.com.vn",
  "minhngoc.net.vn",
  "www.minhngoc.net.vn",
  "ketqua.net",
  "www.ketqua.net",
]);

/**
 * `true` khi URL được phép fetch. Chặn khi: không parse được, không phải `https`, hoặc hostname
 * không khớp CHÍNH XÁC một phần tử trong {@link WEB_FETCH_ALLOWED_HOSTS}.
 */
export function isAllowedWebFetchUrl(rawUrl: string): boolean {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    // URL không parse được → chặn.
    return false;
  }
  // Chỉ https — http cho phép MITM chèn nội dung injection giữa đường.
  if (url.protocol !== "https:") {
    return false;
  }
  // So khớp CHÍNH XÁC hostname, KHÔNG dùng endsWith(".vietlott.vn"): attacker đăng ký
  // "evil-vietlott.vn" hay "vietlott.vn.attacker.tld" là lọt ngay.
  return WEB_FETCH_ALLOWED_HOSTS.has(url.hostname);
}

/** Message lỗi trả cho model khi URL bị chặn — nêu rõ danh sách để model tự sửa, không đoán. */
export function webFetchBlockedMessage(url: string | undefined): string {
  return `URL "${url ?? "(thiếu)"}" không nằm trong danh sách domain được phép.`;
}
