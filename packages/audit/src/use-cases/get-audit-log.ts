/**
 * BO use case — lấy chi tiết 1 audit record theo `id`.
 *
 * Dùng cho drawer chi tiết trên trang "Lịch sử thao tác": hiển thị đầy đủ
 * `changes` (diff before/after) + `metadata` (http/worker/extra) mà list view
 * không tải. Không tìm thấy → 404.
 */

import { NextApiUseCase } from "@megawin/next/server";
import { AppException } from "@megawin/shared/errors";

import type { AuditLogEntity } from "../entities";
import { AuditLogRepository } from "../infras/repos";

/** Input lấy chi tiết audit — chỉ cần `id` (`_id` hex string). */
export interface GetAuditLogInput {
  /** `_id` Mongo dạng hex string. */
  id: string;
}

/**
 * Lấy chi tiết 1 audit record theo `_id`.
 *
 * Throw {@link AppException} `NOT_FOUND` (404) nếu id không tồn tại — record
 * audit không bao giờ bị update/delete (trừ TTL), nên miss = id sai hoặc đã hết
 * hạn 90 ngày.
 */
export class GetAuditLogUseCase extends NextApiUseCase<GetAuditLogInput, AuditLogEntity> {
  private readonly repo = new AuditLogRepository();

  protected async execute(input: GetAuditLogInput): Promise<AuditLogEntity> {
    const log = await this.repo.getById(input.id);
    if (!log) {
      throw AppException.notFound("Không tìm thấy audit log");
    }
    return log;
  }
}
