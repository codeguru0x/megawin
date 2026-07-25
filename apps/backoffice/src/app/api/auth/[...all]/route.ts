/**
 * Better Auth – Catch-all API route handler.
 *
 * Xử lý tất cả auth endpoints:
 * - /api/auth/signin/cognito  → redirect sang Cognito Hosted UI
 * - /api/auth/callback/cognito → xử lý callback từ Cognito
 * - /api/auth/get-session     → trả session hiện tại
 * - /api/auth/sign-out        → xóa session
 * - v.v.
 *
 * @see https://better-auth.com/docs/integrations/next#create-api-route
 */

import { toNextJsHandler } from "better-auth/next-js";

import { auth } from "@/lib/auth";

export const { GET, POST } = toNextJsHandler(auth);
