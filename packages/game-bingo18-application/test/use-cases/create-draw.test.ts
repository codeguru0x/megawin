// PURE — không DB. Mock DrawCounterRepository + DrawRepository + GetGlobalConfigUseCase
// (test-data-safety.mdc §1: "Cách đơn giản nhất để an toàn tuyệt đối: MOCK DB") — chỉ verify
// logic group-theo-ngày + gán drawNo từ atomic counter + validate config-driven của
// CreateDrawUseCase, không chạm DB test (staging thật).

import { BINGO18_CREATE_DRAW_BATCH_MAX } from "@megawin/game-bingo18/schemas";
import { MAX_DRAW_NO_PER_DAY } from "@megawin/shared/constants";
import { addDays, formatVNDate, todayVN } from "@megawin/shared/utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getNextDrawNoBatchMock, createDrawsMock, getGlobalConfigMock } = vi.hoisted(() => ({
  getNextDrawNoBatchMock: vi.fn<(drawDate: string, count: number) => Promise<number>>(),
  createDrawsMock: vi.fn<(docs: unknown[]) => Promise<number>>(),
  getGlobalConfigMock: vi.fn(),
}));

// mockImplementation phải là function thường (KHÔNG arrow) — mock class được `new` qua
// Reflect.construct, arrow function không có [[Construct]] nên sẽ throw "not a constructor".
vi.mock("../../src/infras/repos/draw-counter-repo", () => ({
  DrawCounterRepository: vi.fn().mockImplementation(function DrawCounterRepositoryMock() {
    return { getNextDrawNoBatch: getNextDrawNoBatchMock };
  }),
}));

vi.mock("../../src/infras/repos/draw-repo", () => ({
  DrawRepository: vi.fn().mockImplementation(function DrawRepositoryMock() {
    return { createDraws: createDrawsMock };
  }),
}));

vi.mock("../../src/use-cases/game-config/get-global-config", () => ({
  GetGlobalConfigUseCase: vi.fn().mockImplementation(function GetGlobalConfigUseCaseMock() {
    return { run: getGlobalConfigMock };
  }),
}));

const { CreateDrawUseCase } = await import("../../src/use-cases/draws/create-draw");

/** Hôm nay / hôm sau (giờ VN) — mốc để test guard "không tạo kỳ ngày đã qua". */
const TODAY = todayVN();
const TOMORROW = formatVNDate(addDays(new Date(), 1));
const YESTERDAY = formatVNDate(addDays(new Date(), -1));

/** Lịch mặc định thật của Bingo18 (06:06–21:53, mỗi 6 phút) → 158 kỳ/ngày. */
const DEFAULT_PLAY_CONFIG = {
  salesCloseBeforeSeconds: 30,
  drawIntervalMinutes: 6,
  firstDrawTime: "06:06",
  lastDrawTime: "21:53",
};

/**
 * Mô phỏng atomic counter thật ($inc + upsert): giữ state per-drawDate trong Map,
 * mỗi lần gọi cộng thêm `count` rồi trả về drawNo ĐẦU TIÊN của batch — đúng hành vi
 * `getNextDrawNoBatch` thật trong draw-counter-repo.ts.
 */
function makeStatefulCounter() {
  const state = new Map<string, number>();
  return async (drawDate: string, count: number): Promise<number> => {
    const last = state.get(drawDate) ?? 0;
    const newLast = last + count;
    state.set(drawDate, newLast);
    return newLast - count + 1;
  };
}

function buildInput(items: Array<{ drawDate: string; drawTime: string; openNow?: boolean }>): {
  draws: Array<{ drawDate: string; drawTime: string; openNow: boolean }>;
} {
  return {
    draws: items.map((i) => ({ drawDate: i.drawDate, drawTime: i.drawTime, openNow: i.openNow ?? false })),
  };
}

