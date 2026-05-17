import { createMiddleware } from "hono/factory";
import { verifyOtaToken, type OtaTokenRow } from "../ota/tokens";
import { fail } from "../ota/errors";

declare module "hono" {
  interface ContextVariableMap {
    otaToken?: OtaTokenRow;
    otaAuth?: { type: "bearer" | "admin-key"; actor: string };
  }
}

export async function authenticateOtaBearer(c: Parameters<Parameters<typeof createMiddleware>[0]>[0]) {
  const authorization = c.req.header("Authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(authorization);
  if (!match) return null;

  const token = await verifyOtaToken(match[1].trim());
  if (!token) return null;

  c.set("otaToken", token);
  c.set("otaAuth", { type: "bearer", actor: token.id });
  return token;
}

export const otaBearerMiddleware = createMiddleware(async (c, next) => {
  const token = await authenticateOtaBearer(c);
  if (!token) {
    return fail(c, 401, "auth_failed", "Bearer token 无效或已吊销");
  }

  await next();
});
