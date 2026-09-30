/**
 * Typed reads of single runtime values. Each reader returns the fallback when
 * the stored value is missing or of the wrong shape, so a stale workspace or
 * a hand-edited settings file can never hand the engine a broken setting.
 */

import type { VectorPoint } from "./engine-settings";

export type Values = Readonly<Record<string, unknown>>;

export function readNumber(values: Values, target: string, fallback: number): number {
  const value = values[target];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function readBoolean(
  values: Values,
  target: string,
  fallback: boolean,
): boolean {
  const value = values[target];
  return typeof value === "boolean" ? value : fallback;
}

export function readString<Value extends string>(
  values: Values,
  target: string,
  allowed: readonly Value[],
  fallback: Value,
): Value {
  const value = values[target];
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as Value)
    : fallback;
}

export function readText(values: Values, target: string, fallback: string): string {
  const value = values[target];
  return typeof value === "string" ? value : fallback;
}

export function readHex(values: Values, target: string, fallback: string): string {
  const value = values[target];
  return typeof value === "string" && /^#[0-9A-F]{6}$/i.test(value)
    ? value.toUpperCase()
    : fallback;
}

export function readStringList(
  values: Values,
  target: string,
  fallback: readonly string[],
): readonly string[] {
  const value = values[target];
  if (!Array.isArray(value)) return fallback;
  const entries = value.filter(
    (entry): entry is string => typeof entry === "string" && entry.length > 0,
  );
  return entries.length > 0 ? entries : fallback;
}

export function readVector(
  values: Values,
  target: string,
  fallback: VectorPoint,
): VectorPoint {
  const value = values[target];
  if (value === null || typeof value !== "object") return fallback;
  const record = value as Record<string, unknown>;
  const x = Number(record.x);
  const y = Number(record.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return fallback;
  return {
    x: Math.min(1, Math.max(-1, x)),
    y: Math.min(1, Math.max(-1, y)),
  };
}
