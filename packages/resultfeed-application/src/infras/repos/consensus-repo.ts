/**
 * ResultFeed – Consensus Repository
 *
 * Collection: `consensus`. 1 doc/(game × kỳ) — kết quả cuối core PULL.
 *
 * `version` là optimistic lock chống 2 tick worker ghi đè nhau (§4.4 data-model plan). Mọi
 * method ghi quyết định máy đều nhận `expectedVersion` và chỉ thành công khi khớp.
 *
 * `setHumanVerified` là method DUY NHẤT được phép ghi `humanVerify` — tách riêng khỏi
 * `applyMachineDecision` để không thể vô tình lẫn write path máy vào field này (grep để audit).
 */

import type { CursorPage } from "@megawin/data/mongo";
import { docPath } from "@megawin/data/mongo";
import type {
  ConflictPolicy,
  ConsensusAgreement,
  ConsensusDoc,
  ConsensusEntity,
  ConsensusHumanVerify,
  ResultFeedGameKey,
} from "@megawin/resultfeed/entities";
import { ConsensusState, DecidedBy } from "@megawin/resultfeed/entities";
import type { AnyBulkWriteOperation, BulkWriteResult, Document, Filter } from "mongodb";
import { ObjectId } from "mongodb";

import { ConsensusMapper } from "../mappers/consensus-mapper";
import { BaseRepo } from "./base-repo";

const f = docPath<ConsensusDoc>();

/** Input cho quyết định của MÁY — KHÔNG có `humanVerify`, không thể lẫn write path người vào đây. */
export interface MachineDecisionInput {
  state: (typeof ConsensusState)["Pending"] | (typeof ConsensusState)["Agreed"] | (typeof ConsensusState)["Conflict"];
  numbers: string[] | null;
  payoutHash: string | null;
  displayHash: string | null;
  agreeing: ConsensusAgreement[];
  conflicting: ConsensusAgreement[];
  appliedPolicy: ConflictPolicy;
  publishedAt: Date | null;
}

/** Cursor cho `findByStateWithCursor` — compound `(updatedAt, _id)`, mới nhất trước. */
export interface ConsensusListCursor {
  updatedAt: Date;
  id: string;
}

/** 1 trang list consensus cho trang vận hành (`review`/`dashboard`) — cursor opaque HTTP-safe. */
export type ConsensusListPage = CursorPage<ConsensusEntity, { updatedAt: string; id: string }>;

export class ConsensusRepository extends BaseRepo<ConsensusEntity, ConsensusMapper> {
  constructor() {
    super({ collName: "consensus", dataMapper: new ConsensusMapper() });
  }

  /** 1 kỳ đúng 1 doc — khớp unique index `{gameKey, drawPeriod}`. */
  async findByGameKeyAndPeriod(gameKey: ResultFeedGameKey, drawPeriod: string): Promise<ConsensusEntity | null> {
    return await this.findOne({
      [f("gameKey")]: gameKey,
      [f("drawPeriod")]: drawPeriod,
    });
  }

  /**
   * Đảm bảo có doc `pending` cho 1 game × kỳ (tạo mới nếu chưa có) — idempotent, KHÔNG ghi đè
   * doc đã tồn tại (kể cả đang pending) để không làm mất `version` hiện có.
   *
   * `defaultPolicy` chỉ là giá trị KHỞI TẠO cho field bắt buộc `appliedPolicy` — pending nghĩa
   * là chưa có quyết định nào áp dụng thật, field này sẽ được `applyMachineDecision` ghi lại
   * giá trị chính xác lúc quyết định (03-consensus plan).
   */
  async ensurePendingDoc(
    gameKey: ResultFeedGameKey,
    drawPeriod: string,
    drawDateSource: string,
    defaultPolicy: ConflictPolicy,
  ): Promise<void> {
    const now = new Date();
    await this.updateOne(
      { [f("gameKey")]: gameKey, [f("drawPeriod")]: drawPeriod },
      {
        $setOnInsert: {
          [f("drawDateSource")]: drawDateSource,
          [f("state")]: ConsensusState.Pending,
          [f("numbers")]: null,
          [f("payoutHash")]: null,
          [f("displayHash")]: null,
          [f("agreeing")]: [],
          [f("conflicting")]: [],
          [f("decidedBy")]: null,
          [f("decidedAt")]: null,
          [f("appliedPolicy")]: defaultPolicy,
          [f("humanVerify")]: null,
          [f("publishedAt")]: null,
          [f("version")]: 0,
          [f("createdAt")]: now,
          [f("updatedAt")]: now,
        },
      },
      { upsert: true },
    );
  }

