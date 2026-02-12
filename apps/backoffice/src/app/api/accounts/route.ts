/**
 * API: POST /api/accounts – tạo company account
 *       GET  /api/accounts – list company accounts
 */

import { z } from "zod";
import { withApi } from "@/lib/api";
import {
  CreateCompanyAccountUseCase,
  ListCompanyAccountsUseCase,
} from "@megawin/identity-application/use-cases/accounts";

// ============ Schemas ============

const createAccountSchema = z.object({
  username: z.string().min(3).max(50),
  password: z.string().min(8).max(128),
  roles: z.array(z.string()).min(1),
});

const listQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(60).optional(),
  paginationToken: z.string().optional(),
});

// ============ POST – Create Company Account ============

export const POST = withApi()
  .auth({ required: true, roles: ["Admin"] })
  .body(createAccountSchema)
  .handler(async ({ body }) => {
    const useCase = new CreateCompanyAccountUseCase();
    return useCase.run(body, { successStatus: 201 });
  });

// ============ GET – List Company Accounts ============

export const GET = withApi()
  .auth({ required: true })
  .query(listQuerySchema)
  .handler(async ({ query }) => {
    const useCase = new ListCompanyAccountsUseCase();
    return useCase.run({
      limit: query.limit,
      paginationToken: query.paginationToken,
    });
  });
