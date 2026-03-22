import { z } from "zod";

export const playerAccountSchema = z.object({
  /** ID tài khoản player (ULID) — dùng làm key navigate tới player detail. */
  accountId: z.string(),
  username: z.string(),
  displayName: z.string(),
  status: z.string(),
  tenantId: z.string(),
  roles: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type PlayerAccount = z.infer<typeof playerAccountSchema>;
