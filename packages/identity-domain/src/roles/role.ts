export interface RoleEntity {
  id: string;
  name: string;
  description: string;
  createdAt: Date;
  updatedAt: Date;
}

export type RoleScopeType = "company" | "tenant";