  /**
   * Áp quyết định của MÁY — optimistic lock: chỉ ghi khi `version` hiện tại khớp
   * `expectedVersion`, đồng thời state hiện tại KHÔNG phải `human_verified` (D6: máy không bao
   * giờ ghi đè người). Trả `false` nếu version lệch hoặc đã bị người verify — caller phải đọc
   * lại doc mới nhất và thử lại (không tự retry ở tầng repo, đó là quyết định của use-case).
   */
  async applyMachineDecision(id: string, expectedVersion: number, input: MachineDecisionInput): Promise<boolean> {
    if (!ObjectId.isValid(id)) {
      throw new Error("Invalid id");
    }

    return await this.updateOne(
      {
        _id: new ObjectId(id),
        [f("version")]: expectedVersion,
        [f("state")]: { $ne: ConsensusState.HumanVerified },
      },
      {
        $set: {
          [f("state")]: input.state,
          [f("numbers")]: input.numbers,
          [f("payoutHash")]: input.payoutHash,
          [f("displayHash")]: input.displayHash,
          [f("agreeing")]: input.agreeing,
          [f("conflicting")]: input.conflicting,
          [f("decidedBy")]: DecidedBy.Machine,
          [f("decidedAt")]: new Date(),
          [f("appliedPolicy")]: input.appliedPolicy,
          [f("publishedAt")]: input.publishedAt,
          [f("updatedAt")]: new Date(),
        },
        $inc: { [f("version")]: 1 },
      },
    );
  }

  /**
   * Ghi quyết định NGƯỜI verify — method DUY NHẤT được phép set `humanVerify` + state
   * `human_verified`. Không có optimistic lock theo version giống máy: người verify là quyết
   * định CUỐI CÙNG, luôn thắng bất kể version hiện tại (D6).
   */
  async setHumanVerified(
    id: string,
    input: {
      numbers: string[];
      payoutHash: string;
      displayHash: string;
      humanVerify: ConsensusHumanVerify;
    },
  ): Promise<boolean> {
    return await this.updateById(id, {
      $set: {
        [f("state")]: ConsensusState.HumanVerified,
        [f("numbers")]: input.numbers,
        [f("payoutHash")]: input.payoutHash,
        [f("displayHash")]: input.displayHash,
        [f("decidedBy")]: DecidedBy.Human,
        [f("decidedAt")]: new Date(),
        [f("humanVerify")]: input.humanVerify,
        [f("publishedAt")]: new Date(),
        [f("updatedAt")]: new Date(),
      },
      $inc: { [f("version")]: 1 },
    });
  }

  /**
   * Người kết luận dữ liệu không dùng được — state `rejected`. Cũng thuộc quyết định NGƯỜI,
   * publishedAt luôn null (không có gì để publish).
   */
  async setRejected(id: string, humanVerify: ConsensusHumanVerify): Promise<boolean> {
    return await this.updateById(id, {
      $set: {
        [f("state")]: ConsensusState.Rejected,
        [f("numbers")]: null,
        [f("payoutHash")]: null,
        [f("displayHash")]: null,
        [f("decidedBy")]: DecidedBy.Human,
        [f("decidedAt")]: new Date(),
        [f("humanVerify")]: humanVerify,
        [f("publishedAt")]: null,
        [f("updatedAt")]: new Date(),
      },
      $inc: { [f("version")]: 1 },
    });
  }

