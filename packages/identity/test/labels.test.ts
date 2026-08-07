/**
 * PURE — không DB.
 *
 * Smoke test kích hoạt suite cho @megawin/identity.
 * Kiểm tra các label map (const-as-const) phủ đủ mọi giá trị enum tương ứng.
 */

import { describe, it, expect } from "vitest";
import {
  AccountTypeLabel,
  AccountStatusLabel,
  CompanyRoleLabel,
  AgentRoleLabel,
  MfaStatusLabel,
} from "../src/entities/labels";

describe("identity labels", () => {
  it("AccountTypeLabel map đúng khoá → nhãn tiếng Việt", () => {
    expect(AccountTypeLabel.company).toBe("Công ty");
    expect(AccountTypeLabel.agent).toBe("Đại lý");
    expect(AccountTypeLabel.player).toBe("Người chơi");
  });

  it("AccountStatusLabel phủ đủ 3 trạng thái", () => {
    expect(Object.keys(AccountStatusLabel).sort()).toEqual(
      ["active", "read_only", "suspended"].sort(),
    );
  });

  it("Company/Agent/Mfa label không có giá trị rỗng", () => {
    for (const map of [CompanyRoleLabel, AgentRoleLabel, MfaStatusLabel]) {
      for (const label of Object.values(map)) {
        expect(label.length).toBeGreaterThan(0);
      }
    }
  });
});
