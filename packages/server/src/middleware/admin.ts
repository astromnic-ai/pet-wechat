import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";

// TODO: 生产环境必须设置 ADMIN_KEY 环境变量
const ADMIN_KEY = process.env.ADMIN_KEY ?? "wispnook-admin-dev";

export const adminMiddleware = createMiddleware(async (c, next) => {
  const key = c.req.header("X-Admin-Key");
  if (!key || key !== ADMIN_KEY) {
    throw new HTTPException(401, { message: "Invalid admin key" });
  }
  await next();
});
