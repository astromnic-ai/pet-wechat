import { Hono } from "hono";
import { and, eq, ne } from "drizzle-orm";
import { db } from "../db";
import { users } from "../db/schema";
import {
  bindEmailSendCodeSchema,
  bindEmailVerifySchema,
  bindPhoneSendCodeSchema,
  bindPhoneVerifySchema,
} from "../validators/user-end";

const accountRoute = new Hono();

// TODO: 接入真实短信/邮件验证码服务后移除固定 mock code。
const MOCK_BIND_CODE = "000000";

function isUniqueViolation(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}

async function getCurrentUser(userId: string) {
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  return user ?? null;
}

accountRoute.post("/bind-phone/send-code", async (c) => {
  const userId = c.get("userId" as never) as string;
  const rawBody = await c.req.json().catch(() => null);
  const parsedBody = bindPhoneSendCodeSchema.safeParse(rawBody);
  if (!parsedBody.success) {
    return c.json({ error: "Invalid phone" }, 400);
  }

  const user = await getCurrentUser(userId);
  if (!user) return c.json({ error: "User not found" }, 404);

  console.info(`[account] mock phone bind code for ${userId}: ${MOCK_BIND_CODE}`);
  return c.json({ accepted: true, mockCode: MOCK_BIND_CODE });
});

accountRoute.post("/bind-phone/verify", async (c) => {
  const userId = c.get("userId" as never) as string;
  const rawBody = await c.req.json().catch(() => null);
  const parsedBody = bindPhoneVerifySchema.safeParse(rawBody);
  if (!parsedBody.success) {
    return c.json({ error: "Invalid request body" }, 400);
  }

  const { phone, code } = parsedBody.data;
  if (code !== MOCK_BIND_CODE) {
    return c.json({ error: "验证码错误" }, 400);
  }

  const user = await getCurrentUser(userId);
  if (!user) return c.json({ error: "User not found" }, 404);
  if (user.phone === phone) return c.json({ error: "手机号已绑定当前账号" }, 400);
  if (user.phone && user.phone !== phone) {
    return c.json({ error: "当前账号已绑定其他手机号" }, 409);
  }

  const [existingPhoneUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.phone, phone), ne(users.id, userId)));
  if (existingPhoneUser) {
    return c.json({ error: "手机号已被其他账号占用" }, 409);
  }

  try {
    const [updatedUser] = await db
      .update(users)
      .set({
        phone,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning();

    return c.json({ user: updatedUser });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return c.json({ error: "手机号已被其他账号占用" }, 409);
    }
    throw error;
  }
});

accountRoute.post("/bind-email/send-code", async (c) => {
  const userId = c.get("userId" as never) as string;
  const rawBody = await c.req.json().catch(() => null);
  const parsedBody = bindEmailSendCodeSchema.safeParse(rawBody);
  if (!parsedBody.success) {
    return c.json({ error: "Invalid email" }, 400);
  }

  const user = await getCurrentUser(userId);
  if (!user) return c.json({ error: "User not found" }, 404);

  // TODO: 接入邮件服务，替换固定验证码与日志输出
  console.info(
    `[account] mock email bind code for ${userId} (${parsedBody.data.email}): ${MOCK_BIND_CODE}`,
  );
  return c.json({ accepted: true, mockCode: MOCK_BIND_CODE });
});

accountRoute.post("/bind-email/verify", async (c) => {
  const userId = c.get("userId" as never) as string;
  const rawBody = await c.req.json().catch(() => null);
  const parsedBody = bindEmailVerifySchema.safeParse(rawBody);
  if (!parsedBody.success) {
    return c.json({ error: "Invalid request body" }, 400);
  }

  const { email, code } = parsedBody.data;
  if (code !== MOCK_BIND_CODE) {
    return c.json({ error: "验证码错误" }, 400);
  }

  const user = await getCurrentUser(userId);
  if (!user) return c.json({ error: "User not found" }, 404);
  if (user.email === email) return c.json({ error: "邮箱已绑定当前账号" }, 400);
  if (user.email && user.email !== email) {
    return c.json({ error: "当前账号已绑定其他邮箱" }, 409);
  }

  const [existingEmailUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.email, email), ne(users.id, userId)));
  if (existingEmailUser) {
    return c.json({ error: "邮箱已被其他账号占用" }, 409);
  }

  try {
    const [updatedUser] = await db
      .update(users)
      .set({
        email,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning();

    return c.json({ user: updatedUser });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return c.json({ error: "邮箱已被其他账号占用" }, 409);
    }
    throw error;
  }
});

export default accountRoute;
