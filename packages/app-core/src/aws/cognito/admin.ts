import {
  AdminCreateUserCommand,
  AdminCreateUserCommandInput,
  AdminAddUserToGroupCommand,
  AdminDisableUserCommand,
  AdminEnableUserCommand,
  AdminGetUserCommand,
  AdminSetUserMFAPreferenceCommand,
  AdminSetUserMFAPreferenceCommandInput,
  AdminSetUserPasswordCommand,
  AssociateSoftwareTokenCommand,
  GetUserPoolMfaConfigCommand,
  ListUsersCommand,
  type ListUsersCommandInput,
  SetUserPoolMfaConfigCommand,
  type SetUserPoolMfaConfigCommandInput,
  type UserType,
  VerifySoftwareTokenCommand,
  AttributeType,
} from "@aws-sdk/client-cognito-identity-provider";

import { cognitoClient } from "./client";

export interface AdminCreateAccountParams {
  userPoolId: string;
  username: string;
  temporaryPassword?: string;
  email?: string;
  phoneNumber?: string;

  userAttributes?: AttributeType[] | undefined;

  /**
   * Tự động gửi email/sms mời user (theo cấu hình của pool).
   * Mặc định: true.
   */
  messageActionSuppress?: boolean;

  /**
   * Bật bắt buộc đổi mật khẩu lần đầu.
   * Mặc định: true.
   */
  requirePasswordResetOnFirstLogin?: boolean;
}

export async function adminCreateAccount(params: AdminCreateAccountParams) {
  const {
    userPoolId,
    username,
    temporaryPassword,
    email,
    phoneNumber,
    messageActionSuppress = true,
    requirePasswordResetOnFirstLogin = true,
    userAttributes = [],
  } = params;

  const input: AdminCreateUserCommandInput = {
    UserPoolId: userPoolId,
    Username: username,
    TemporaryPassword: temporaryPassword,
    UserAttributes: [
      ...(email ? [{ Name: "email", Value: email }] : []),
      ...(phoneNumber ? [{ Name: "phone_number", Value: phoneNumber }] : []),
      ...(email ? [{ Name: "email_verified", Value: "true" }] : []),
      ...userAttributes,
    ],
    MessageAction: messageActionSuppress ? "SUPPRESS" : undefined,
  };

  const result = await cognitoClient.send(new AdminCreateUserCommand(input));

  if (requirePasswordResetOnFirstLogin && result.User) {
    // Gợi ý: phía client sau khi user login lần đầu nên gọi AdminRespondToAuthChallenge
    // để đổi mật khẩu theo flow NEW_PASSWORD_REQUIRED.
  }

  return result;
}

// ============ Add user to group (role) ============

export interface AdminAddUserToGroupParams {
  userPoolId: string;
  username: string;
  groupName: string;
}

/**
 * Thêm user vào group (role) trong Cognito User Pool.
 * Dùng để gán role cho user sau khi tạo tài khoản.
 */
export async function adminAddUserToGroup(params: AdminAddUserToGroupParams) {
  const { userPoolId, username, groupName } = params;
  return cognitoClient.send(
    new AdminAddUserToGroupCommand({
      UserPoolId: userPoolId,
      Username: username,
      GroupName: groupName,
    })
  );
}

// ============ MFA ============

export interface AdminUpdateMfaParams {
  userPoolId: string;
  username: string;
  /**
   * Bật hoặc tắt MFA (SMS / TOTP).
   *
   * - true: bật MFA (PreferredMfaSetting = "SOFTWARE_TOKEN_MFA" nếu có)
   * - false: tắt MFA
   */
  enabled: boolean;
}

export async function adminUpdateMfa(params: AdminUpdateMfaParams) {
  const { userPoolId, username, enabled } = params;

  const input: AdminSetUserMFAPreferenceCommandInput = {
    UserPoolId: userPoolId,
    Username: username,
    SoftwareTokenMfaSettings: enabled
      ? {
          Enabled: true,
          PreferredMfa: true,
        }
      : {
          Enabled: false,
          PreferredMfa: false,
        },
  };

  return cognitoClient.send(new AdminSetUserMFAPreferenceCommand(input));
}

