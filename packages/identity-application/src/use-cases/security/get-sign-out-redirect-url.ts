import { UseCase } from "@megawin/app-core/use-cases";
import { AppException } from "@megawin/shared/errors";

export interface GetSignOutRedirectUrlInput {
  /** Domain của Cognito Hosted UI, ví dụ: `auth.example.amazoncognito.com`. */
  cognitoDomain: string;
  /** App Client ID đã đăng ký với Cognito Hosted UI. */
  clientId: string;
  /**
   * URI mà Cognito redirect về sau khi terminate SSO session.
   * Phải có trong danh sách **Allowed sign-out URLs** của App Client trên Cognito Console.
   */
  logoutUri: string;
}

export interface GetSignOutRedirectUrlOutput {
  /** URL đầy đủ để redirect user sang Cognito /logout endpoint. */
  redirectUrl: string;
}

/**
 * Tạo Cognito logout URL để terminate SSO session phía Cognito sau khi user sign out.
 *
 * Cognito Hosted UI duy trì SSO session độc lập với app session — nếu không
 * terminate, user sẽ bị auto-login lại tài khoản cũ khi quay lại trang login
 * trong khi Cognito session vẫn còn hạn.
 *
 * Trong tương lai use case này có thể mở rộng thêm:
 * - Ghi audit log sign-out event
 * - Revoke Cognito refresh token
 * - Notify các service liên quan
 */
export class GetSignOutRedirectUrlUseCase extends UseCase<GetSignOutRedirectUrlInput, GetSignOutRedirectUrlOutput> {
  protected async execute(input: GetSignOutRedirectUrlInput): Promise<GetSignOutRedirectUrlOutput> {
    if (!input.cognitoDomain || !input.clientId || !input.logoutUri) {
      throw AppException.internal("Cognito sign-out configuration is missing");
    }

    // Strip protocol nếu có — nhất quán với cách better-auth Cognito provider xử lý domain.
    const cleanDomain = input.cognitoDomain.replace(/^https?:\/\//, "");

    // Build Cognito /logout endpoint URL.
    // Cognito sẽ terminate SSO session và redirect về logoutUri.
    // @see https://docs.aws.amazon.com/cognito/latest/developerguide/logout-endpoint.html
    const redirectUrl =
      `https://${cleanDomain}/logout` +
      `?client_id=${encodeURIComponent(input.clientId)}` +
      `&logout_uri=${encodeURIComponent(input.logoutUri)}`;

    return { redirectUrl };
  }
}
