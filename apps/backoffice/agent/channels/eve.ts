/**
 * Channel auth cho eve HTTP API (`/eve/v1/*`) — override auth policy mặc định + đính danh tính
 * staff vào từng turn.
 *
 * eve mặc định fail-closed: không có file này, production browser traffic nhận 401
 * (`[vercelOidc(), localDev(), placeholderAuth()]`). Ta author `AuthFn` verify session
 * better-auth — tái dùng đúng logic `resolveAuthSession` mà route Next.js (`lib/api.ts`)
 * đang dùng, để 2 nơi luôn đồng bộ quy tắc auth (session hợp lệ + accountStatus + role).
 *
 * Thứ tự walk: `appSession()` trước — browser same-origin (withEve()) tự gửi cookie
 * better-auth trên mọi request `/eve/v1/*`, nên đây là đường thật cho staff. `vercelOidc()`
 * sau đó cho phép CLI/dev-tui từ máy đã link Vercel project gọi agent đã deploy, và các
 * deployment nội bộ khác trong team gọi lẫn nhau.
 *
 * KHÔNG dùng `none()` — đây là dữ liệu tài chính nội bộ. KHÔNG giữ `placeholderAuth()`.
 * KHÔNG dùng `localDev()` TRẦN trong chuỗi auth: helper này authenticate MỌI request bằng
 * principal tổng hợp khi process là `eve dev`/`vercel dev`, bất kể request có cookie hợp lệ hay
 * không — với agent đọc số liệu tài chính, ta muốn hành vi auth giống hệt nhau ở local và
 * production (phải đăng nhập Staff thật mới gọi được), để test 401/403 lúc local phản ánh đúng
 * production. Ngoại lệ DUY NHẤT là {@link evalBypass}: bọc `localDev()` sau gate
 * `EVE_EVALUATION === "1"` (flag chỉ tồn tại trong host do `eve eval` tự boot) để evals chạy
 * được — xem JSDoc của hàm đó cho lý do vì sao vẫn fail-closed.
 */

import { AccountStatus, CompanyRole, CompanyRoleLabel, SUPER_ROLES } from "@megawin/identity/entities";
import { type AuthFn, localDev, vercelOidc } from "eve/channels/auth";
import { defaultEveAuth, eveChannel } from "eve/channels/eve";

import { resolveAuthSession } from "@/lib/auth-session";

/**
 * Principal đã verify của một request `/eve/v1/*`.
 *
 * Derive từ `defaultEveAuth` vì eve KHÔNG export public type `SessionAuthContext` (nó nằm ở
 * `#channel/types.js`, subpath internal) — `ReturnType` là cách duy nhất tham chiếu đúng shape
 * mà không copy tay rồi lệch khi eve nâng cấp.
 */
type EveAuth = NonNullable<ReturnType<typeof defaultEveAuth>>;

/**
 * Nhãn role tra theo string thô của attribute.
 *
 * Khai `Record<string, string>` (không phải `Record<CompanyRole, string>`) để tra bằng string
 * không cần cast: `attributes.roles` là `readonly string[]` với eve, còn `CompanyRoleLabel` chỉ
 * nhận khoá `CompanyRole`. Role lạ (agent/player — không tới được đây, xem `appSession`) rơi về
 * chính giá trị thô thay vì `undefined`.
 */
const ROLE_LABELS: Record<string, string> = CompanyRoleLabel;

/**
 * Verify session better-auth cho request tới `/eve/v1/*`.
 *
 * Reject (trả `null` → skip, hoặc throw để trả status cụ thể):
 * - Chưa đăng nhập → skip (rơi xuống entry sau, cuối cùng 401).
 * - Account suspended → skip (không cho vào, coi như chưa auth — không rò trạng thái account
 *   qua status code khác 401 cho caller chưa xác thực).
 * - Không có role `CompanyRole.Staff` (Admin bypass qua `SUPER_ROLES`) → skip.
 *
 * Pass → trả `SessionAuthContext`, đính accountId/roles vào `ctx.session.auth` cho tool đọc và
 * cho {@link staffContext} dựng dòng context gửi model.
 */
function appSession(): AuthFn<Request> {
  return async (request) => {
    const session = await resolveAuthSession(request.headers);
    if (!session) {
      return null;
    }

    const { user } = session;

    if (user.accountStatus === AccountStatus.Suspended) {
      return null;
    }

    const hasSuperRole = SUPER_ROLES.some((r) => user.roles.includes(r));
    const hasStaffRole = user.roles.includes(CompanyRole.Staff);
    if (!hasSuperRole && !hasStaffRole) {
      return null;
    }

    return {
      authenticator: "app",
      principalId: user.accountId,
      principalType: "user",
      attributes: {
        email: user.email,
        // `name` đính thêm (17/08) CHỈ để `staffContext` gọi staff bằng tên thật khi có; auth
        // không dùng field này.
        name: user.name,
        username: user.username,
        roles: user.roles,
        accountStatus: user.accountStatus,
      },
    };
  };
}

