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
    /**
     * DB shared/infra — lock toàn cục (`worker_locks`) và mọi thứ cross-cutting
     * không thuộc game/identity/report. Giữ nguyên tên cũ.
     */
    DbName: "megawin",
    /** Database name mặc định để cung cấp dữ liệu từ megawin cho tenant tách biệt khỏi dữ liệu chung */
    MegawinTenantDbName: "megawin-tenant",
    /** DB game OLTP — tất cả `{game}_*` + counters/sequence (ticket_counters, entry_change_seq). */
    GameDbName: "megawin-game",
    /** DB identity — `accounts`, `tenants`. Critical path auth. */
    IdentityDbName: "megawin-identity",
    /** DB report 2 tầng — ghi từ pipeline settle/void, đọc cho dashboard. */
    ReportDbName: "megawin-report",
    /** DB audit log — fire-and-forget, TTL. (Triển khai ở plan riêng.) */
    AuditDbName: "megawin-audit",
    /** DB sản phẩm ResultFeed — thu thập/đồng thuận kết quả xổ số từ nhiều nguồn. Cùng cluster core. */
    ResultFeedDbName: "megawin-resultfeed",

    Paging: {
      Size: Pagination.Default.Size,
      Page: Pagination.Default.Page,
    },

    NullString: "N/A",
    EmptyString: "",
  },
};
