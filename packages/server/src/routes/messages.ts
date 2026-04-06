import { Hono } from "hono";
import { db } from "../db";
import { messages } from "../db/schema";
import { eq, and, desc } from "drizzle-orm";

const messagesRoute = new Hono();
const ALLOWED_MESSAGE_TYPES = new Set([
  "system",
  "authorization",
  "activity",
  "health",
  "device",
  "community",
]);

// 获取消息列表
messagesRoute.get("/", async (c) => {
  const userId = c.get("userId" as never) as string;
  const type = c.req.query("type");

  const conditions = [eq(messages.userId, userId)];
  if (type && ALLOWED_MESSAGE_TYPES.has(type)) {
    conditions.push(eq(messages.type, type));
  }

  const result = await db
    .select()
    .from(messages)
    .where(and(...conditions))
    .orderBy(desc(messages.createdAt));
  return c.json(result);
});

// 未读数量
messagesRoute.get("/unread-count", async (c) => {
  const userId = c.get("userId" as never) as string;
  const result = await db
    .select()
    .from(messages)
    .where(and(eq(messages.userId, userId), eq(messages.isRead, false)));
  return c.json({ count: result.length });
});

// 标记单条已读
messagesRoute.put("/:id/read", async (c) => {
  const userId = c.get("userId" as never) as string;
  const id = c.req.param("id");
  await db
    .update(messages)
    .set({ isRead: true })
    .where(and(eq(messages.id, id), eq(messages.userId, userId)));
  return c.json({ success: true });
});

// 一键全部已读
messagesRoute.put("/read-all", async (c) => {
  const userId = c.get("userId" as never) as string;
  await db
    .update(messages)
    .set({ isRead: true })
    .where(and(eq(messages.userId, userId), eq(messages.isRead, false)));
  return c.json({ success: true });
});

export default messagesRoute;
