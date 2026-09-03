/**
 * ResultFeed – Consensus Decision (pure)
 *
 * `03-consensus.plan.md §3` — thuật toán quyết định state cho 1 (game × kỳ) từ danh sách
 * observation. Đây là hàm PURE: không đọc DB, không biết `version`/optimistic-lock (đó là
 * việc của repo/use-case) — chỉ nhận observation đã lọc sẵn `IntrinsicState.Failed` (B4) và
 * trả về quyết định. Tách pure ra khỏi use-case để test được bằng bảng input/output thuần,
 * không cần mock DB.
 *
 * ⚠️ Bước 0 (chặn `HumanVerified`/`Rejected`) KHÔNG nằm ở đây — đó là việc của
 * `ConsensusRepository.applyMachineDecision` (filter `state != human_verified`) và
 * `ConsensusTickUseCase` (đọc doc, thấy state chặn thì thoát trước khi gọi hàm này). Hàm ở
 * đây chỉ lo bước 1-6 (nhóm theo `payoutHash`, áp policy).
 */

import type { ConsensusAgreement, ObservationEntity, SourceEntity } from "../entities";
import { ConflictPolicy, ConsensusState, IntrinsicState, SourceRole } from "../entities/enums";

/** Observation ĐÃ join với `Source` (role/trustWeight) — input của {@link decideConsensus}. */
export interface ConsensusCandidate {
  observation: ObservationEntity;
  source: SourceEntity;
}

export interface ConsensusDecision {
  state: (typeof ConsensusState)["Pending"] | (typeof ConsensusState)["Agreed"] | (typeof ConsensusState)["Conflict"];
  /** Số công bố — ĐÚNG THỨ TỰ authoritative. `null` khi không đủ điều kiện chốt (Pending/Conflict). */
  numbers: string[] | null;
  payoutHash: string | null;
  displayHash: string | null;
  agreeing: ConsensusAgreement[];
  conflicting: ConsensusAgreement[];
}

function toAgreement(candidate: ConsensusCandidate): ConsensusAgreement {
  return {
    sourceId: candidate.observation.sourceId,
    observationId: candidate.observation.id,
    role: candidate.source.role,
    trustWeight: candidate.source.trustWeight,
  };
}

/** Nhóm candidate theo `payoutHash` (B3 — so sánh CHÉO NGUỒN dùng hash đã canonical). */
function groupByPayoutHash(candidates: readonly ConsensusCandidate[]): Map<string, ConsensusCandidate[]> {
  const groups = new Map<string, ConsensusCandidate[]>();
  for (const candidate of candidates) {
    const key = candidate.observation.payoutHash;
    const group = groups.get(key);
    if (group) {
      group.push(candidate);
    } else {
      groups.set(key, [candidate]);
    }
  }
  return groups;
}

/** `true` nếu nhóm chứa ít nhất 1 nguồn `Authoritative`. */
function hasAuthoritative(group: readonly ConsensusCandidate[]): boolean {
  return group.some((c) => c.source.role === SourceRole.Authoritative);
}

/**
 * Chọn nhóm dùng làm "nhóm ứng viên" — nhóm có `payoutHash` chứa nguồn `Authoritative` (B2:
 * nguồn confirm có thể chặn nhưng không được trở thành nguồn công bố — chỉ nhóm có
 * authoritative mới đủ tư cách ứng viên). Không có nhóm nào thoả ⇒ `null` (Pending).
 *
 * Nếu có NHIỀU nhóm cùng chứa authoritative (về lý thuyết không thể — 1 nguồn chỉ có 1
 * observation/kỳ/parserVersion nên chỉ thuộc 1 nhóm `payoutHash`), lấy nhóm đầu tiên tìm
 * được — an toàn vì input `candidates` đã lọc 1 observation/nguồn ở use-case.
 */
function findCandidateGroup(groups: Map<string, ConsensusCandidate[]>): ConsensusCandidate[] | null {
  for (const group of groups.values()) {
    if (hasAuthoritative(group)) {
      return group;
    }
  }
  return null;
}

/** Numbers công bố PHẢI lấy từ observation của chính nguồn `Authoritative` (B3: ghi ra ngoài dùng `numbersDisplay` của authoritative, không phải nguồn khác dù cùng nhóm). */
function authoritativeNumbers(group: readonly ConsensusCandidate[]): {
  numbers: string[];
  payoutHash: string;
  displayHash: string;
} {
  const authoritative = group.find((c) => c.source.role === SourceRole.Authoritative);
  if (!authoritative) {
    throw new Error("findCandidateGroup đã đảm bảo group có authoritative — bất biến bị vi phạm.");
  }
  return {
    numbers: authoritative.observation.numbersDisplay,
    payoutHash: authoritative.observation.payoutHash,
    displayHash: authoritative.observation.displayHash,
  };
}

