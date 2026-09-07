// Kept in sync BY HAND with volley-backend's src/lib/tiktokEvents.ts
// (TIKTOK_US_PIXEL_CODE there): the two repos cannot share a constant, so a
// pixel rotation must update both. Search both codebases for this literal
// before assuming a rotation is done.
export const TIKTOK_US_PIXEL_CODE = "DAA22IBC77U6VIRE3PD0";
export const TIKTOK_UAE_PIXEL_CODE = "DAA38C3C77UBCVGL0KRG";

export const TIKTOK_ADS_PIXEL_CODES = [
  TIKTOK_US_PIXEL_CODE,
  TIKTOK_UAE_PIXEL_CODE,
] as const;
