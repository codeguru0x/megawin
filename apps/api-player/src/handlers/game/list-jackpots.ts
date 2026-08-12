/**
 * Lambda handler: GET /games/jackpots
 *
 * Endpoint GỘP cross-game — trả jackpot hiện tại của TẤT CẢ game có jackpot trong 1
 * request (thay vì gọi từng `GET /games/{game}/jackpot`). Phục vụ widget "Jackpot đang
 * tích luỹ" ở trang chủ tenant.
 *
 * Handler chỉ auth + delegate; toàn bộ orchestration/mapping nằm ở {@link ListJackpotsUseCase}.
 */

import { withPlayerAuth } from "@megawin/auth";

import { ListJackpotsUseCase } from "../../use-cases/game/list-jackpots";

const useCase = new ListJackpotsUseCase();

export const handler = withPlayerAuth(async () => useCase.run());