// ============ MFA – Associate & Verify Software Token (TOTP) ============

export interface AdminAssociateSoftwareTokenParams {
  /**
   * Access token của user (lấy từ auth flow).
   * Cung cấp accessToken hoặc session, không cần cả hai.
   */
  accessToken?: string;
  /**
   * Session string từ auth challenge (vd: MFA_SETUP challenge).
   */
  session?: string;
}

export interface AdminAssociateSoftwareTokenResult {
  /** Secret code dùng để setup authenticator app (QR code). */
  secretCode: string;
  /** Session để dùng cho bước VerifySoftwareToken tiếp theo. */
  session?: string;
}

/**
 * Tạo TOTP secret key cho user.
 * User dùng secret này để cài đặt trên authenticator app (Google Authenticator, Authy…).
 */
export async function adminAssociateSoftwareToken(
  params: AdminAssociateSoftwareTokenParams
): Promise<AdminAssociateSoftwareTokenResult> {
  const { accessToken, session } = params;

  const result = await cognitoClient.send(
    new AssociateSoftwareTokenCommand({
      AccessToken: accessToken,
      Session: session,
    })
  );

  return {
    secretCode: result.SecretCode!,
    session: result.Session,
  };
}

export interface AdminVerifySoftwareTokenParams {
  /** Mã TOTP 6 chữ số từ authenticator app của user. */
  userCode: string;
  /** Tên hiển thị trên authenticator app (vd: "MyApp - user@email.com"). */
  friendlyDeviceName?: string;
  accessToken?: string;
  session?: string;
}

export interface AdminVerifySoftwareTokenResult {
  status: string;
  session?: string;
}

/**
 * Xác thực mã TOTP từ authenticator app để hoàn tất đăng ký TOTP cho user.
 * Gọi sau adminAssociateSoftwareToken.
 */
export async function adminVerifySoftwareToken(
  params: AdminVerifySoftwareTokenParams
): Promise<AdminVerifySoftwareTokenResult> {
  const { userCode, friendlyDeviceName, accessToken, session } = params;

  const result = await cognitoClient.send(
    new VerifySoftwareTokenCommand({
      UserCode: userCode,
      FriendlyDeviceName: friendlyDeviceName,
      AccessToken: accessToken,
      Session: session,
    })
  );

  return {
    status: result.Status ?? "ERROR",
    session: result.Session,
  };
}

// ============ MFA – Get user MFA status ============

export interface AdminGetUserMfaStatusParams {
  userPoolId: string;
  username: string;
}

export interface AdminGetUserMfaStatusResult {
  username: string;
  enabled: boolean;
  preferredMfaSetting?: string;
  userMfaSettingList: string[];
}

/**
 * Lấy trạng thái MFA hiện tại của user.
 * Trả về preferred MFA setting và danh sách MFA đã cấu hình.
 */
export async function adminGetUserMfaStatus(
  params: AdminGetUserMfaStatusParams
): Promise<AdminGetUserMfaStatusResult> {
  const { userPoolId, username } = params;

  const result = await cognitoClient.send(
    new AdminGetUserCommand({
      UserPoolId: userPoolId,
      Username: username,
    })
  );

  const mfaSettingList = result.UserMFASettingList ?? [];

  return {
    username: result.Username!,
    enabled: mfaSettingList.length > 0,
    preferredMfaSetting: result.PreferredMfaSetting,
    userMfaSettingList: mfaSettingList,
  };
}

// ============ MFA – User Pool MFA Config ============

export interface MfaPoolConfig {
  mfaConfiguration: "OFF" | "ON" | "OPTIONAL";
  softwareTokenEnabled: boolean;
  smsEnabled: boolean;
}

/**
 * Lấy cấu hình MFA ở cấp User Pool.
 */
