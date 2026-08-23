import { randomBytes } from "node:crypto";

const RIPPLING_FIELD_NUMBERS = [8, 12, 16, 20, 27, 31, 34, 61] as const;

export type RipplingFieldIdentity = Readonly<{ id: string; name: string }>;
export type RipplingFieldIdentities = Readonly<Record<number, RipplingFieldIdentity>>;

function opaqueFieldName() {
  // Five random bytes become the ten alphanumeric characters measured on the live form.
  return randomBytes(5).toString("hex");
}

export function newRipplingFieldIdentities(): RipplingFieldIdentities {
  const idOffset = randomBytes(4).readUInt32BE(0);
  return Object.fromEntries(
    RIPPLING_FIELD_NUMBERS.map((fieldNumber, index) => [fieldNumber, {
      id: `field-${idOffset + index}`,
      name: opaqueFieldName(),
    }]),
  );
}
