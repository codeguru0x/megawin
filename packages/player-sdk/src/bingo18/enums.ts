/**
 * Bingo 18 SDK – Public Enums
 * @module
 */

export const Bingo18PlayType = {
  SingleNum: "singleNum",
  DoubleMatch: "doubleMatch",
  TripleMatch: "tripleMatch",
  SumTotal: "sumTotal",
  BigSmallDraw: "bigSmallDraw",
} as const;

export type Bingo18PlayType = (typeof Bingo18PlayType)[keyof typeof Bingo18PlayType];

export const Bingo18TripleKind = {
  Specific: "specific",
  Any: "any",
} as const;

export type Bingo18TripleKind = (typeof Bingo18TripleKind)[keyof typeof Bingo18TripleKind];

export const Bingo18BigSmallBet = {
  Big: "big",
  Draw: "draw",
  Small: "small",
} as const;

export type Bingo18BigSmallBet = (typeof Bingo18BigSmallBet)[keyof typeof Bingo18BigSmallBet];
