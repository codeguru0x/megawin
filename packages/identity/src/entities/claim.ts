export const ClaimKey = {
  Sub: "sub",
  Username: "cognito:username",
  TenantId: "custom:tenant_id",
  AccountType: "custom:account_type",
  AccountId: "custom:account_id",
  AccountStatus: "custom:account_status",
  Roles: "custom:roles",
} as const;

export type ClaimKey = (typeof ClaimKey)[keyof typeof ClaimKey];