/**
 * `IntrinsicState.Passed` THẬT (không chấp nhận `NotAvailable`) của observation authoritative
 * trong nhóm ứng viên — điều kiện 1 của `AuthoritativeWins` (03 §4), và cũng là điều kiện để
 * authoritative có đủ TỰ TIN phân xử khi có nhóm khác LỆCH (`otherGroups.length > 0`):
 * `NotAvailable` nghĩa là "không có checksum nào để tự đối chiếu" — không đủ căn cứ để nói
 * "tôi đúng, nguồn kia sai" khi đang có tranh chấp thật. Dùng {@link authoritativeUsable} cho
 * case KHÔNG có tranh chấp (không ai để lệch với).
 */
function authoritativeConfident(group: readonly ConsensusCandidate[]): boolean {
  const authoritative = group.find((c) => c.source.role === SourceRole.Authoritative);
  return authoritative?.observation.intrinsicState === IntrinsicState.Passed;
}

/**
 * `IntrinsicState.Passed` HOẶC `NotAvailable` của observation authoritative — điều kiện để
 * chốt `Agreed` khi KHÔNG có nhóm nào khác lệch (không ai để tranh chấp). `NotAvailable`
 * (nguồn không tự công bố checksum nào cho kỳ này — VD file JSONL lịch sử thiếu field
 * `big_small`/`odd_even`) không phải bằng chứng "sai", chỉ là "không tự chứng minh được" —
 * khi đứng MỘT MÌNH (không ai lệch để nghi ngờ), đây vẫn là dữ liệu duy nhất và đủ để công
 * bố, đúng CÙNG tiêu chuẩn mà `import-historical-results.ts` áp dụng lúc `bulkUpsertPublished`
 * (script chỉ loại `Failed`, coi `NotAvailable` là đủ tin). Tách riêng {@link
 * authoritativeConfident} cho nhánh CÓ tranh chấp — ở đó `NotAvailable` KHÔNG đủ tự tin phân xử.
 *
 * ⚠️ Lịch sử vá lỗi (2026-09): trước khi có hàm này, MỌI đường (đơn/có tranh chấp) đều dùng
 * chung `authoritativeConfident` (yêu cầu `Passed` tuyệt đối) — khi `consensus-tick` vô tình
 * quét lại observation lịch sử Keno có `NotAvailable` (do `bulkUpsertObservations` luôn bump
 * `updatedAt` mỗi lần script `import:historical` chạy lại, dù nội dung không đổi), nó hạ cấp
 * hàng loạt kỳ đã `Agreed` (từ import) xuống `Pending` — 2 đường ghi `consensus` (script import
 * vs `decideConsensus` sống) lệch tiêu chuẩn nhau. Tách 2 hàm để đồng bộ tiêu chuẩn "đứng một
 * mình" giữa 2 đường, không đổi tiêu chuẩn "có tranh chấp" (vẫn cần `Passed` thật).
 */
function authoritativeUsable(group: readonly ConsensusCandidate[]): boolean {
  const authoritative = group.find((c) => c.source.role === SourceRole.Authoritative);
  const state = authoritative?.observation.intrinsicState;
  return state === IntrinsicState.Passed || state === IntrinsicState.NotAvailable;
}

/**
 * Quyết định state cho 1 (game × kỳ) từ observation ĐÃ LOẠI `IntrinsicState.Failed` (B4 — gọi
 * trước khi vào đây, xem JSDoc use-case).
 *
 * Thuật toán đúng theo `03-consensus.plan.md §3` bước 3-5 (đã cập nhật 2026-09 — xem JSDoc
 * {@link authoritativeUsable}):
 * 1. Không có candidate nào ⇒ `Pending` (chưa có dữ liệu).
 * 2. Nhóm theo `payoutHash`, tìm nhóm chứa `Authoritative` (B2) ⇒ không có ⇒ `Pending`.
 * 3. Không có nhóm khác lệch (bao gồm case ĐÚNG 1 nguồn duy nhất — không ai để lệch với):
 *    - Authoritative `Passed` HOẶC `NotAvailable` ({@link authoritativeUsable}) ⇒ `Agreed`.
 *    - Ngoài ra (lý thuyết không xảy ra vì B4 đã loại `Failed`) ⇒ `Pending`.
 * 4. Còn nhóm khác (`payoutHash` KHÁC nhóm ứng viên) ⇒ authoritative PHẢI `Passed` THẬT
 *    ({@link authoritativeConfident}) mới đủ tự tin phân xử — `NotAvailable` ⇒ `Pending`
 *    (không đủ căn cứ nói "tôi đúng, nguồn kia sai" khi đang tranh chấp thật). `Passed` ⇒ áp
 *    {@link ConflictPolicy}:
 *    - `HumanOnly` (mặc định) ⇒ luôn `Conflict`.
 *    - `AuthoritativeWins` ⇒ thắng nếu số nguồn phản đối không vượt `maxDissentingConfirming`.
 *    - `WeightedQuorum` ⇒ chưa implement ở G3 (throw — chỉ bật khi ≥ 3 nguồn ổn định, 03 §4).
 */
