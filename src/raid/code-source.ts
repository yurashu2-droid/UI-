/** Browser-safe raw UTF-8 helpers. This digest is intentionally not stable JSON hashing. */
export const utf8Bytes = (text: string): Uint8Array<ArrayBuffer> =>
  new TextEncoder().encode(text);
export async function rawSourceHash(
  bytes: Uint8Array<ArrayBuffer>,
): Promise<string> {
  const hash = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}