describe("CreateDrawUseCase (Bingo18) – server-side drawNo qua atomic counter", () => {
  beforeEach(() => {
    getNextDrawNoBatchMock.mockReset();
    createDrawsMock.mockReset();
    createDrawsMock.mockImplementation(async (docs) => docs.length);
    getGlobalConfigMock.mockReset();
    getGlobalConfigMock.mockResolvedValue({ play: DEFAULT_PLAY_CONFIG });
  });

  it("batch 1 ngày (hôm nay): drawNo liên tục từ counter, gọi counter đúng 1 lần với count = số kỳ", async () => {
    getNextDrawNoBatchMock.mockImplementation(makeStatefulCounter());

    const useCase = new CreateDrawUseCase();
    const output = await useCase.run(
      buildInput([
        { drawDate: TODAY, drawTime: `${TODAY}T08:00:00+07:00` },
        { drawDate: TODAY, drawTime: `${TODAY}T08:08:00+07:00` },
        { drawDate: TODAY, drawTime: `${TODAY}T08:16:00+07:00` },
      ]),
    );

    expect(getNextDrawNoBatchMock).toHaveBeenCalledTimes(1);
    expect(getNextDrawNoBatchMock).toHaveBeenCalledWith(TODAY, 3);
    expect(output.draws.map((d) => d.drawNo)).toEqual([1, 2, 3]);
    expect(output.draws.every((d) => d.drawDate === TODAY)).toBe(true);
  });

  it("ghi DB đúng 1 LẦN cho cả lô (transaction all-or-nothing), không loop insert từng kỳ", async () => {
    getNextDrawNoBatchMock.mockImplementation(makeStatefulCounter());

    const useCase = new CreateDrawUseCase();
    await useCase.run(
      buildInput([
        { drawDate: TODAY, drawTime: `${TODAY}T08:00:00+07:00` },
        { drawDate: TODAY, drawTime: `${TODAY}T08:08:00+07:00` },
        { drawDate: TOMORROW, drawTime: `${TOMORROW}T08:00:00+07:00` },
      ]),
    );

    // 3 kỳ trải 2 ngày nhưng CHỈ 1 lệnh ghi — đúng thiết kế bulkWrite trong transaction.
    expect(createDrawsMock).toHaveBeenCalledTimes(1);
    const docs = createDrawsMock.mock.calls[0]?.[0] as Array<{ drawId: string }>;
    expect(docs).toHaveLength(3);
    // Không có phần tử rỗng (sparse array) — mọi index đều đã được điền.
    expect(docs.every((d) => typeof d?.drawId === "string")).toBe(true);
  });

  it("batch nhiều ngày (hôm nay + hôm sau): mỗi ngày gọi counter riêng, drawNo độc lập theo từng ngày", async () => {
    getNextDrawNoBatchMock.mockImplementation(makeStatefulCounter());

    const useCase = new CreateDrawUseCase();
    const output = await useCase.run(
      buildInput([
        { drawDate: TODAY, drawTime: `${TODAY}T08:00:00+07:00` },
        { drawDate: TODAY, drawTime: `${TODAY}T08:08:00+07:00` },
        { drawDate: TOMORROW, drawTime: `${TOMORROW}T08:00:00+07:00` },
      ]),
    );

    expect(getNextDrawNoBatchMock).toHaveBeenCalledTimes(2);
    expect(getNextDrawNoBatchMock).toHaveBeenCalledWith(TODAY, 2);
    expect(getNextDrawNoBatchMock).toHaveBeenCalledWith(TOMORROW, 1);

    // Thứ tự output PHẢI khớp thứ tự input (index-preserved) dù xử lý group theo ngày bên trong.
    expect(output.draws.map((d) => ({ drawDate: d.drawDate, drawNo: d.drawNo }))).toEqual([
      { drawDate: TODAY, drawNo: 1 },
      { drawDate: TODAY, drawNo: 2 },
      { drawDate: TOMORROW, drawNo: 1 },
    ]);
  });

  it("2 lần gọi liên tiếp cùng ngày (giả lập race staff tạo nối tiếp): không trùng, nối tiếp counter cũ", async () => {
    getNextDrawNoBatchMock.mockImplementation(makeStatefulCounter());
    const useCase = new CreateDrawUseCase();

    const first = await useCase.run(
      buildInput([
        { drawDate: TODAY, drawTime: `${TODAY}T08:00:00+07:00` },
        { drawDate: TODAY, drawTime: `${TODAY}T08:08:00+07:00` },
      ]),
    );
    expect(first.draws.map((d) => d.drawNo)).toEqual([1, 2]);

    const second = await useCase.run(
      buildInput([
        { drawDate: TODAY, drawTime: `${TODAY}T08:16:00+07:00` },
        { drawDate: TODAY, drawTime: `${TODAY}T08:24:00+07:00` },
      ]),
    );
    // Nối tiếp từ counter đã bị lần gọi đầu tăng lên — không nhảy cóc, không trùng lần đầu.
    expect(second.draws.map((d) => d.drawNo)).toEqual([3, 4]);
  });

  it("drawId sinh đúng format {drawDate}.{drawNo zero-padded 3 chữ số}", async () => {
    getNextDrawNoBatchMock.mockResolvedValue(7);
    const useCase = new CreateDrawUseCase();

    const output = await useCase.run(buildInput([{ drawDate: TODAY, drawTime: `${TODAY}T08:00:00+07:00` }]));

    expect(output.draws[0]?.drawId).toBe(`${TODAY}.007`);
  });

  it("closeAt tính theo play.salesCloseBeforeSeconds từ config, KHÔNG hardcode", async () => {
    getGlobalConfigMock.mockResolvedValue({ play: { ...DEFAULT_PLAY_CONFIG, salesCloseBeforeSeconds: 45 } });
    getNextDrawNoBatchMock.mockResolvedValue(1);
    const useCase = new CreateDrawUseCase();

    const output = await useCase.run(buildInput([{ drawDate: TODAY, drawTime: `${TODAY}T08:00:00+07:00` }]));

    const drawTime = new Date(`${TODAY}T08:00:00+07:00`);
    const expectedCloseAt = new Date(drawTime.getTime() - 45 * 1000);
    expect(output.draws[0]?.closeAt).toBe(expectedCloseAt.toISOString());
  });

  it("salesCloseBeforeSeconds = 0: closeAt = ĐÚNG giờ quay (giá trị config hợp lệ)", async () => {
    getGlobalConfigMock.mockResolvedValue({ play: { ...DEFAULT_PLAY_CONFIG, salesCloseBeforeSeconds: 0 } });
    getNextDrawNoBatchMock.mockResolvedValue(1);
    const useCase = new CreateDrawUseCase();

    const output = await useCase.run(buildInput([{ drawDate: TODAY, drawTime: `${TODAY}T08:00:00+07:00` }]));

    expect(output.draws[0]?.closeAt).toBe(new Date(`${TODAY}T08:00:00+07:00`).toISOString());
  });

  it("CHO PHÉP tạo kỳ xa hơn ngày mai (không còn chặn trần 'hôm nay hoặc hôm sau')", async () => {
    getNextDrawNoBatchMock.mockImplementation(makeStatefulCounter());
    const farDate = formatVNDate(addDays(new Date(), 7));
    const useCase = new CreateDrawUseCase();

    const output = await useCase.run(buildInput([{ drawDate: farDate, drawTime: `${farDate}T08:00:00+07:00` }]));

    expect(output.draws[0]?.drawDate).toBe(farDate);
  });

  it("throw badRequest khi danh sách rỗng", async () => {
    const useCase = new CreateDrawUseCase();
    await expect(useCase.run(buildInput([]))).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(getNextDrawNoBatchMock).not.toHaveBeenCalled();
  });

  it("throw badRequest khi vượt trần BINGO18_CREATE_DRAW_BATCH_MAX", async () => {
    const useCase = new CreateDrawUseCase();
    // Slot phải KHÁC nhau để không bị guard trùng slot bắt trước guard trần.
    const items = Array.from({ length: BINGO18_CREATE_DRAW_BATCH_MAX + 1 }, (_, i) => ({
      drawDate: TODAY,
      drawTime: new Date(`${TODAY}T06:00:00+07:00`).valueOf() + i * 60_000,
    })).map((x) => ({ drawDate: x.drawDate, drawTime: new Date(x.drawTime).toISOString() }));

    await expect(useCase.run(buildInput(items))).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(getNextDrawNoBatchMock).not.toHaveBeenCalled();
  });

  it("throw badRequest khi drawDate là ngày đã qua", async () => {
    const useCase = new CreateDrawUseCase();
    await expect(
      useCase.run(buildInput([{ drawDate: YESTERDAY, drawTime: `${YESTERDAY}T08:00:00+07:00` }])),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(getNextDrawNoBatchMock).not.toHaveBeenCalled();
  });

  it("throw badRequest khi lô có 2 kỳ trùng (drawDate, drawTime) — tránh kỳ song sinh", async () => {
    const useCase = new CreateDrawUseCase();
    await expect(
      useCase.run(
        buildInput([
          { drawDate: TODAY, drawTime: `${TODAY}T08:00:00+07:00` },
          { drawDate: TODAY, drawTime: `${TODAY}T08:00:00+07:00` },
        ]),
      ),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(getNextDrawNoBatchMock).not.toHaveBeenCalled();
  });

  it("throw badRequest khi drawNo vượt trần 999/ngày (drawId 'NNN' chỉ 3 chữ số) và KHÔNG ghi DB", async () => {
    // Counter đã tiêu thụ gần hết dải: kỳ tiếp theo là 999 → lô 2 kỳ chạm 1000 → phải chặn.
    getNextDrawNoBatchMock.mockResolvedValue(MAX_DRAW_NO_PER_DAY);
    const useCase = new CreateDrawUseCase();

    await expect(
      useCase.run(
        buildInput([
          { drawDate: TODAY, drawTime: `${TODAY}T08:00:00+07:00` },
          { drawDate: TODAY, drawTime: `${TODAY}T08:06:00+07:00` },
        ]),
      ),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(createDrawsMock).not.toHaveBeenCalled();
  });

  it("throw badRequest khi drawTime không hợp lệ, không gọi counter", async () => {
    const useCase = new CreateDrawUseCase();
    await expect(useCase.run(buildInput([{ drawDate: TODAY, drawTime: "not-a-date" }]))).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    expect(getNextDrawNoBatchMock).not.toHaveBeenCalled();
  });
});
