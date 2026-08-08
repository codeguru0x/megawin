import {
  AdminCreateUserCommand,
  AdminCreateUserCommandInput,
  AdminAddUserToGroupCommand,
  AdminDisableUserCommand,
  AdminEnableUserCommand,
  AdminGetUserCommand,
  AdminInitiateAuthCommand,
  AdminRespondToAuthChallengeCommand,
  AdminSetUserMFAPreferenceCommand,
  AdminSetUserMFAPreferenceCommandInput,
  AdminSetUserPasswordCommand,
  AdminUpdateUserAttributesCommand,
  AssociateSoftwareTokenCommand,
  GetUserPoolMfaConfigCommand,
  InitiateAuthCommand,
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
    }),
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
  params: AdminAssociateSoftwareTokenParams,
): Promise<AdminAssociateSoftwareTokenResult> {
  const { accessToken, session } = params;

  const result = await cognitoClient.send(
    new AssociateSoftwareTokenCommand({
      AccessToken: accessToken,
      Session: session,
    }),
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
  params: AdminVerifySoftwareTokenParams,
): Promise<AdminVerifySoftwareTokenResult> {
  const { userCode, friendlyDeviceName, accessToken, session } = params;

  const result = await cognitoClient.send(
    new VerifySoftwareTokenCommand({
      UserCode: userCode,
      FriendlyDeviceName: friendlyDeviceName,
      AccessToken: accessToken,
      Session: session,
    }),
  );

  return {
    status: result.Status ?? "ERROR",
    session: result.Session,
  };
}

// ============ Get User ============

export interface AdminGetUserParams {
  userPoolId: string;
  username: string;
}

export async function adminGetUser(params: AdminGetUserParams): Promise<{ sub: string; attributes: AttributeType[] }> {
  const result = await cognitoClient.send(
    new AdminGetUserCommand({
      UserPoolId: params.userPoolId,
      Username: params.username,
    }),
  );

  const sub = result.UserAttributes?.find((a) => a.Name === "sub")?.Value ?? "";
  return { sub, attributes: result.UserAttributes ?? [] };
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
export async function adminGetUserMfaStatus(params: AdminGetUserMfaStatusParams): Promise<AdminGetUserMfaStatusResult> {
  const { userPoolId, username } = params;

  const result = await cognitoClient.send(
    new AdminGetUserCommand({
      UserPoolId: userPoolId,
      Username: username,
    }),
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
    }),
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
    }),
  );
}

