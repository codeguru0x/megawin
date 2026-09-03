/**
 * ResultFeed – VerifyConsensusUseCase & RejectConsensusUseCase
 *
 * `03-consensus.plan.md §5`. Write path DUY NHẤT được phép ghi `humanVerify` +
 * `state = human_verified|rejected` — grep `setHumanVerified`/`setRejected` để xác nhận
 * KHÔNG có nơi khác gọi 2 method này của {@link ConsensusRepository}.
 *
 * Không kế thừa `UseCase<TInput,TOutput>` chung của `app-core` (đó ràng buộc `resultfeed`
 * vào `@megawin/app-core` — package độc lập core theo `00-overview.md §6`) — 2 class ở đây
 * là plain use-case tự viết, cùng convention (constructor rỗng, method `run`).
 */

import { AUDIT_ACTIONS, AuditCategory, AuditTargetType } from "@megawin/audit/entities";
import type { AuditActor } from "@megawin/audit/logger";
import { record } from "@megawin/audit/logger";
import type { ConsensusHumanVerify, ResultFeedGameKey } from "@megawin/resultfeed/entities";
import { checkIntrinsic, computeDisplayHash, computePayoutHash } from "@megawin/resultfeed/rules";
import { AppException } from "@megawin/shared/errors";

import { ConsensusRepository } from "../../infras/repos/consensus-repo";
import { ObservationRepository } from "../../infras/repos/observation-repo";

export interface VerifyConsensusInput {
  gameKey: ResultFeedGameKey;
  drawPeriod: string;
  /** Observation người chọn làm chuẩn. Null ⇔ người tự nhập số tay. */
  chosenObservationId: string | null;
  /** Số người tự nhập — CHỈ đọc khi `chosenObservationId` null. ĐÚNG thứ tự công bố. */
  manualNumbers?: string[];
  /** Bắt buộc khi nhập tay HOẶC khi kết quả khác thứ máy đang giữ. */
  note?: string;
  /**
   * Đã hỏi lại người dùng lần 2 khi `manualNumbers` lệch checksum nguồn công bố, và người
   * xác nhận "vẫn dùng số này". Không truyền/`false` mà bị lệch ⇒ use-case throw để FE hỏi
   * lại — KHÔNG âm thầm nhận (03-consensus.plan.md §5, checklist "bắt xác nhận lần hai").
   */
  confirmMismatch?: boolean;
  actor: AuditActor;
}

export interface VerifyConsensusOutput {
  id: string;
  numbers: string[];
  payoutHash: string;
  displayHash: string;
}

const MANUAL_CHECKSUM_MISMATCH_CODE = "RESULTFEED_MANUAL_CHECKSUM_MISMATCH";

export class VerifyConsensusUseCase {
  private readonly consensusRepo = new ConsensusRepository();
  private readonly observationRepo = new ObservationRepository();

  async run(input: VerifyConsensusInput): Promise<VerifyConsensusOutput> {
    const doc = await this.consensusRepo.findByGameKeyAndPeriod(input.gameKey, input.drawPeriod);
    if (!doc) {
      throw AppException.notFound(`Không tìm thấy consensus cho game=${input.gameKey}, kỳ=${input.drawPeriod}.`);
    }

    const observations = await this.observationRepo.findByGameKeyAndPeriod(input.gameKey, input.drawPeriod);
    const numbers = await this.resolveNumbers(input, observations);

    const payoutHash = computePayoutHash(input.gameKey, input.drawPeriod, numbers);
    const displayHash = computeDisplayHash(input.gameKey, input.drawPeriod, numbers);

    // "Khác thứ máy đề xuất" — so bằng payoutHash (canonical), không so numbers thô: thứ tự
    // khác nhau của CÙNG bộ số không phải là "khác kết quả" (B3, 01-data-model §... ).
    const differsFromMachine = doc.payoutHash !== null && doc.payoutHash !== payoutHash;
    const isManualEntry = input.chosenObservationId === null;
    if ((isManualEntry || differsFromMachine) && !input.note) {
      throw AppException.badRequest("Bắt buộc ghi lý do (note) khi nhập tay hoặc khi kết quả khác thứ máy đang giữ.");
    }

    const humanVerify: ConsensusHumanVerify = {
      accountId: input.actor.id,
      username: input.actor.name,
      verifiedAt: new Date(),
      note: input.note ?? null,
      chosenObservationId: input.chosenObservationId,
    };

    const ok = await this.consensusRepo.setHumanVerified(doc.id, { numbers, payoutHash, displayHash, humanVerify });
    if (!ok) {
      throw AppException.internal(`Ghi human verify thất bại cho consensus id=${doc.id} — doc không còn tồn tại.`);
    }

    this.auditVerify(input, doc.numbers, numbers);

    return { id: doc.id, numbers, payoutHash, displayHash };
  }

