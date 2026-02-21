import { AccountMapper } from "../mappers/account-mapper";
import { IdentityBaseRepo } from "./identity-base-repo";
import {
  type AccountEntity,
  type CompanyAccountEntity,
  type AgentAccountEntity,
  type PlayerAccountEntity,
  type CompanyRole,
  AccountType,
  AccountStatus,
  AgentRole,
  PlayerRole,
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

  public async findOrCreatePlayerAccount(
    username: string,
    displayName: string,
    tenantId: string,
    cognitoPoolId: string,
    cognitoSub: string,
    cognitoUsername: string
  ): Promise<PlayerAccountEntity | null> {
    return (await this.findOneAndUpdate(
      { username },
      {
        $setOnInsert: {
          accountId: generateULID(),
          displayName,
          type: AccountType.Player,
          roles: [PlayerRole.Player],
          status: AccountStatus.Active,
          tenantId,
          cognitoPoolId,
          cognitoSub,
          cognitoUsername,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      },
      { upsert: true, returnDocument: "after" }
    )) as PlayerAccountEntity | null;
  }

  public async findOrCreateCompanyAccount(
    username: string,
    displayName: string,
    accountType: AccountType,
    roles: CompanyRole[],
    status: AccountStatus,
    accountId: string,
    cognitoPoolId: string,
    cognitoSub: string,
    cognitoUsername: string
  ): Promise<CompanyAccountEntity | null> {
    return (await this.findOneAndUpdate(
      { username },
      {
        $setOnInsert: {
          accountId: accountId,
          displayName: displayName,
          type: accountType,
          roles,
          status: status,
          cognitoPoolId,
          cognitoSub,
          cognitoUsername,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      },
      { upsert: true, returnDocument: "after" }
    )) as CompanyAccountEntity | null;
  }

  /**
   * Find or create an agent account
   * @param username - username of the agent
   * @param displayName
   * @param roles - roles of the agent
   * @param tenantId - tenant id of the agent
   * @param cognitoPoolId - cognito pool id of the agent
   * @param cognitoSub - cognito sub of the agent
   * @param cognitoUsername - cognito username of the agent
   * @returns the agent account
   */
  public async findOrCreateAgentAccount(
    username: string,
    displayName: string,
    roles: AgentRole[],
    tenantId: string,
    cognitoPoolId: string,
    cognitoSub: string,
    cognitoUsername: string
  ): Promise<AgentAccountEntity | null> {
    return (await this.findOneAndUpdate(
      { username },
      {
        $setOnInsert: {
          accountId: generateULID(),
          displayName: displayName,
          type: AccountType.Agent,
          roles: roles,
          status: AccountStatus.Active,
          tenantId,
          cognitoPoolId,
          cognitoSub,
          cognitoUsername,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      },
      { upsert: true, returnDocument: "after" }
    )) as AgentAccountEntity | null;
  }
}