export async function adminEnableAccount(params: AdminSetAccountStatusParams) {
  const { userPoolId, username } = params;
  return cognitoClient.send(
    new AdminEnableUserCommand({
      UserPoolId: userPoolId,
      Username: username,
    }),
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
export async function adminSetUserPassword(params: AdminSetUserPasswordParams) {
  const { userPoolId, username, password, permanent = true } = params;

  return cognitoClient.send(
    new AdminSetUserPasswordCommand({
      UserPoolId: userPoolId,
      Username: username,
      Password: password,
      Permanent: permanent,
    }),
  );
}

// ============ List users ============

// ============ Update user attributes ============

export interface AdminUpdateUserAttributesParams {
  userPoolId: string;
  username: string;
  userAttributes: AttributeType[];
}

/**
 * Cập nhật attributes cho user trong Cognito User Pool.
 */
export async function adminUpdateUserAttributes(params: AdminUpdateUserAttributesParams) {
  const { userPoolId, username, userAttributes } = params;
  return cognitoClient.send(
    new AdminUpdateUserAttributesCommand({
      UserPoolId: userPoolId,
      Username: username,
      UserAttributes: userAttributes,
    }),
  );
}

// ============ Admin Initiate Auth ============

export interface AdminInitiateAuthParams {
  userPoolId: string;
  clientId: string;
  username: string;
  password: string;
}

export interface AdminInitiateAuthResult {
  accessToken: string;
  idToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: string;
}

/**
 * Khởi tạo auth flow ADMIN_NO_SRP_AUTH cho user.
 * Dùng khi hệ thống tự authenticate user (server-side) mà không cần SRP.
 */
export async function adminInitiateAuth(params: AdminInitiateAuthParams): Promise<AdminInitiateAuthResult> {
  const { userPoolId, clientId, username, password } = params;

  const result = await cognitoClient.send(
    new AdminInitiateAuthCommand({
      UserPoolId: userPoolId,
      ClientId: clientId,
      AuthFlow: "ADMIN_NO_SRP_AUTH",
      AuthParameters: {
        USERNAME: username,
        PASSWORD: password,
      },
    }),
  );

  if (!result.AuthenticationResult) {
    throw new Error(
      result.ChallengeName
        ? `Auth challenge required: ${result.ChallengeName}`
        : "Authentication failed: no result returned",
    );
  }

  const auth = result.AuthenticationResult;
  return {
    accessToken: auth.AccessToken!,
    idToken: auth.IdToken!,
    refreshToken: auth.RefreshToken!,
    expiresIn: auth.ExpiresIn ?? 3600,
    tokenType: auth.TokenType ?? "Bearer",
  };
}

export interface AdminInitiateAuthWithMfaParams {
  userPoolId: string;
  clientId: string;
  username: string;
  password: string;
  /** Mã TOTP 6 số — cung cấp khi user đã bật MFA để xử lý challenge SOFTWARE_TOKEN_MFA tự động. */
  totpCode?: string;
}

/**
 * Khởi tạo auth flow ADMIN_NO_SRP_AUTH và tự động xử lý challenge SOFTWARE_TOKEN_MFA.
 *
 * Khi user đã bật MFA, Cognito trả về challenge thay vì token.
 * Hàm này respond challenge với totpCode nếu được cung cấp, trả về accessToken bình thường.
 */
export async function adminInitiateAuthWithMfa(
  params: AdminInitiateAuthWithMfaParams,
): Promise<AdminInitiateAuthResult> {
  const { userPoolId, clientId, username, password, totpCode } = params;

  const result = await cognitoClient.send(
    new AdminInitiateAuthCommand({
      UserPoolId: userPoolId,
      ClientId: clientId,
      AuthFlow: "ADMIN_NO_SRP_AUTH",
      AuthParameters: {
        USERNAME: username,
        PASSWORD: password,
      },
    }),
  );

  // Không có challenge → trả về token trực tiếp (user chưa bật MFA)
  if (result.AuthenticationResult) {
    const auth = result.AuthenticationResult;
    return {
      accessToken: auth.AccessToken!,
      idToken: auth.IdToken!,
      refreshToken: auth.RefreshToken!,
      expiresIn: auth.ExpiresIn ?? 3600,
      tokenType: auth.TokenType ?? "Bearer",
    };
  }

  // Cognito yêu cầu TOTP challenge (user đã bật MFA)
  if (result.ChallengeName === "SOFTWARE_TOKEN_MFA") {
    if (!totpCode) {
      throw new Error("MFA_REQUIRED: Tài khoản đã bật MFA, cần cung cấp mã TOTP");
    }

    const challengeResult = await cognitoClient.send(
      new AdminRespondToAuthChallengeCommand({
        UserPoolId: userPoolId,
        ClientId: clientId,
        ChallengeName: "SOFTWARE_TOKEN_MFA",
        Session: result.Session,
        ChallengeResponses: {
          USERNAME: username,
          SOFTWARE_TOKEN_MFA_CODE: totpCode,
        },
      }),
    );

    if (!challengeResult.AuthenticationResult) {
      throw new Error("Authentication failed after MFA challenge");
    }

    const auth = challengeResult.AuthenticationResult;
    return {
      accessToken: auth.AccessToken!,
      idToken: auth.IdToken!,
      refreshToken: auth.RefreshToken!,
      expiresIn: auth.ExpiresIn ?? 3600,
      tokenType: auth.TokenType ?? "Bearer",
    };
  }

  throw new Error(
    result.ChallengeName
      ? `Auth challenge required: ${result.ChallengeName}`
      : "Authentication failed: no result returned",
  );
}

// ============ Change user password (verify old + set new) ============

export interface AdminChangeUserPasswordParams {
  userPoolId: string;
  clientId: string;
  username: string;
  currentPassword: string;
  newPassword: string;
}

/**
 * Đổi mật khẩu user: verify mật khẩu cũ qua AdminInitiateAuth,
 * nếu đúng thì set mật khẩu mới (permanent) qua AdminSetUserPassword.
 */
export async function adminChangeUserPassword(params: AdminChangeUserPasswordParams): Promise<void> {
  const { userPoolId, clientId, username, currentPassword, newPassword } = params;

  await adminInitiateAuth({
    userPoolId,
    clientId,
    username,
    password: currentPassword,
  });

  await adminSetUserPassword({
    userPoolId,
    username,
    password: newPassword,
    permanent: true,
  });
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
export async function adminListUsers(params: AdminListUsersParams): Promise<AdminListUsersResult> {
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

// ============ Refresh Token (client-side flow, không cần password) ============

export interface InitiateRefreshTokenParams {
  clientId: string;
  refreshToken: string;
}

export interface InitiateRefreshTokenResult {
  accessToken: string;
  idToken: string;
  expiresIn: number;
  tokenType: string;
}

/**
 * Dùng REFRESH_TOKEN_AUTH flow (InitiateAuth – không phải Admin*).
 * Flow này chỉ cần ClientId + RefreshToken, không cần UserPoolId hay password.
 */
export async function initiateRefreshToken(params: InitiateRefreshTokenParams): Promise<InitiateRefreshTokenResult> {
  const { clientId, refreshToken } = params;

  const result = await cognitoClient.send(
    new InitiateAuthCommand({
      ClientId: clientId,
      AuthFlow: "REFRESH_TOKEN_AUTH",
      AuthParameters: {
        REFRESH_TOKEN: refreshToken,
      },
    }),
  );

  if (!result.AuthenticationResult) {
    throw new Error("Refresh token failed: no authentication result returned");
  }

  const auth = result.AuthenticationResult;
  return {
    accessToken: auth.AccessToken!,
    idToken: auth.IdToken!,
    expiresIn: auth.ExpiresIn ?? 3600,
    tokenType: auth.TokenType ?? "Bearer",
  };
}
