export const APP_VERSION = "1.0.21";

export function isNewerVersion(next: string, current: string): boolean {
  const parts = (value: string) => value.split(".").map((part) => Number.parseInt(part, 10) || 0);
  const left = parts(next);
  const right = parts(current);
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const gap = (left[index] ?? 0) - (right[index] ?? 0);
    if (gap > 0) return true;
    if (gap < 0) return false;
  }
  return false;
}
