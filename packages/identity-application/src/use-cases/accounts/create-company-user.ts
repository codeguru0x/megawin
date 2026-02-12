/**
 * Use case: Tạo tài khoản company user trong AWS Cognito.
 *
 * Input DTO: username, password, roles (đã được handler validate bằng Zod).
 * Business validate: roles phải hợp lệ.
 * Execute: tạo user trong Cognito + gán groups (roles).
 */

import { ApiGatewayUseCase } from "@megawin/app-core/use-cases";
import { APP_ERROR_CODES, AppException, type AppError } from "@megawin/shared/errors";

import {
  adminCreateAccount,
  adminAddUserToGroup,
} from "@megawin/app-core/aws/cognito";

// ============ DTO ============

export interface CreateCompanyUserInput {
  username: string;
  password: string;
  roles: string[];
}

export interface CreateCompanyUserOutput {
  userId: string;
  username: string;
  roles: string[];
}

// ============ Allowed roles ============

const ALLOWED_ROLES = ["Admin", "Manager", "Staff"] as const;

// ============ Use Case ============

export class CreateCompanyUserUseCase extends ApiGatewayUseCase<
  CreateCompanyUserInput,
  CreateCompanyUserOutput
> {
  /**
   * Business validation.
   * Có thể return AppError (validate pattern) hoặc throw AppException (exception pattern).
   */
  protected validate(input: CreateCompanyUserInput): void | AppError {
    if (input.roles.length === 0) {
      return {
        code: APP_ERROR_CODES.VALIDATION,
        message: "At least one role is required",
      };
    }

    const invalidRoles = input.roles.filter(
      (r) => !ALLOWED_ROLES.includes(r as (typeof ALLOWED_ROLES)[number]),
    );
    if (invalidRoles.length > 0) {
      return {
        code: APP_ERROR_CODES.VALIDATION,
        message: `Invalid roles: ${invalidRoles.join(", ")}`,
        details: { allowedRoles: ALLOWED_ROLES, invalidRoles },
      };
    }

    return undefined;
  }

  /**
   * Tạo user trong Cognito và gán groups (roles).
   * Throw AppException nếu có lỗi business.
   */
  protected async execute(
    input: CreateCompanyUserInput,
  ): Promise<CreateCompanyUserOutput> {
    // 1. Tạo user trong Cognito
    const result = await adminCreateAccount({
      username: input.username,
      temporaryPassword: input.password,
      messageActionSuppress: true,
      requirePasswordResetOnFirstLogin: true,
    });

    if (!result.User) {
      throw AppException.internal("Failed to create user in Cognito");
    }

    const userId = result.User.Username ?? input.username;

    // 2. Gán roles (Cognito groups)
    await Promise.all(
      input.roles.map((role) =>
        adminAddUserToGroup({ username: userId, groupName: role }),
      ),
    );

    return {
      userId,
      username: input.username,
      roles: input.roles,
    };
  }
}
