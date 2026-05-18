import { createMiddleware } from "hono/factory";
import { authenticateOtaBearer } from "./ota-bearer";
import { fail } from "../ota/errors";
import { timingSafeEqual } from "../ota/tokens";

const ADMIN_KEY = process.env.ADMIN_KEY ?? "yehey-admin-dev";

export const otaAdminMiddleware = createMiddleware(async (c, next) => {
  const key = c.req.header("X-Admin-Key");
  if (key && timingSafeEqual(key, ADMIN_KEY)) {
    c.set("otaAuth", { type: "admin-key", actor: "admin-key" });
    await next();
    return;
  }

  const token = await authenticateOtaBearer(c);
  if (token) {
    await next();
    return;
  }

  return fail(c, 401, "auth_failed", "Admin key 或 Bearer token 无效");
});
