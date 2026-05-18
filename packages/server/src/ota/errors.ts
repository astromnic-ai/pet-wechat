import type { Context } from "hono";

export function ok(c: Context, data: Record<string, unknown> = {}) {
  return c.json({ ok: true, ...data });
}

export function fail(c: Context, status: number, code: string, message: string) {
  return c.json({ ok: false, code, message }, status as never);
}
