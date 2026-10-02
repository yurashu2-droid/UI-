export type WindowRect = { x: number; y: number; w: number; h: number };

/** Reserve both tool columns before fitting the homepage at its natural ratio. */
export function defaultWindowLayout(width: number, height: number, pageHeight = 994): Record<"page" | "crawl" | "clip" | "props", WindowRect> {
  const gap = 12, margin = 8, caption = 32, chrome = 33;
  const available = Math.max(1, width - margin * 2 - gap * 2);
  const left = Math.min(308, available * .25);
  const right = Math.min(280, available * .23);
  const center = available - left - right;
  const fullHeight = Math.max(1, height - margin * 2);
  const scale = Math.max(.01, Math.min((center - 6) / 960, (fullHeight - caption - chrome) / pageHeight, 1));
  const pageWidth = 960 * scale + 6, pageWindowHeight = pageHeight * scale + chrome;
  const clipHeight = Math.min(168, (fullHeight - gap) * .28);
  return {
    crawl: { x: margin, y: margin, w: left, h: fullHeight - gap - clipHeight },
    clip: { x: margin, y: height - margin - clipHeight, w: left, h: clipHeight },
    page: { x: margin + left + gap + (center - pageWidth) / 2, y: margin + caption, w: pageWidth, h: pageWindowHeight },
    props: { x: width - margin - right, y: margin, w: right, h: fullHeight },
  };
}
