/**
 * Lotto 5/35 – Unit test: `buildComboKey`
 *
 * PURE — không DB, không cần quy tắc test staging chung.
 */

import { describe, it, expect } from "vitest";
import { buildComboKey } from "../../src/rules/combo-key";

describe("buildComboKey", () => {
  it("Đúng logic — main + special chưa sort → key ổn định (giống bản đã sort)", () => {
    const unsorted = buildComboKey("standard", ["05", "01", "03", "02", "04"], ["07"]);
    const sorted = buildComboKey("standard", ["01", "02", "03", "04", "05"], ["07"]);
    expect(unsorted).toBe(sorted);
    expect(unsorted).toBe("standard:01,02,03,04,05|07");
  });

  it("Đúng logic — 2 board cùng bộ số khác thứ tự → cùng key", () => {
    const keyA = buildComboKey("mainCover", ["10", "01", "05", "20", "33", "35"], ["07"]);
    const keyB = buildComboKey("mainCover", ["35", "33", "20", "10", "05", "01"], ["07"]);
    expect(keyA).toBe(keyB);
  });

  it("Đúng logic — specialCover nhiều số ĐB → phần special sort đúng", () => {
    const key = buildComboKey(
      "specialCover",
      ["01", "02", "03", "04", "05"],
      ["12", "03", "07", "01"],
    );
    expect(key).toBe("specialCover:01,02,03,04,05|01,03,07,12");
  });

  it("Logic ngược — input KHÔNG bị mutate", () => {
    const main = ["05", "01", "03", "02", "04"];
    const special = ["07", "02"];
    const mainCopy = [...main];
    const specialCopy = [...special];

    buildComboKey("standard", main, special);

    expect(main).toEqual(mainCopy);
    expect(special).toEqual(specialCopy);
  });

  it("Logic ngược — 2 bộ số chính khác nhau 1 số → key khác nhau", () => {
    const keyA = buildComboKey("standard", ["01", "02", "03", "04", "05"], ["07"]);
    const keyB = buildComboKey("standard", ["01", "02", "03", "04", "06"], ["07"]);
    expect(keyA).not.toBe(keyB);
  });

  it("Logic ngược — main giống nhau nhưng special khác nhau → key khác nhau (chiều special có tham gia)", () => {
    // Điểm dễ sót khi copy từ Power 6/55 (vốn không có chiều special) — nếu ai đó
    // vô tình bỏ special khỏi công thức key, test này sẽ fail.
    const keyA = buildComboKey("standard", ["01", "02", "03", "04", "05"], ["07"]);
    const keyB = buildComboKey("standard", ["01", "02", "03", "04", "05"], ["08"]);
    expect(keyA).not.toBe(keyB);
  });

  it("Logic ngược — playType khác nhau, cùng số → key khác nhau", () => {
    const keyA = buildComboKey("standard", ["01", "02", "03", "04", "05"], ["07"]);
    const keyB = buildComboKey("specialCover", ["01", "02", "03", "04", "05"], ["07"]);
    expect(keyA).not.toBe(keyB);
  });
});
