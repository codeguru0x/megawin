import { AbstractReportRepository } from "@megawin/game-max3d-core/repos";

const COLLECTION_NAME = "max3dDailyReports";

export class ReportRepository extends AbstractReportRepository {
  constructor() {
    super({ collName: COLLECTION_NAME });
  }
}
