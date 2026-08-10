export function percentageChange(
  current: number,
  previous: number | null,
): number | null {
  if (!Number.isFinite(current) || previous === null || !Number.isFinite(previous))
    return null;
  if (previous === 0) return current === 0 ? 0 : null;
  return Math.round(((current - previous) * 10_000) / Math.abs(previous));
}

export function progressWidth(basisPoints: number | null): number {
  if (basisPoints === null || !Number.isFinite(basisPoints)) return 0;
  return Math.max(0, Math.min(100, basisPoints / 100));
}

export function goalTone(
  basisPoints: number | null,
  isLimit: boolean,
): "neutral" | "good" | "warning" | "critical" {
  if (basisPoints === null) return "neutral";
  if (isLimit) {
    if (basisPoints > 10_000) return "critical";
    if (basisPoints >= 8_000) return "warning";
    return "good";
  }
  if (basisPoints >= 10_000) return "good";
  if (basisPoints >= 7_000) return "warning";
  return "neutral";
}

export function greeting(hour: number): string {
  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
}
