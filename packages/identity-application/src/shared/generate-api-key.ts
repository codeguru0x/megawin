import { randomBytes } from "crypto";

const API_KEY_PREFIX = "mw_live_";
const API_KEY_RANDOM_BYTES = 32;

/**
 * Sinh API key theo format: mw_live_<64 hex chars>
 * Tổng 72 ký tự, 256-bit entropy — tương đương chuẩn Stripe/Twilio.
 */
export function generateApiKey(): string {
  return API_KEY_PREFIX + randomBytes(API_KEY_RANDOM_BYTES).toString("hex");
}
