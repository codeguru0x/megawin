import {
  AdminCreateUserCommand,
  AdminCreateUserCommandInput,
  AdminAddUserToGroupCommand,
  AdminDisableUserCommand,
  AdminEnableUserCommand,
  AdminSetUserMFAPreferenceCommand,
  AdminSetUserMFAPreferenceCommandInput,
  ListUsersCommand,
  type ListUsersCommandInput,
  type UserType,
} from "@aws-sdk/client-cognito-identity-provider";

import { cognitoClient } from "./client";
import { COGNITO_USER_POOL_ID } from "./config";

export interface AdminCreateAccountParams {
  username: string;
  temporaryPassword?: string;
  email?: string;
  phoneNumber?: string;

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
    username,
    temporaryPassword,
    email,
    phoneNumber,
    messageActionSuppress = true,
    requirePasswordResetOnFirstLogin = true,
  } = params;

  const input: AdminCreateUserCommandInput = {
    UserPoolId: COGNITO_USER_POOL_ID,
    Username: username,
    TemporaryPassword: temporaryPassword,
    UserAttributes: [
      ...(email ? [{ Name: "email", Value: email }] : []),
      ...(phoneNumber ? [{ Name: "phone_number", Value: phoneNumber }] : []),
      ...(email ? [{ Name: "email_verified", Value: "true" }] : []),
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
  username: string;
  groupName: string;
}

/**
 * Thêm user vào group (role) trong Cognito User Pool.
 * Dùng để gán role cho user sau khi tạo tài khoản.
 */
export async function adminAddUserToGroup(
  params: AdminAddUserToGroupParams,
) {
  const { username, groupName } = params;
  return cognitoClient.send(
    new AdminAddUserToGroupCommand({
      UserPoolId: COGNITO_USER_POOL_ID,
      Username: username,
      GroupName: groupName,
    }),
  );
}

// ============ MFA ============

export interface AdminUpdateMfaParams {
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
  const { username, enabled } = params;

  const input: AdminSetUserMFAPreferenceCommandInput = {
    UserPoolId: COGNITO_USER_POOL_ID,
    Username: username,
    // Ở đây demo cho SOFTWARE_TOKEN_MFA; có thể mở rộng thêm SMS_MFA nếu cần.
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

export interface AdminSetAccountStatusParams {
  username: string;
}

export async function adminDisableAccount(params: AdminSetAccountStatusParams) {
  const { username } = params;
  return cognitoClient.send(
    new AdminDisableUserCommand({
      UserPoolId: COGNITO_USER_POOL_ID,
      Username: username,
    })
  );
}

export async function adminEnableAccount(params: AdminSetAccountStatusParams) {
  const { username } = params;
  return cognitoClient.send(
    new AdminEnableUserCommand({
      UserPoolId: COGNITO_USER_POOL_ID,
      Username: username,
    })
  );
}

// ============ List users ============

export interface AdminListUsersParams {
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
  params: AdminListUsersParams = {},
): Promise<AdminListUsersResult> {
  const { limit = 60, paginationToken, filter } = params;

  const input: ListUsersCommandInput = {
    UserPoolId: COGNITO_USER_POOL_ID,
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
