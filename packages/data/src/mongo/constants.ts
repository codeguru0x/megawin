import { Pagination } from "@megawin/shared/constants/pagination";

export const Constants = {
  HardLimit: {
    Paging: {
      Size: Pagination.Max.Size,
      Page: Pagination.Max.Page,
    },

    MongoDBLimit: 500,
  },

  Default: {
    Paging: {
      Size: Pagination.Default.Size,
      Page: Pagination.Default.Page,
    },

    NullString: "N/A",
    EmptyString: "",
  },
};
