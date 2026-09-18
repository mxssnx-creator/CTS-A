import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function fmtNum(n: number, digits = 2): string {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function fmtSigned(n: number, digits = 2): string {
  if (!Number.isFinite(n)) return "—";
  const sign = n > 0 ? "+" : "";
  return sign + fmtNum(n, digits);
}

export function fmtPct(n: number, digits = 1): string {
  if (!Number.isFinite(n)) return "—";
  const sign = n > 0 ? "+" : "";
  return sign + (n * 100).toFixed(digits) + "%";
}

export function fmtUsd(n: number, digits = 2): string {
  if (!Number.isFinite(n)) return "—";
  const sign = n < 0 ? "-" : "";
  return sign + "$" + fmtNum(Math.abs(n), digits);
}

export function fmtEquity(n: number): string {
  if (!Number.isFinite(n) || n === 0) return "—";
  return fmtUsd(n, Math.abs(n) < 100 ? 2 : 0);
}

export function fmtPx(n: number): string {
  if (!Number.isFinite(n)) return "—";
  if (n >= 1000) return fmtNum(n, 1);
  if (n >= 100) return fmtNum(n, 2);
  if (n >= 1) return fmtNum(n, 3);
  return fmtNum(n, 5);
}

export function clsPnl(n: number): string {
  if (n > 0) return "text-up";
  if (n < 0) return "text-down";
  return "text-muted";
}