/**
 * Bypass auth CHỈ cho host mà `eve eval` tự boot — để evals tool-choice chạy được mà không cần
 * cookie staff thật (eval client local KHÔNG gửi header auth nào: `resolveEvalClientOptions`
 * trả `{ host }` trần khi target `kind === "local"`).
 *
 * Gate KÉP, fail-closed — cả hai điều kiện phải đúng mới authenticate:
 *
 * 1. `EVE_EVALUATION === "1"` — flag do CHÍNH `eve eval` set trong process của host nó boot
 *    (xem `dist/src/evals/cli/eval.js`), KHÔNG phải giá trị ta tự bịa. `pnpm dev` thường và
 *    production KHÔNG có flag này → bypass bất hoạt, staff vẫn phải đăng nhập thật (giữ nguyên
 *    quyết định "KHÔNG dùng localDev() trần" ở header file).
 * 2. `localDev()` của eve xác nhận đang ở môi trường dev local (`EVE_DEV`/`vercel dev`) —
 *    nếu ai đó lỡ set `EVE_EVALUATION=1` trên deployment production, điều kiện này trả `null`
 *    → vẫn 401. Không lớp nào dựa vào niềm tin đơn lẻ.
 *
 * Principal trả về là `local-dev` (authenticator `"local-dev"`, không phải `"app"`) →
 * {@link staffContext} bỏ qua, không bịa danh tính staff cho phiên eval.
 */
function evalBypass(): AuthFn<Request> {
  const localDevAuth = localDev();
  return (request) => {
    if (process.env.EVE_EVALUATION !== "1") {
      return null;
    }
    return localDevAuth(request);
  };
}

/** Đọc attribute dạng string; `attributes` cho phép `readonly string[]` nên phải hẹp kiểu. */
function readAttribute(attributes: EveAuth["attributes"], key: string): string | undefined {
  const value = attributes[key];
  return typeof value === "string" && value !== "" ? value : undefined;
}

/** Nhãn tiếng Việt của role; role ngoài `CompanyRole` (agent/player) không tới được đây (§appSession). */
function roleLabels(attributes: EveAuth["attributes"]): string | undefined {
  const raw = attributes.roles;
  const roles = typeof raw === "string" ? [raw] : (raw ?? []);
  const labels = roles.map((role) => ROLE_LABELS[role] ?? role);
  return labels.length > 0 ? labels.join(", ") : undefined;
}

/**
 * Dòng context mô tả staff đang chat, prepend vào MỖI turn (`onMessage` → `context`).
 *
 * VÌ SAO Ở SERVER, KHÔNG Ở `clientContext`: `clientContext` do browser tự khai trong `prepareSend`
 * — staff sửa được bằng DevTools, nên KHÔNG dùng nó cho danh tính (agent sẽ gọi sai tên, và nếu
 * sau này có tool ghi/tra theo accountId thì đó là lỗ hổng impersonation). Ở đây dữ liệu lấy từ
 * `SessionAuthContext` mà `appSession()` vừa verify bằng cookie better-auth → không giả mạo được.
 *
 * Context này KHÔNG persist vào session history của eve (mỗi turn eve chèn lại) — đúng ý muốn:
 * staff có thể đổi tên/role giữa hai turn, và hội thoại cũ không giữ snapshot danh tính cũ.
 *
 * KHÔNG đưa email vào: model không cần để gọi tên hay tra cứu, mà lại dễ bị nhắc lại trong câu
 * trả lời (rò PII vào transcript lưu ở localStorage). `accountId` thì cần — là khoá tra cứu thật
 * khi staff hỏi về chính tài khoản mình.
 */
function staffContext(auth: EveAuth | null): readonly string[] | undefined {
  // `vercelOidc()` (CLI/dev-tui) không có attributes của app — bỏ qua, đừng bịa danh tính.
  if (auth?.authenticator !== "app") {
    return undefined;
  }

  const username = readAttribute(auth.attributes, "username");
  const name = readAttribute(auth.attributes, "name");
  const roles = roleLabels(auth.attributes);

  const fields = [
    `accountId: ${auth.principalId}`,
    username === undefined ? undefined : `username: ${username}`,
    name === undefined ? undefined : `tên: ${name}`,
    roles === undefined ? undefined : `vai trò: ${roles}`,
  ].filter((field): field is string => field !== undefined);

  return [`Nhân viên đang trao đổi với bạn (đã xác thực phía máy chủ) — ${fields.join(" · ")}`];
}

export default eveChannel({
  // ⚠️ Chạy `eve eval` local: BẬT `evalBypass()` (bỏ comment dòng dưới, comment dòng sau nó), chạy
  // xong TẮT lại ngay — không commit dòng có `evalBypass()` đang bật. Quy trình đầy đủ (đọc report
  // ở `.eve/evals/`, phân loại fail) ở `.cursor/rules/eve-eval-workflow.mdc`.
  // auth: [appSession(), vercelOidc(), evalBypass()],
  auth: [appSession(), vercelOidc()],
  onMessage: (ctx) => {
    // `defaultEveAuth` = giữ nguyên principal mà route auth đã chọn; ta chỉ thêm `context`.
    const auth = defaultEveAuth(ctx);
    return { auth, context: staffContext(auth) };
  },
  
});
