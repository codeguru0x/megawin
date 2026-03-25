import { Pagination } from "@megawin/shared/constants";

export const Constants = {
  HardLimit: {
    Paging: {
      Size: Pagination.Max.Size,
      Page: Pagination.Max.Page,
    },

    MongoDBLimit: 500,
  },

  Default: {
    /** Database name mặc định cho toàn hệ thống. Thay đổi tại đây nếu đổi tên DB. */
    DbName: "megawin",
    // Database name mặc định để cung cấp dữ liệu từ megawin cho tenant tách biệt khỏi dữ liệu chung
    MegawinTenantDbName: "megawin-tenant",

    Paging: {
      Size: Pagination.Default.Size,
      Page: Pagination.Default.Page,
    },

    NullString: "N/A",
    EmptyString: "",
  },
};
