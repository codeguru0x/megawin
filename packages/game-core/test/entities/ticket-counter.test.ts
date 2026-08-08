/**
 * Game Core – Unit test: `buildTicketNo`
 *
 * PURE — không DB, không cần quy tắc test staging chung.
 *
 * Trọng tâm: format `{PREFIX}-{YYYYMMDD}-{NNNNN}` theo rule player-sdk-jsdoc
 * (zero-padded tối thiểu 5 chữ số, prefix mapping đúng GameProduct).
 */

import { describe, expect, it } from "vitest";

import { GameProduct } from "../../src/entities/game-core.enums";
import { buildTicketNo } from "../../src/entities/ticket-counter";

describe("buildTicketNo", () => {
  it("Đúng logic — keno, seq=1 → zero-padded 5 chữ số, format {PREFIX}-{YYYYMMDD}-{NNNNN}", () => {
    expect(buildTicketNo(GameProduct.Keno, "2026-03-07", 1)).toBe("KENO-20260307-00001");
  });

  it("Đúng logic — lotto535, seq=8 → prefix L535", () => {
    expect(buildTicketNo(GameProduct.Lotto535, "2026-03-07", 8)).toBe("L535-20260307-00008");
  });

  it("Đúng logic — max3dpro, seq=4 → prefix M3DP (không nhầm với M3D của max3d)", () => {
    expect(buildTicketNo(GameProduct.Max3dpro, "2026-03-07", 4)).toBe("M3DP-20260307-00004");
    expect(buildTicketNo(GameProduct.Max3d, "2026-03-07", 4)).toBe("M3D-20260307-00004");
  });

  it("Đúng logic — date có dấu gạch ngang được strip đúng thành compact YYYYMMDD", () => {
    const ticketNo = buildTicketNo(GameProduct.Power655, "2026-12-31", 2);
    expect(ticketNo).toBe("P655-20261231-00002");
    expect(ticketNo).not.toContain("-31-"); // không còn dấu gạch trong phần date
  });

  it("Logic ngược — seq vượt quá 5 chữ số (VD 123456) → giữ nguyên độ dài, KHÔNG cắt bớt", () => {
    expect(buildTicketNo(GameProduct.Mega645, "2026-01-01", 123456)).toBe("M645-20260101-123456");
  });

  it("Logic ngược — seq = 0 vẫn pad đủ 5 chữ số", () => {
    expect(buildTicketNo(GameProduct.Bingo18, "2026-01-01", 0)).toBe("B18-20260101-00000");
  });
});
