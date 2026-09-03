/**
 * ResultFeed – Label maps cho UI backoffice (`(main)/resultfeed/*`).
 *
 * `ResultFeedGameKey` dùng CHUNG giá trị chuỗi với `GameProduct` (`@megawin/game-core`) nhưng
 * là type độc lập (boundary D7 — resultfeed không import `game-core`), nên không tái dùng
 * `GAME_LABELS` được — khai lại 1 bảng nhỏ ở đây.
 */

import type { ComponentProps } from "react";

import {
  ConsensusState,
  IntrinsicState,
  ResultFeedAlertSeverity,
  ResultFeedGameKey,
  ResultFeedProviderId,
  SourceRole,
} from "@megawin/resultfeed/entities";

import type { Badge } from "@/components/ui/badge";

export const RESULTFEED_GAME_LABELS: Record<ResultFeedGameKey, string> = {
  [ResultFeedGameKey.Keno]: "Keno",
  [ResultFeedGameKey.Bingo18]: "Bingo 18",
  [ResultFeedGameKey.Lotto535]: "Lotto 5/35",
  [ResultFeedGameKey.Mega645]: "Mega 6/45",
  [ResultFeedGameKey.Power655]: "Power 6/55",
  [ResultFeedGameKey.Max3d]: "Max 3D",
  [ResultFeedGameKey.Max3dpro]: "Max 3D Pro",
};

export const CONSENSUS_STATE_LABELS: Record<ConsensusState, string> = {
  [ConsensusState.Pending]: "Chờ dữ liệu",
  [ConsensusState.Agreed]: "Máy đồng thuận",
  [ConsensusState.Conflict]: "Lệch nguồn",
  [ConsensusState.HumanVerified]: "Người đã xác nhận",
  [ConsensusState.Rejected]: "Đã từ chối",
};

type BadgeVariant = ComponentProps<typeof Badge>["variant"];

export const CONSENSUS_STATE_VARIANT: Record<ConsensusState, BadgeVariant> = {
  [ConsensusState.Pending]: "outline",
  [ConsensusState.Agreed]: "secondary",
  [ConsensusState.Conflict]: "destructive",
  [ConsensusState.HumanVerified]: "default",
  [ConsensusState.Rejected]: "outline",
};

export const SOURCE_ROLE_LABELS: Record<SourceRole, string> = {
  [SourceRole.Authoritative]: "Chính thức",
  [SourceRole.Confirming]: "Đối chiếu",
  [SourceRole.Reference]: "Tham khảo",
};

export const INTRINSIC_STATE_LABELS: Record<IntrinsicState, string> = {
  [IntrinsicState.Pending]: "Chưa kiểm",
  [IntrinsicState.Passed]: "Khớp checksum",
  [IntrinsicState.Failed]: "Lệch checksum",
  [IntrinsicState.NotAvailable]: "Không có checksum",
};

export const INTRINSIC_STATE_VARIANT: Record<IntrinsicState, BadgeVariant> = {
  [IntrinsicState.Pending]: "outline",
  [IntrinsicState.Passed]: "secondary",
  [IntrinsicState.Failed]: "destructive",
  [IntrinsicState.NotAvailable]: "outline",
};

export const ALERT_SEVERITY_VARIANT: Record<ResultFeedAlertSeverity, BadgeVariant> = {
  [ResultFeedAlertSeverity.Info]: "outline",
  [ResultFeedAlertSeverity.Warning]: "secondary",
  [ResultFeedAlertSeverity.Critical]: "destructive",
};

export const PROVIDER_ID_LABELS: Record<ResultFeedProviderId, string> = {
  [ResultFeedProviderId.OxylabsUnblocker]: "Oxylabs (primary)",
  [ResultFeedProviderId.ContextDev]: "Context.dev (failover)",
  [ResultFeedProviderId.HistoricalImport]: "Historical import (script)",
};
