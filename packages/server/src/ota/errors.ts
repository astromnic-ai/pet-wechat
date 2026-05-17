import type { Context } from "hono";

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

type OkData = Record<string, JsonValue | undefined>;

export function ok(c: Context, data: OkData = {}) {
  return c.json({ ok: true, ...data });
}

export function fail(c: Context, status: number, code: string, message: string) {
  return c.json({ ok: false, code, message }, status as never);
}
