import D from "../data.js";
import type { Item } from "../types.js";

/** Plain text only: HTML callers must escape it; DOM callers use textContent. */
export function targetCaption(part: Pick<Item, "type" | "label"> | null | undefined): string {
  if (!part) return "";
  const canonical = Object.hasOwn(D.PARTS, part.type) ? D.PARTS[part.type].name : "UI";
  const label = typeof part.label === "string"
    ? part.label
        .replace(/[\t\n\r\f\v]/g, " ")
        .replace(/[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, "")
        .replace(/\s+/g, " ")
        .trim()
    : "";
  if (!label || label === canonical) return canonical;
  // Saved labels allow 80 UTF-16 units. Keep those intact while bounding malformed input.
  const points = Array.from(label);
  const visible = points.length > 80 ? points.slice(0, 79).join("") + "…" : label;
  return `${visible}（${canonical}）`;
}
