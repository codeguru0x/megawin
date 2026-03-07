/**
 * Max 3D SDK – Public Enums
 * @module
 */

export const Max3dPlayMode = {
  Basic: "basic",
  Plus: "plus",
} as const;

export type Max3dPlayMode = (typeof Max3dPlayMode)[keyof typeof Max3dPlayMode];

export const Max3dPlayType = {
  Straight: "straight",
  Combo3: "combo3",
  Combo6: "combo6",
  QuickPick: "quickPick",
} as const;

export type Max3dPlayType = (typeof Max3dPlayType)[keyof typeof Max3dPlayType];

export const Max3dBasicPrizeTier = {
  Special: "special",
  First: "first",
  Second: "second",
  Third: "third",
} as const;

export type Max3dBasicPrizeTier = (typeof Max3dBasicPrizeTier)[keyof typeof Max3dBasicPrizeTier];

export const Max3dPlusPrizeTier = {
  Special: "special",
  First: "first",
  Second: "second",
  Third: "third",
  Fourth: "fourth",
  Fifth: "fifth",
  Sixth: "sixth",
} as const;

export type Max3dPlusPrizeTier = (typeof Max3dPlusPrizeTier)[keyof typeof Max3dPlusPrizeTier];
