const scrollByPath: Record<string, number> = {};
let deskScroll: HTMLElement | null = null;

export function bindDeskScroll(el: HTMLElement | null) {
  deskScroll = el;
}

export function deskScrollY() {
  return deskScroll ? deskScroll.scrollTop : typeof window === "undefined" ? 0 : window.scrollY;
}

export function setDeskScrollY(y: number) {
  if (deskScroll) deskScroll.scrollTop = y;
  else if (typeof window !== "undefined") window.scrollTo(0, y);
}

export function saveDeskScroll(path: string) {
  scrollByPath[path] = deskScrollY();
}

export function restoreDeskScroll(path: string) {
  const y = scrollByPath[path];
  if (typeof y === "number") setDeskScrollY(y);
}

export function pinDeskScroll() {
  if (typeof window === "undefined") return;
  const y = deskScrollY();
  const restore = () => setDeskScrollY(y);
  restore();
  requestAnimationFrame(restore);
  requestAnimationFrame(() => requestAnimationFrame(restore));
}
