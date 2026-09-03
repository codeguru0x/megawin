/**
 * ResultFeed – Zod schema chung cho `/api/resultfeed/*` (trừ `/results` — API key riêng,
 * xem `08-vietlott-result-autofill.plan.md`).
 *
 * Toàn bộ parse + validate ở đây — use-case KHÔNG validate lại (`code-quality-standards.mdc`
 * §8), trừ ràng buộc phụ thuộc DB (kỳ tồn tại, state hiện tại cho phép sửa).
 */

import { decodeCursor } from "@megawin/data/mongo";
import {
  ConsensusState,
  ResultFeedGameKey,
  ResultFeedProviderId,
  ResultFeedSourceId,
  SourceRole,
} from "@megawin/resultfeed/entities";
import { Pagination } from "@megawin/shared/constants/pagination";
import { z } from "zod";

const gameKeyValues = Object.values(ResultFeedGameKey) as [ResultFeedGameKey, ...ResultFeedGameKey[]];
const consensusStateValues = Object.values(ConsensusState) as [ConsensusState, ...ConsensusState[]];
const sourceRoleValues = Object.values(SourceRole) as [SourceRole, ...SourceRole[]];
const providerIdValues = Object.values(ResultFeedProviderId) as [ResultFeedProviderId, ...ResultFeedProviderId[]];
const sourceIdValues = Object.values(ResultFeedSourceId) as [ResultFeedSourceId, ...ResultFeedSourceId[]];

/** Type-guard cursor `{ updatedAt: string; id: string }` sau JSON.parse thô. */
function isListCursorPayload(value: unknown): value is { updatedAt: string; id: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Record<string, unknown>).updatedAt === "string" &&
    typeof (value as Record<string, unknown>).id === "string"
  );
}

/**
 * Query schema cho `GET /api/resultfeed/consensus` — list filter `state`/`gameKey`,
 * cursor-based `(updatedAt, id)`.
 *
 * `cursor` (opaque base64url) decode ngay ở schema → use-case nhận object `{ updatedAt: Date;
 * id }` sẵn sàng dùng, không đụng encoding (theo convention `listAuditLogsQuerySchema`).
 */
export const listConsensusQuerySchema = z
  .object({
    state: z.enum(consensusStateValues).optional(),
    gameKey: z.enum(gameKeyValues).optional(),
    cursor: z.string().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(Pagination.Max.Size).default(Pagination.Default.Size),
  })
  .transform(({ cursor, ...rest }) => {
    const decoded = decodeCursor(cursor, isListCursorPayload);
    if (!decoded) {
      return { ...rest, cursor: undefined };
    }
    const updatedAt = new Date(decoded.updatedAt);
    if (Number.isNaN(updatedAt.getTime())) {
      return { ...rest, cursor: undefined };
    }
    return { ...rest, cursor: { updatedAt, id: decoded.id } };
  });

/** Path params `[gameKey]/[drawPeriod]` — dùng cho detail/verify/reject. */
export const consensusPeriodParamsSchema = z.object({
  gameKey: z.enum(gameKeyValues),
  drawPeriod: z.string().min(1),
});

/** Body `POST .../verify` — mirror `VerifyConsensusInput` (trừ `gameKey`/`drawPeriod`/`actor`
 * đã lấy từ params/session). */
export const verifyConsensusSchema = z.object({
  chosenObservationId: z.string().min(1).nullable(),
  manualNumbers: z.array(z.string().min(1)).optional(),
  note: z.string().min(1).optional(),
  confirmMismatch: z.boolean().optional(),
});

/** Body `POST .../reject` — bắt buộc lý do. */
export const rejectConsensusSchema = z.object({
  note: z.string().min(1),
});

/** Query `GET /api/resultfeed/observations` — tra observation gần đây theo game. */
export const listObservationsQuerySchema = z.object({
  gameKey: z.enum(gameKeyValues),
  limit: z.coerce.number().int().min(1).max(Pagination.Max.Size).default(Pagination.Default.Size),
});

/**
 * Body `POST /api/resultfeed/sources` — upsert 1 nguồn. `sourceId` là 1 trong các giá trị đã
 * đăng ký ở {@link ResultFeedSourceId} (registry cố định, không phải chuỗi tự do) — value có
 * tồn tại thật trong DB hay không kiểm ở use-case (`findBySourceId` trả null → 404). Phần còn
 * lại mirror `SourceEditableFields`.
 */
export const updateSourceSchema = z.object({
  sourceId: z.enum(sourceIdValues),
  name: z.string().min(1),
  baseUrl: z.string().min(1),
  role: z.enum(sourceRoleValues),
  trustWeight: z.number().min(0).max(100),
  gameKeys: z.array(z.enum(gameKeyValues)).min(1),
  isEnabled: z.boolean(),
  providerId: z.enum(providerIdValues),
  parserVersion: z.string().min(1),
  requiresRender: z.boolean(),
  minIntervalMs: z.number().int().min(0),
});
