import {
  TenantEntity,
  TenantJwksAssertionConfig,
  TenantStatus,
  TenantOption,
} from "@megawin/identity/entities/tenant";
import { IdentityBaseRepo } from "./identity-base-repo";
import { TenantMapper } from "../mappers/tenant-mapper";

export class TenantRepository extends IdentityBaseRepo<
  TenantEntity,
  TenantMapper
> {
  constructor() {
    super({
      collName: "tenants",
      dataMapper: new TenantMapper(),
    });
  }

  public async createTenant({
    tenantId,
    displayName,
    description,
    apiKey,
    sso,
    callbackBaseUrl,
  }: {
    tenantId: string;
    displayName: string;
    description?: string;
    apiKey: string;
    sso: Pick<TenantJwksAssertionConfig, "jwksUrl"> &
      Partial<Pick<TenantJwksAssertionConfig, "clockSkewSec" | "maxTtlSec" | "replayWindowSec">>;
    callbackBaseUrl: string;
  }): Promise<TenantEntity | null> {
    const tenantIdLower = tenantId.toLowerCase();
    const now = new Date();

    return await this.findOneAndUpdate(
      { tenantId: tenantIdLower },
      {
        $setOnInsert: {
          displayName,
          description: description ?? "",
          status: TenantStatus.Disabled,
          apiKey,
          apiKeyLastRotatedAt: now,
          sso: {
            issuer: tenantIdLower,
            jwksUrl: sso.jwksUrl,
            clockSkewSec: sso.clockSkewSec ?? 5,
            maxTtlSec: sso.maxTtlSec ?? 120,
            replayWindowSec: sso.replayWindowSec ?? 300,
          },
          callbackBaseUrl,
          createdAt: now,
          updatedAt: now,
        },
      },
      { upsert: true, returnDocument: "after" },
    );
  }

  public async getTenantById(
    tenantId: string,
    projection?: object,
  ): Promise<TenantEntity | null> {
    return await this.findOne({ tenantId }, { projection });
  }

  public async getTenantByApiKey(
    apiKey: string,
    projection?: object,
  ): Promise<TenantEntity | null> {
    return await this.findOne({ apiKey }, { projection });
  }

  public async getAllTenants(): Promise<TenantEntity[]> {
    return await this.findAll({ sort: { createdAt: -1 } });
  }

  public async getTenantOptions(): Promise<TenantOption[]> {
    const tenants = await this.findAll({
      projection: { tenantId: 1, displayName: 1, status: 1 },
      sort: { tenantId: 1 },
    });
    return tenants.map(({ tenantId, displayName, status }) => ({
      tenantId,
      displayName,
      status,
    }));
  }

  public async updateTenantStatus(
    tenantId: string,
    status: TenantStatus,
  ): Promise<TenantEntity | null> {
    return await this.findOneAndUpdate(
      { tenantId },
      { $set: { status, updatedAt: new Date() } },
      { returnDocument: "after" },
    );
  }

  public async regenerateApiKey(
    tenantId: string,
    newApiKey: string,
  ): Promise<TenantEntity | null> {
    const now = new Date();
    return await this.findOneAndUpdate(
      { tenantId },
      {
        $set: {
          apiKey: newApiKey,
          apiKeyLastRotatedAt: now,
          updatedAt: now,
        },
      },
      { returnDocument: "after" },
    );
  }

  public async updateTenant(
    tenantId: string,
    fields: {
      displayName?: string;
      description?: string;
      jwksUrl?: string;
      callbackBaseUrl?: string;
    },
  ): Promise<TenantEntity | null> {
    const $set: Record<string, unknown> = { updatedAt: new Date() };

    if (fields.displayName !== undefined) $set.displayName = fields.displayName;
    if (fields.description !== undefined) $set.description = fields.description;
    if (fields.jwksUrl !== undefined) $set["sso.jwksUrl"] = fields.jwksUrl;
    if (fields.callbackBaseUrl !== undefined) $set.callbackBaseUrl = fields.callbackBaseUrl;

    return await this.findOneAndUpdate(
      { tenantId },
      { $set },
      { returnDocument: "after" },
    );
  }
}