  /**
   * Số cuối để chốt — từ observation người chọn, hoặc từ `manualNumbers` sau khi qua
   * `checkIntrinsic` đối chiếu checksum nguồn công bố (nếu có nguồn nào công bố checksum
   * cho kỳ này).
   */
  private async resolveNumbers(
    input: VerifyConsensusInput,
    observations: Awaited<ReturnType<ObservationRepository["findByGameKeyAndPeriod"]>>,
  ): Promise<string[]> {
    if (input.chosenObservationId !== null) {
      const chosen = observations.find((o) => o.id === input.chosenObservationId);
      if (!chosen) {
        throw AppException.notFound(
          `Observation ${input.chosenObservationId} không tồn tại hoặc không thuộc game=${input.gameKey}, kỳ=${input.drawPeriod}.`,
        );
      }
      return chosen.numbersDisplay;
    }

    if (!input.manualNumbers || input.manualNumbers.length === 0) {
      throw AppException.badRequest("Phải cung cấp `manualNumbers` khi không chọn observation nào.");
    }

    // Đối chiếu checksum nguồn công bố — lấy từ observation ĐẦU TIÊN có claimedChecksums
    // không rỗng (thường tất cả nguồn của cùng kỳ đồng thời công bố hoặc không, lấy 1 là đủ).
    const withChecksum = observations.find((o) => Object.keys(o.claimedChecksums).length > 0);
    if (withChecksum) {
      const check = checkIntrinsic(input.gameKey, input.manualNumbers, withChecksum.claimedChecksums);
      if (check.mismatch && !input.confirmMismatch) {
        throw new AppException(
          MANUAL_CHECKSUM_MISMATCH_CODE,
          `Số nhập tay lệch checksum nguồn công bố: ${check.mismatch} Xác nhận lại (confirmMismatch=true) nếu vẫn muốn dùng số này.`,
          { statusCode: 409 },
        );
      }
    }

    return input.manualNumbers;
  }

  private auditVerify(input: VerifyConsensusInput, before: string[] | null, after: string[]): void {
    record({
      actorId: input.actor.id,
      actorType: input.actor.type,
      actorName: input.actor.name,
      actorRoles: input.actor.roles,
      tenantId: input.actor.tenantId,
      ip: input.actor.ip,
      action: AUDIT_ACTIONS.resultfeed.verifyConsensus,
      category: AuditCategory.ResultFeed,
      game: input.gameKey,
      targetType: AuditTargetType.ResultFeedConsensus,
      targetId: `${input.gameKey}:${input.drawPeriod}`,
      targetLabel: `ResultFeed ${input.gameKey} kỳ ${input.drawPeriod}`,
      changes: { before: { numbers: before }, after: { numbers: after } },
      metadata: {
        extra: {
          chosenObservationId: input.chosenObservationId ?? "",
          note: input.note ?? "",
        },
      },
    });
  }
}

export interface RejectConsensusInput {
  gameKey: ResultFeedGameKey;
  drawPeriod: string;
  /** Bắt buộc — vì sao kỳ này không dùng được (nguồn rút kết quả, kỳ bị huỷ, …). */
  note: string;
  actor: AuditActor;
}

export class RejectConsensusUseCase {
  private readonly consensusRepo = new ConsensusRepository();

  async run(input: RejectConsensusInput): Promise<{ id: string }> {
    const doc = await this.consensusRepo.findByGameKeyAndPeriod(input.gameKey, input.drawPeriod);
    if (!doc) {
      throw AppException.notFound(`Không tìm thấy consensus cho game=${input.gameKey}, kỳ=${input.drawPeriod}.`);
    }

    const humanVerify: ConsensusHumanVerify = {
      accountId: input.actor.id,
      username: input.actor.name,
      verifiedAt: new Date(),
      note: input.note,
      chosenObservationId: null,
    };

    const ok = await this.consensusRepo.setRejected(doc.id, humanVerify);
    if (!ok) {
      throw AppException.internal(`Ghi reject thất bại cho consensus id=${doc.id} — doc không còn tồn tại.`);
    }

    record({
      actorId: input.actor.id,
      actorType: input.actor.type,
      actorName: input.actor.name,
      actorRoles: input.actor.roles,
      tenantId: input.actor.tenantId,
      ip: input.actor.ip,
      action: AUDIT_ACTIONS.resultfeed.rejectConsensus,
      category: AuditCategory.ResultFeed,
      game: input.gameKey,
      targetType: AuditTargetType.ResultFeedConsensus,
      targetId: `${input.gameKey}:${input.drawPeriod}`,
      targetLabel: `ResultFeed ${input.gameKey} kỳ ${input.drawPeriod}`,
      changes: { before: { numbers: doc.numbers } },
      metadata: { extra: { note: input.note } },
    });

    return { id: doc.id };
  }
}
