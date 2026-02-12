/**
 * Use case: Tạo company account qua Next.js API route.
 *
 * Input: username, password, roles (đã validate bằng Zod ở route wrapper).
 * Execute: tạo user Cognito + gán groups.
 */

import { NextApiUseCase } from "@megawin/app-core/use-cases";
import { APP_ERROR_CODES, AppException, type AppError } from "@megawin/shared/errors";
import {
  adminCreateAccount,
  adminAddUserToGroup,
} from "@megawin/app-core/aws/cognito";

// ============ DTO ============

export interface CreateCompanyAccountInput {
  username: string;
  password: string;
  roles: string[];
}

export interface CreateCompanyAccountOutput {
  userId: string;
  username: string;
  roles: string[];
}

// ============ Allowed roles ============

const ALLOWED_ROLES = ["Admin", "Manager", "Staff"] as const;

// ============ Use Case ============

export class CreateCompanyAccountUseCase extends NextApiUseCase<
  CreateCompanyAccountInput,
  CreateCompanyAccountOutput
> {
  protected validate(input: CreateCompanyAccountInput): void | AppError {
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
  }

  protected async execute(
    input: CreateCompanyAccountInput,
  ): Promise<CreateCompanyAccountOutput> {
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
