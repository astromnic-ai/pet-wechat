import { Hono } from "hono";
import { db } from "../db";
import { users } from "../db/schema";
import { eq } from "drizzle-orm";
import { updateMeSchema } from "../validators/user-end";
import { attachAvatarQuotaSummary, getUserAvatarQuotaSummary } from "../utils/avatarQuota";

const meRoute = new Hono();

// 获取当前用户信息（受 authMiddleware 保护）
meRoute.get("/", async (c) => {
  const userId = c.get("userId" as never) as string;
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user) return c.json({ error: "User not found" }, 404);
  const quotaSummary = await getUserAvatarQuotaSummary(user.id, user.avatarQuota);
  return c.json({ user: attachAvatarQuotaSummary(user, quotaSummary) });
});

// 更新当前用户信息
meRoute.put("/", async (c) => {
  const userId = c.get("userId" as never) as string;
  const rawBody = await c.req.json().catch(() => null);
  const parsedBody = updateMeSchema.safeParse(rawBody);
  if (!parsedBody.success) {
    return c.json({ error: "Invalid request body" }, 400);
  }
  const body = parsedBody.data;

  const [existing] = await db.select().from(users).where(eq(users.id, userId));
  if (!existing) return c.json({ error: "User not found" }, 404);

  const [user] = await db
    .update(users)
    .set({
      nickname: body.nickname ?? existing.nickname,
      avatarUrl: body.avatarUrl !== undefined ? body.avatarUrl : existing.avatarUrl,
    })
    .where(eq(users.id, userId))
    .returning();
  const quotaSummary = await getUserAvatarQuotaSummary(user.id, user.avatarQuota);
  return c.json({ user: attachAvatarQuotaSummary(user, quotaSummary) });
});

export default meRoute;
