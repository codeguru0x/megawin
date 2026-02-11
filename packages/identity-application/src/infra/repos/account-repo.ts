import { AccountMapper } from "../mappers/account-mapper";
import { IdentityBaseRepo } from "./identity-base-repo";
import {
  AccountEntity,
  AccountScope,
  AccountKind,
  AccountStatus,
} from "@megawin/identity-domain/accounts/account";
import { generateULID } from "@megawin/shared/utils/unique";
export class AccountRepository extends IdentityBaseRepo<
  AccountEntity,
  AccountMapper
> {
  constructor() {
    super({
      collName: "accounts",
      dataMapper: new AccountMapper(),
    });
  }

  /**
   * Tạo tài khoản PLAYER cho đối tác vào trong hệ thống.
   * @param externalUserId - External user id.
   * @returns Account entity.
   */
  public async findOrCreatePlayerAccount(
    username: string,
    displayName: string,
    tenantId: string,
    cognitoPoolId: string,
    cognitoSub: string,
    cognitoUsername: string
  ): Promise<AccountEntity | null> {
    return await this.findOneAndUpdate(
      {
        username: username,
      },
      {
        $setOnInsert: {
          accountId: generateULID(),
          displayName: displayName,
          kind: AccountKind.Player,
          status: AccountStatus.Active,
          scope: AccountScope.Tenant,
          tenantId: tenantId,
          cognitoPoolId: cognitoPoolId,
          cognitoSub: cognitoSub,
          cognitoUsername: cognitoUsername,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      },
      {
        upsert: true,
        returnDocument: "after",
      }
    );
  }

  /**
   * Tìm tài khoản công ty
   * @param username - Username của tài khoản của công ty.
   * @param cognitoPoolId - Id của pool Cognito.
   * @param cognitoSub - Id của user trong pool Cognito.
   * @param cognitoUsername - Username của user trong pool Cognito.
   * @returns Account entity.
   */
  public async findOrCreateCompanyAccount(
    username: string,
    cognitoPoolId: string,
    cognitoSub: string,
    cognitoUsername: string
  ): Promise<AccountEntity | null> {
    return await this.findOneAndUpdate(
      {
        username: username,
      },
      {
        $setOnInsert: {
          accountId: generateULID(),
          displayName: username,
          kind: AccountKind.Internal,
          status: AccountStatus.Active,
          scope: AccountScope.Company,
          cognitoPoolId: cognitoPoolId,
          cognitoSub: cognitoSub,
          cognitoUsername: cognitoUsername,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      },
      {
        upsert: true,
        returnDocument: "after",
      }
    );
  }

  /**
   * Tạo tài khoản cho Agent đối tác vào trong hệ thống.
   * @param username - Username của tài khoản của đối tác.
   * @param tenantId - Id của tenant.
   * @param cognitoPoolId - Id của pool Cognito.
   * @param cognitoSub - Id của user trong pool Cognito.
   * @param cognitoUsername - Username của user trong pool Cognito.
   * @returns Account entity.
   */
  public async findOrCreateAgentAccount(
    username: string,
    tenantId: string,
    cognitoPoolId: string,
    cognitoSub: string,
    cognitoUsername: string
  ): Promise<AccountEntity | null> {
    return await this.findOneAndUpdate(
      {
        username: username,
      },
      {
        $setOnInsert: {
          accountId: generateULID(),
          displayName: username,
          kind: AccountKind.Internal,
          status: AccountStatus.Active,
          scope: AccountScope.Tenant,
          tenantId: tenantId,
          cognitoPoolId: cognitoPoolId,
          cognitoSub: cognitoSub,
          cognitoUsername: cognitoUsername,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      },
      {
        upsert: true,
        returnDocument: "after",
      }
    );
  }
}
