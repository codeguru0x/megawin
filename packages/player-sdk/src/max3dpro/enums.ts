/**
 * Max 3D Pro SDK – Public Enums
 * @module
 */

export const Max3dproPlayMode = {
  MultiNumber: "multiNumber",
  MultiDigit: "multiDigit",
} as const;

export type Max3dproPlayMode = (typeof Max3dproPlayMode)[keyof typeof Max3dproPlayMode];

export const Max3dproPrizeTier = {
  Special: "special",
  SpecialSub: "specialSub",
  First: "first",
  Second: "second",
  Third: "third",
  Fourth: "fourth",
  Fifth: "fifth",
  Sixth: "sixth",
} as const;

export type Max3dproPrizeTier = (typeof Max3dproPrizeTier)[keyof typeof Max3dproPrizeTier];
