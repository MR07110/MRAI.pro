// Dynamic browser-tab favicon: the chip icon steady by default, blinking amber while the AI is
// generating a reply and the tab is in the background, and a steady green dot once that reply is
// ready — only while the tab is still in the background. The moment the tab regains focus, the
// favicon drops back to the plain default immediately, whatever state the reply is in.

type Palette = { bg: string; fg: string; amberOn: string; amberOff: string; green: string };

const PALETTES: Record<"dark" | "light", Palette> = {
  dark: { bg: "#000000", fg: "#ffffff", amberOn: "#E3B341", amberOff: "#333333", green: "#3FB950" },
  light: { bg: "#ffffff", fg: "#000000", amberOn: "#DBAB0A", amberOff: "#E0E0E0", green: "#1A7F37" },
};

export function prefersDark(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches === true;
}

// The chip shape (pins, frame, "AI" letters) in one color, plus an optional status dot in the corner.
function chipSvg(fg: string, bg: string, dot?: string): string {
  const dotRect = dot ? `<rect x="18" y="18" width="5" height="5" fill="${dot}"/>` : "";
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">` +
    `<rect width="24" height="24" fill="${bg}"/>` +
    `<rect x="7" y="1" width="2" height="2" fill="${fg}"/>` +
    `<rect x="10" y="1" width="2" height="2" fill="${fg}"/>` +
    `<rect x="13" y="1" width="2" height="2" fill="${fg}"/>` +
    `<rect x="16" y="1" width="2" height="2" fill="${fg}"/>` +
    `<rect x="8" y="21" width="2" height="2" fill="${fg}"/>` +
    `<rect x="11" y="21" width="2" height="2" fill="${fg}"/>` +
    `<rect x="14" y="21" width="2" height="2" fill="${fg}"/>` +
    `<rect x="1" y="8" width="2" height="2" fill="${fg}"/>` +
    `<rect x="1" y="11" width="2" height="2" fill="${fg}"/>` +
    `<rect x="1" y="14" width="2" height="2" fill="${fg}"/>` +
    `<rect x="21" y="8" width="2" height="2" fill="${fg}"/>` +
    `<rect x="21" y="11" width="2" height="2" fill="${fg}"/>` +
    `<rect x="21" y="14" width="2" height="2" fill="${fg}"/>` +
    `<path d="M5,4 H19 V5 H20 V19 H19 V20 H5 V19 H4 V5 H5 Z" fill="none" stroke="${fg}" stroke-width="2"/>` +
    `<rect x="7" y="8" width="2" height="7" fill="${fg}"/>` +
    `<rect x="11" y="8" width="2" height="7" fill="${fg}"/>` +
    `<rect x="9" y="8" width="2" height="2" fill="${fg}"/>` +
    `<rect x="9" y="11" width="2" height="2" fill="${fg}"/>` +
    `<rect x="15" y="8" width="2" height="7" fill="${fg}"/>` +
    dotRect +
    `</svg>`
  );
}

function dataUri(svg: string): string {
  return "data:image/svg+xml," + encodeURIComponent(svg);
}

export type FaviconVariant = "default" | "think1" | "think2" | "success";

export function faviconHref(variant: FaviconVariant): string {
  const p = PALETTES[prefersDark() ? "dark" : "light"];
  const dot = variant === "think1" ? p.amberOn : variant === "think2" ? p.amberOff : variant === "success" ? p.green : undefined;
  return dataUri(chipSvg(p.fg, p.bg, dot));
}

let linkEl: HTMLLinkElement | null = null;

function getFaviconLink(): HTMLLinkElement {
  if (linkEl && linkEl.isConnected) return linkEl;
  linkEl = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!linkEl) {
    linkEl = document.createElement("link");
    linkEl.rel = "icon";
    document.head.appendChild(linkEl);
  }
  return linkEl;
}

export function setFavicon(variant: FaviconVariant): void {
  if (typeof document === "undefined") return;
  getFaviconLink().href = faviconHref(variant);
}
