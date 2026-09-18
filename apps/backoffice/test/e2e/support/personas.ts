/**
 * Persona E2E — cùng `accountType: "company"`, khác `roles` (admin vs staff).
 * Dùng chung bởi globalSetup (sinh storageState) và spec mint tại chỗ.
 */
import { CompanyRole } from "@megawin/identity/entities";

import type { Persona } from "./mint-session";

export const PERSONAS = {
  admin: {
    roles: CompanyRole.Admin,
    username: "e2e-admin",
    accountId: "e2e-admin-000000000000000000",
  },
  staff: {
    roles: CompanyRole.Staff,
    username: "e2e-staff",
    accountId: "e2e-staff-000000000000000000",
  },
} as const satisfies Record<string, Persona>;

export type PersonaKey = keyof typeof PERSONAS;
