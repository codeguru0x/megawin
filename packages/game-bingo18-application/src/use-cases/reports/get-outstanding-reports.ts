import { NextApiUseCase } from "@megawin/next/server";
import { OutstandingReportRepository } from "../../infras/repos/outstanding-report-repo";
import type { GetOutstandingReportsOutput } from "./types";

export class GetOutstandingReportsUseCase extends NextApiUseCase<
  Record<string, never>,
  GetOutstandingReportsOutput
> {
  private readonly repo = new OutstandingReportRepository();
  protected async execute(): Promise<GetOutstandingReportsOutput> {
    return { data: await this.repo.findAll() };
  }
}
