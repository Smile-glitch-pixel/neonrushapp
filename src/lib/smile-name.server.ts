import { timingSafeEqual } from "node:crypto";

export const containsSmile = (value: string) => /smile/i.test(value);

export const verifySmileNamePassword = (name: string, password: string): boolean => {
  if (!containsSmile(name)) return true;

  const expected = process.env["SMILE_ACCOUNT_PASSWORD"];
  if (!expected) {
    console.error("SMILE_ACCOUNT_PASSWORD is not configured on the server.");
    throw new Error("Smile-name password verification is not configured.");
  }

  const providedBytes = Buffer.from(password);
  const expectedBytes = Buffer.from(expected);
  return (
    providedBytes.length === expectedBytes.length && timingSafeEqual(providedBytes, expectedBytes)
  );
};
