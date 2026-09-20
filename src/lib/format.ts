export function formatClock(tSec: number): string {
  const m = Math.floor(tSec / 60);
  const s = Math.floor(tSec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function formatPct(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}

export function formatTokens(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k`;
  return `${Math.round(n)}`;
}