  /** Hàng đợi conflict cho người duyệt. */
  async findConflictQueue(gameKey?: ResultFeedGameKey, limit = 50): Promise<ConsensusEntity[]> {
    const filter = gameKey
      ? { [f("state")]: ConsensusState.Conflict, [f("gameKey")]: gameKey }
      : { [f("state")]: ConsensusState.Conflict };
    return await this.findMany(filter, {
      sort: { [f("drawPeriod")]: -1 },
      limit,
    });
  }

  /** Core PULL + API public: chỉ đọc bản đã publish, mới nhất trước. */
  async findPublished(gameKey: ResultFeedGameKey, limit = 50): Promise<ConsensusEntity[]> {
    return await this.findMany(
      { [f("gameKey")]: gameKey, [f("publishedAt")]: { $type: "date" } },
      { sort: { [f("publishedAt")]: -1 }, limit },
    );
  }

  /**
   * Kỳ MỚI NHẤT đã publish của 1 game — dùng để seed cursor fetch sống
   * (`scripts/seed-cursors-from-latest.ts`) bắt đầu ĐÚNG SAU kỳ đã biết (từ import lịch sử
   * hoặc từ fetch sống trước đó), không fetch lại từ đầu.
   *
   * Sort theo `drawPeriod` (chuỗi zero-pad CÙNG độ dài trong 1 game) DESC — KHÔNG dùng
   * `publishedAt` như `findPublished`: import lịch sử ghi `publishedAt = giờ chạy script`
   * (thời điểm import), không phải giờ quay số thật, nên thứ tự `publishedAt` không phản ánh
   * đúng thứ tự kỳ quay cho dữ liệu lịch sử.
   */
  async findLatestPublishedPeriod(gameKey: ResultFeedGameKey): Promise<ConsensusEntity | null> {
    const [latest] = await this.findMany(
      { [f("gameKey")]: gameKey, [f("publishedAt")]: { $type: "date" } },
      { sort: { [f("drawPeriod")]: -1 }, limit: 1 },
    );
    return latest ?? null;
  }

  /**
   * Ghi HÀNG LOẠT consensus đã CHỐT — dùng cho import dữ liệu lịch sử
   * (`06-historical-import.plan.md §3.3`). Ghi THẲNG `state=Agreed, decidedBy=Machine,
   * publishedAt=now`, KHÔNG chạy qua `ConsensusTickUseCase`/`decideConsensus` — script tự
   * tính rồi ghi thẳng, không đụng thuật toán sống dùng cho fetch real-time.
   *
   * Idempotent theo unique key `{gameKey, drawPeriod}` — `$set` full-field cho MỌI field
   * (cùng lý do `bulkUpsertObservations`: script có thể chạy lại sau khi sửa JSONL nguồn).
   * `version` SET CỨNG về `0` mỗi lần (KHÔNG `$inc` như `applyMachineDecision`) — nhánh này
   * ghi thẳng bỏ qua optimistic-lock của pipeline sống: không có writer khác cạnh tranh
   * trên các kỳ lịch sử, và set cứng giúp script idempotent tuyệt đối bất kể chạy lại bao
   * nhiêu lần (không tích luỹ version tăng dần qua mỗi lần re-run).
   *
   * `ordered: false` — 1 doc lỗi không chặn cả batch còn lại.
   */
  async bulkUpsertPublished(
    docs: Array<{
      gameKey: ResultFeedGameKey;
      drawPeriod: string;
      drawDateSource: string;
      numbers: string[];
      payoutHash: string;
      displayHash: string;
      agreeing: ConsensusAgreement[];
      appliedPolicy: ConflictPolicy;
    }>,
  ): Promise<BulkWriteResult> {
    const now = new Date();
    const operations: AnyBulkWriteOperation<Document>[] = docs.map((doc) => ({
      updateOne: {
        filter: {
          [f("gameKey")]: doc.gameKey,
          [f("drawPeriod")]: doc.drawPeriod,
        },
        update: {
          $set: {
            [f("drawDateSource")]: doc.drawDateSource,
            [f("state")]: ConsensusState.Agreed,
            [f("numbers")]: doc.numbers,
            [f("payoutHash")]: doc.payoutHash,
            [f("displayHash")]: doc.displayHash,
            [f("agreeing")]: doc.agreeing,
            [f("conflicting")]: [],
            [f("decidedBy")]: DecidedBy.Machine,
            [f("decidedAt")]: now,
            [f("appliedPolicy")]: doc.appliedPolicy,
            [f("humanVerify")]: null,
            [f("publishedAt")]: now,
            [f("version")]: 0,
            [f("updatedAt")]: now,
          },
          $setOnInsert: {
            [f("createdAt")]: now,
          },
        },
        upsert: true,
      },
    }));
    return await this.bulkWrite(operations, { ordered: false });
  }

