import { CompanyRole } from "@megawin/identity/entities";
import { describe, expect, it } from "vitest";

import { CreateCompanyAccountUseCase } from "../../src/use-cases/accounts/create-company-account";
import type { CreateCompanyAccountInput } from "../../src/use-cases/accounts/dto/create-company-account.dto";

class TestableUseCase extends CreateCompanyAccountUseCase {
  public runExecute(input: CreateCompanyAccountInput) {
    return this.execute(input);
  }
}

function testUsername() {
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 6);
  return `test_company_${ts}_${rand}`;
}
//staff - Test@1234@!
const TEMP_PASSWORD = "Test@1234!";

describe("CreateCompanyAccountUseCase", () => {
  const useCase = new TestableUseCase();

  it("tạo tài khoản company thành công", async () => {
    //const username = testUsername();
    const username = "Admin";
    const result = await useCase.runExecute({
      username,
      password: TEMP_PASSWORD,
      roles: [CompanyRole.Admin],
    });

    expect(result).toBeDefined();
    expect(result.userId).toBeTruthy();
    expect(result.username).toBe(username);
    expect(result.roles).toEqual([CompanyRole.Admin]);
  });
});