export function decideConsensus(
  candidates: readonly ConsensusCandidate[],
  policy: ConflictPolicy,
  options?: { maxDissentingConfirming?: number },
): ConsensusDecision {
  if (candidates.length === 0) {
    return {
      state: ConsensusState.Pending,
      numbers: null,
      payoutHash: null,
      displayHash: null,
      agreeing: [],
      conflicting: [],
    };
  }

  const groups = groupByPayoutHash(candidates);
  const candidateGroup = findCandidateGroup(groups);
  if (!candidateGroup) {
    // Không nhóm nào có authoritative (B2) — dù có bao nhiêu nguồn Confirming khớp nhau,
    // vẫn không đủ tư cách công bố. Ghi hết vào `conflicting` để vận hành thấy có gì đang chờ.
    return {
      state: ConsensusState.Pending,
      numbers: null,
      payoutHash: null,
      displayHash: null,
      agreeing: [],
      conflicting: candidates.map(toAgreement),
    };
  }

  const otherGroups = [...groups.values()].filter((g) => g !== candidateGroup);
  const { numbers, payoutHash, displayHash } = authoritativeNumbers(candidateGroup);
  const agreeing = candidateGroup.map(toAgreement);
  const conflicting = otherGroups.flat().map(toAgreement);

  if (otherGroups.length === 0) {
    // Không có nhóm nào khác payoutHash — bao gồm cả trường hợp ĐÚNG 1 nguồn duy nhất (không
    // ai để lệch với). `Passed` HOẶC `NotAvailable` đều đủ điều kiện chốt Agreed ở đây — xem
    // JSDoc {@link authoritativeUsable} (đồng bộ tiêu chuẩn với script import lịch sử).
    if (authoritativeUsable(candidateGroup)) {
      return { state: ConsensusState.Agreed, numbers, payoutHash, displayHash, agreeing, conflicting: [] };
    }
    return {
      state: ConsensusState.Pending,
      numbers: null,
      payoutHash: null,
      displayHash: null,
      agreeing: [],
      conflicting: [],
    };
  }

  if (!authoritativeConfident(candidateGroup)) {
    // Có nhóm khác lệch THẬT — `NotAvailable` không đủ tự tin để phân xử (xem JSDoc
    // {@link authoritativeConfident}), khác nhánh "đứng một mình" ở trên.
    return {
      state: ConsensusState.Pending,
      numbers: null,
      payoutHash: null,
      displayHash: null,
      agreeing: [],
      conflicting: candidates.filter((c) => !candidateGroup.includes(c)).map(toAgreement),
    };
  }

  switch (policy) {
    case ConflictPolicy.HumanOnly: {
      // MẶC ĐỊNH — bất kỳ lệch nào ⇒ chờ người (03 §4: nguyên nhân lệch phổ biến nhất giai
      // đoạn đầu là parser sai, không phải nguồn sai).
      return {
        state: ConsensusState.Conflict,
        numbers: null,
        payoutHash: null,
        displayHash: null,
        agreeing,
        conflicting,
      };
    }
    case ConflictPolicy.AuthoritativeWins: {
      // 3 điều kiện đồng thời (03 §4): (1) Passed đã check ở trên, (2) không cần check period ở
      // đây (đó là field của FetchPlan, không thuộc observation) — periodGap được xử lý riêng ở
      // FetchAndParseUseCase bước 7, không phải việc của consensus, (3) số nguồn Confirming
      // phản đối không vượt ngưỡng.
      const dissentingConfirming = otherGroups.flat().filter((c) => c.source.role === SourceRole.Confirming).length;
      const maxDissenting = options?.maxDissentingConfirming ?? 0;
      if (dissentingConfirming <= maxDissenting) {
        return { state: ConsensusState.Agreed, numbers, payoutHash, displayHash, agreeing, conflicting };
      }
      return {
        state: ConsensusState.Conflict,
        numbers: null,
        payoutHash: null,
        displayHash: null,
        agreeing,
        conflicting,
      };
    }
    case ConflictPolicy.WeightedQuorum: {
      // 03 §4: "Chỉ bật khi đã có ≥ 3 nguồn ổn định" — G3/G4 chưa tới ngưỡng đó, chưa cần
      // implement thật. Throw rõ ràng thay vì âm thầm rơi về 1 policy khác.
      throw new Error(
        "ConflictPolicy.WeightedQuorum chưa được implement — chỉ bật khi có ≥ 3 nguồn ổn định (03-consensus §4).",
      );
    }
    default: {
      const _exhaustive: never = policy;
      throw new Error(`Unknown ConflictPolicy: ${_exhaustive}`);
    }
  }
}