export async function getMfaPoolConfig(userPoolId: string): Promise<MfaPoolConfig> {
  const result = await cognitoClient.send(
    new GetUserPoolMfaConfigCommand({
      UserPoolId: userPoolId,
    })
  );

  return {
    mfaConfiguration: (result.MfaConfiguration as MfaPoolConfig["mfaConfiguration"]) ?? "OFF",
    softwareTokenEnabled: result.SoftwareTokenMfaConfiguration?.Enabled ?? false,
    smsEnabled: result.SmsMfaConfiguration !== undefined,
  };
}

export interface SetMfaPoolConfigParams {
  userPoolId: string;
  /** OFF = tắt MFA, ON = bắt buộc, OPTIONAL = tuỳ chọn cho user. */
  mfaConfiguration: "OFF" | "ON" | "OPTIONAL";
  softwareTokenEnabled?: boolean;
}

/**
 * Cấu hình MFA ở cấp User Pool.
 * Cho phép bật/tắt MFA và chọn phương thức (TOTP).
 */
export async function setMfaPoolConfig(params: SetMfaPoolConfigParams) {
  const { userPoolId, mfaConfiguration, softwareTokenEnabled = true } = params;

  const input: SetUserPoolMfaConfigCommandInput = {
    UserPoolId: userPoolId,
    MfaConfiguration: mfaConfiguration,
    SoftwareTokenMfaConfiguration: {
      Enabled: softwareTokenEnabled,
    },
  };

  return cognitoClient.send(new SetUserPoolMfaConfigCommand(input));
}

export interface AdminSetAccountStatusParams {
  userPoolId: string;
  username: string;
}

export async function adminDisableAccount(params: AdminSetAccountStatusParams) {
  const { userPoolId, username } = params;
  return cognitoClient.send(
    new AdminDisableUserCommand({
      UserPoolId: userPoolId,
      Username: username,
    })
  );
}

export async function adminEnableAccount(params: AdminSetAccountStatusParams) {
  const { userPoolId, username } = params;
  return cognitoClient.send(
    new AdminEnableUserCommand({
      UserPoolId: userPoolId,
      Username: username,
    })
  );
}

// ============ Set user password ============

export interface AdminSetUserPasswordParams {
  userPoolId: string;
  username: string;
  password: string;
  /**
   * Nếu true, password được set là permanent (user không cần đổi lại).
   * Nếu false, password là temporary và user sẽ phải đổi khi login lần tới.
   * Mặc định: true.
   */
  permanent?: boolean;
}

/**
 * Set password cho user trong Cognito User Pool.
 * Cho phép admin chủ động đặt password mà không cần user thao tác.
 */
export async function adminSetUserPassword(
  params: AdminSetUserPasswordParams
) {
  const { userPoolId, username, password, permanent = true } = params;

  return cognitoClient.send(
    new AdminSetUserPasswordCommand({
      UserPoolId: userPoolId,
      Username: username,
      Password: password,
      Permanent: permanent,
    })
  );
}

// ============ List users ============

export interface AdminListUsersParams {
  userPoolId: string;
  /** Tối đa số users trả về (default 60, max 60). */
  limit?: number;
  /** Pagination token từ response trước. */
  paginationToken?: string;
  /** Filter expression (Cognito syntax, vd: 'status = "Enabled"'). */
  filter?: string;
}

export interface AdminListUsersResult {
  users: UserType[];
  paginationToken?: string;
}

/**
 * List users trong Cognito User Pool.
 * Trả về danh sách users + pagination token.
 */
export async function adminListUsers(
  params: AdminListUsersParams
): Promise<AdminListUsersResult> {
  const { userPoolId, limit = 60, paginationToken, filter } = params;

  const input: ListUsersCommandInput = {
    UserPoolId: userPoolId,
    Limit: limit,
    PaginationToken: paginationToken,
    Filter: filter,
  };

  const result = await cognitoClient.send(new ListUsersCommand(input));

  return {
    users: result.Users ?? [],
    paginationToken: result.PaginationToken,
  };
}
