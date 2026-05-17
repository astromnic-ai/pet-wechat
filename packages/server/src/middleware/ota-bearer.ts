import type { Context } from "hono";
import { verifyOtaToken, type OtaTokenRow } from "../ota/tokens";

declare module "hono" {
  interface ContextVariableMap {
    otaToken?: OtaTokenRow;
    otaAuth?: { type: "bearer" | "admin-key"; actor: string };
  }
}

export async function authenticateOtaBearer(c: Context) {
  const authorization = c.req.header("Authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(authorization);
  if (!match) return null;

  const token = await verifyOtaToken(match[1].trim());
  if (!token) return null;

  c.set("otaToken", token);
  c.set("otaAuth", { type: "bearer", actor: token.id });
  return token;
}
