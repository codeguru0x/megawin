/**
 * PURE — không DB.
 *
 * Unit test cho checkAuthorization — hàm quyết định authorization thuần
 * (accountType/roles/accountStatus). Không verify token, không chạm DB.
 */

import { AccountStatus, AccountType, CompanyRole } from "@megawin/identity/entities";
import { APP_ERROR_CODES } from "@megawin/shared/errors";
import { describe, expect, it } from "vitest";

import type { AuthContext } from "../src/authorization-api-gateway";
import { checkAuthorization } from "../src/authorization-api-gateway";

const companyAdmin: AuthContext = {
  sub: "sub-1",
  username: "admin",
  accountId: "acc-1",
  accountStatus: AccountStatus.Active,
  roles: [CompanyRole.Admin],
  accountType: AccountType.Company,
};

describe("checkAuthorization", () => {
  it("thiếu authContext → UNAUTHORIZED", () => {
    const err = checkAuthorization(null, {});
    expect(err?.code).toBe(APP_ERROR_CODES.UNAUTHORIZED);
  });

  it("account suspended → ACCOUNT_SUSPENDED", () => {
    const err = checkAuthorization({ ...companyAdmin, accountStatus: AccountStatus.Suspended }, {});
    expect(err?.code).toBe(APP_ERROR_CODES.ACCOUNT_SUSPENDED);
  });

  it("account read_only + method ghi (POST) → ACCOUNT_READ_ONLY", () => {
    const err = checkAuthorization({ ...companyAdmin, accountStatus: AccountStatus.ReadOnly }, {}, "POST");
    expect(err?.code).toBe(APP_ERROR_CODES.ACCOUNT_READ_ONLY);
  });

  it("account read_only + method đọc (GET) → cho qua", () => {
    const err = checkAuthorization({ ...companyAdmin, accountStatus: AccountStatus.ReadOnly }, {}, "GET");
    expect(err).toBeUndefined();
  });

  it("accountType không khớp requirement → FORBIDDEN", () => {
    const err = checkAuthorization(companyAdmin, { accountType: AccountType.Player });
    expect(err?.code).toBe(APP_ERROR_CODES.FORBIDDEN);
  });

  it("đủ accountType + role → cho qua (undefined)", () => {
    const err = checkAuthorization(companyAdmin, {
      accountType: AccountType.Company,
      roles: [CompanyRole.Admin],
    });
    expect(err).toBeUndefined();
  });
});
