const scrollByPath: Record<string, number> = {};
let deskScroll: HTMLElement | null = null;

if (typeof window !== "undefined" && "scrollRestoration" in history) {
  history.scrollRestoration = "manual";
}

export function bindDeskScroll(el: HTMLElement | null) {
  deskScroll = el;
}

export function deskScrollY() {
  return deskScroll ? deskScroll.scrollTop : typeof window === "undefined" ? 0 : window.scrollY;
}

export function setDeskScrollY(y: number) {
  if (deskScroll) deskScroll.scrollTop = y;
  else if (typeof window !== "undefined") window.scrollTo({ top: y, left: 0, behavior: "instant" as ScrollBehavior });
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
