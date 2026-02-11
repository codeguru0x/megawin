import {
  TenantEntity,
  TenantApp,
  TenantJwksAssertionConfig,
  TenantStatus,
} from "@megawin/identity-domain/tenants/tenant";
import { IdentityBaseRepo } from "./identity-base-repo";
import { TenantMapper } from "../mappers/tenant-mapper";

export class TenantRepository extends IdentityBaseRepo<
  TenantEntity,
  TenantMapper
> {
  constructor() {
    super({
      collName: "accounts",
      dataMapper: new TenantMapper(),
    });
  }

  /**
   * Tạo tenant mới.
   * @param tenantId - Id của tenant.
   * @param displayName - Tên của tenant.
   * @param description - Mô tả của tenant.
   * @param sso - Config của SSO.
   * @param app - Config của app.
   * @returns
   */
  public async createTenant({
    tenantId,
    displayName,
    description,
    sso,
    app,
  }: {
    tenantId: string;
    displayName: string;
    description?: string;
    sso: TenantJwksAssertionConfig;
    app: TenantApp;
  }): Promise<TenantEntity | null> {
    // tenant id là unique và lowercase
    const tenantIdLowercase = tenantId.toLowerCase();

    return await this.findOneAndUpdate(
      {
        tenantId: tenantIdLowercase,
      },
      {
        $setOnInsert: {
          displayName: displayName,
          description: description ?? "",
          // Khi mới tạo thì disable.
          status: TenantStatus.DISABLED,
          sso: {
            issuer: tenantIdLowercase,
            jwksUrl: sso.jwksUrl,
            clockSkewSec: sso.clockSkewSec ?? 5,
            maxTtlSec: sso.maxTtlSec ?? 120,
            replayWindowSec: sso.replayWindowSec ?? 300,
          },
          app: {
            allowedOrigins: app.allowedOrigins,
          },
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
   * Lấy tenant theo Id.
   * @param tenantId - Id của tenant.
   * @param projection - Projection của tenant.
   * @returns
   */
  public async getTenantById(
    tenantId: string,
    projection?: object
  ): Promise<TenantEntity | null> {
    return await this.findOne(
      {
        tenantId: tenantId,
      },
      {
        projection: projection,
      }
    );
  }

  /**
   * Lấy tất cả tenants.
   * @param projection - Projection của tenants.
   * @returns
   */
  public async getAllTenants(projection?: object): Promise<TenantEntity[]> {
    return await this.findAll({
      projection: projection,
      sort: {
        tenantId: 1,
      },
    });
  }
}
