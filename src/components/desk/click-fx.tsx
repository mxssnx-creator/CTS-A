import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

type Ripple = { id: number; x: number; y: number; size: number };

const SELECTOR =
  "button, [role='button'], a[href], [data-press], summary, input[type='button'], input[type='submit']";

function spawnAt(x: number, y: number, size: number, id: number): Ripple {
  return { id, x, y, size };
}

function targetSize(el: Element) {
  const r = el.getBoundingClientRect();
  return Math.max(48, Math.min(160, Math.max(r.width, r.height) * 0.7));
}

/**
 * Global click feedback: ripple at the pointer and a brief pressed class.
 * Capture-phase so every control reacts immediately, including nav before the
 * next view paints. Portaled to body so overflow-hidden shells cannot clip it.
 */
export function ClickFx() {
  const [ripples, setRipples] = useState<Ripple[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    let seq = 0;
    let lastAt = 0;
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const mark = (el: Element) => {
      el.classList.add("is-pressed");
      window.setTimeout(() => el.classList.remove("is-pressed"), 160);
    };

    const addRipple = (x: number, y: number, size: number) => {
      if (reduced) return;
      const id = ++seq;
      setRipples((rs) => [...rs.slice(-10), spawnAt(x, y, size, id)]);
      window.setTimeout(() => {
        setRipples((rs) => rs.filter((r) => r.id !== id));
      }, 520);
    };

    const fromEvent = (e: Event, x: number, y: number) => {
      const now = typeof performance !== "undefined" ? performance.now() : Date.now();
      if (now - lastAt < 36) return;
      lastAt = now;
      const t = e.target;
      if (!(t instanceof Element)) return;
      const el = t.closest(SELECTOR);
      if (!el) return;
      if (el instanceof HTMLButtonElement && el.disabled) return;
      if (el instanceof HTMLInputElement && el.disabled) return;
      if (el.getAttribute("aria-disabled") === "true") return;
      if (el.classList.contains("no-fx")) return;
      mark(el);
      addRipple(x, y, targetSize(el));
    };

    const onPointer = (e: PointerEvent) => {
      if (e.button != null && e.button !== 0) return;
      fromEvent(e, e.clientX, e.clientY);
    };

    const onMouse = (e: MouseEvent) => {
      if (e.button !== 0) return;
      fromEvent(e, e.clientX, e.clientY);
    };

    const onKeyClick = (e: MouseEvent) => {
      if (e.detail !== 0) return;
      const t = e.target;
      if (!(t instanceof Element)) return;
      const el = t.closest(SELECTOR);
      if (!el) return;
      const r = el.getBoundingClientRect();
      fromEvent(e, r.left + r.width / 2, r.top + r.height / 2);
    };

    document.addEventListener("pointerdown", onPointer, { capture: true, passive: true });
    document.addEventListener("mousedown", onMouse, { capture: true, passive: true });
    document.addEventListener("click", onKeyClick, { capture: true, passive: true });
    return () => {
      document.removeEventListener("pointerdown", onPointer, true);
      document.removeEventListener("mousedown", onMouse, true);
      document.removeEventListener("click", onKeyClick, true);
    };
  }, []);

  if (!mounted || typeof document === "undefined") return null;
  return createPortal(
    <div className="click-fx-layer" aria-hidden="true" data-click-fx="on">
      {ripples.map((r) => (
        <span
          key={r.id}
          className="click-ripple"
          style={{
            left: r.x,
            top: r.y,
            width: r.size,
            height: r.size,
          }}
        />
      ))}
    </div>,
    document.body,
  );
}