  /**
   * List theo `state`/`gameKey` (cả hai optional), cursor-based `(updatedAt, _id)` mới nhất
   * trước — dùng cho trang vận hành (`review` khi filter khác `Conflict`, `dashboard`).
   *
   * Khác `findConflictQueue` (offset-only, luôn `state=conflict`, sort `drawPeriod`): method
   * này generic hơn — filter `state` optional (bao gồm cả `pending` để phát hiện kỳ kẹt lâu
   * không lên consensus) và trả cursor cho phân trang seek, không giới hạn `limit` cứng.
   */
  async findByStateWithCursor(
    state: ConsensusState | undefined,
    gameKey: ResultFeedGameKey | undefined,
    cursor: ConsensusListCursor | undefined,
    limit: number,
  ): Promise<ConsensusListPage> {
    const conditions: Filter<ConsensusDoc>[] = [];
    if (state) {
      conditions.push({ [f("state")]: state });
    }
    if (gameKey) {
      conditions.push({ [f("gameKey")]: gameKey });
    }
    if (cursor) {
      conditions.push({
        $or: [
          { [f("updatedAt")]: { $lt: cursor.updatedAt } },
          { [f("updatedAt")]: cursor.updatedAt, _id: { $lt: new ObjectId(cursor.id) } },
        ],
      } as Filter<ConsensusDoc>);
    }
    const filter =
      conditions.length === 0
        ? {}
        : conditions.length === 1
          ? (conditions[0] as Filter<Document>)
          : ({ $and: conditions } as Filter<Document>);

    return await this.cursorPaging(filter, {
      sort: { [f("updatedAt")]: -1, _id: -1 },
      limit,
      toCursor: (last) => ({ updatedAt: last.updatedAt.toISOString(), id: last.id }),
    });
  }

  /**
   * Đếm số doc theo từng `state` — dùng cho dashboard tổng quan. `$group` 1 query duy nhất,
   * KHÔNG chạy `count()` riêng cho mỗi state (tránh N query cho N trạng thái).
   *
   * Trả đủ mọi {@link ConsensusState} (kể cả 0) — caller không cần tự điền giá trị mặc định.
   */
  async countByState(gameKey?: ResultFeedGameKey): Promise<Record<ConsensusState, number>> {
    const match = gameKey ? { [f("gameKey")]: gameKey } : {};
    const rows = await this.aggregate([{ $match: match }, { $group: { _id: `$${f("state")}`, count: { $sum: 1 } } }]);

    const result: Record<ConsensusState, number> = {
      [ConsensusState.Pending]: 0,
      [ConsensusState.Agreed]: 0,
      [ConsensusState.Conflict]: 0,
      [ConsensusState.HumanVerified]: 0,
      [ConsensusState.Rejected]: 0,
    };
    for (const row of rows) {
      const state = row._id as ConsensusState;
      if (state in result) {
        result[state] = row.count as number;
      }
    }
    return result;
  }
}
