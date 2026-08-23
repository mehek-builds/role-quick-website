import { randomBytes } from "node:crypto";

const RIPPLING_FIELD_NUMBERS = [8, 12, 16, 20, 27, 31, 34, 61] as const;

export type RipplingFieldNames = Readonly<Record<number, string>>;

function opaqueFieldName() {
  // Five random bytes become the ten alphanumeric characters measured on the live form.
  return randomBytes(5).toString("hex");
}

export function newRipplingFieldNames(): RipplingFieldNames {
  return Object.fromEntries(
    RIPPLING_FIELD_NUMBERS.map((fieldNumber) => [fieldNumber, opaqueFieldName()]),
  );
}
