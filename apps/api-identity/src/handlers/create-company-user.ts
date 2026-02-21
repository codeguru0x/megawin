/**
 * Lambda handler: POST /accounts/company
 * Tạo tài khoản company user.
 *
 * Luồng middleware:
 * 1. authorizationMiddleware  → check auth (Company account + Staff role; Admin bypass)
 * 2. validatorZodMiddleware   → validate body bằng Zod schema
 * 3. handler                  → lấy DTO → useCase.run(dto) → ApiGatewayResponse
 * 4. httpErrorHandlerUseCaseFormat → catch error → response JSON chuẩn
 */

import middy from "@middy/core";
import { z } from "zod";

import {
  validatorZodMiddleware,
  authorizationMiddleware,
  httpErrorHandlerUseCaseFormat,
} from "@megawin/app-core/lambda/middleware";

import {
  CreateCompanyUserInput,
  CreateCompanyUserUseCase,
} from "@megawin/identity-application/use-cases/accounts";

import {
  AccountType,
  CompanyRole,
  COMPANY_ROLE_VALUES,
} from "@megawin/identity-domain/accounts/account";

// ============ Zod schema (request validation) ============

const bodySchema = z.object({
  username: z
    .string()
    .min(3, "Username must be at least 3 characters")
    .max(128),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(256),
  roles: z
    .array(z.enum(COMPANY_ROLE_VALUES as unknown as [string, ...string[]]))
    .min(1, "At least one role is required"),
});

// ============ Use case instance ============

const useCase = new CreateCompanyUserUseCase();

// ============ Handler ============

interface ValidatedEvent {
  validated: { body: z.infer<typeof bodySchema> };
  authContext?: unknown;
}

export const handler = middy(async (event: ValidatedEvent) => {
  return useCase.run(event.validated.body as CreateCompanyUserInput);
})
  .use(
    authorizationMiddleware({
      accountType: AccountType.Company,
      roles: [CompanyRole.Staff],
    })
  )
  .use(validatorZodMiddleware({ body: bodySchema }))
  .use(httpErrorHandlerUseCaseFormat());
