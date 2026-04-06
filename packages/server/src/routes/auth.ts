import { Hono } from "hono";
import { db } from "../db";
import { users } from "../db/schema";
import { eq, sql } from "drizzle-orm";
import { signToken } from "../middleware/auth";

const auth = new Hono();
const PHONE_PATTERN = /^\d{11}$/;

function isValidPhone(phone: string) {
  return PHONE_PATTERN.test(phone);
}

function isValidPassword(password: string) {
  return password.length >= 6 && password.length <= 32;
}

// 微信小程序登录：前端传 code，后端换 openid
auth.post("/wechat", async (c) => {
  const { code } = await c.req.json<{ code: string }>();
  if (!code) return c.json({ error: "code is required" }, 400);

  const appid = process.env.WX_APPID ?? "";
  const secret = process.env.WX_SECRET ?? "";

  let openid: string;
  if (appid && secret) {
    const wxRes = await fetch(
      `https://api.weixin.qq.com/sns/jscode2session?appid=${appid}&secret=${secret}&js_code=${code}&grant_type=authorization_code`
    );
    const wxData = (await wxRes.json()) as { openid?: string; errcode?: number; errmsg?: string };
    if (!wxData.openid) {
      return c.json({ error: wxData.errmsg ?? "微信登录失败" }, 400);
    }
    openid = wxData.openid;
  } else {
    // 未配置微信密钥时使用 mock（本地开发）
    openid = `mock_openid_${code}`;
  }

  // 使用 upsert 避免并发首次登录的竞态条件
  const [user] = await db
    .insert(users)
    .values({
      wechatOpenid: openid,
      nickname: "微信用户",
    })
    .onConflictDoUpdate({
      target: users.wechatOpenid,
      set: { nickname: sql`${users.nickname}` },
    })
    .returning();

  const token = await signToken(user.id);
  return c.json({ token, user });
});

auth.post("/register", async (c) => {
  const body = await c.req.json<{
    phone?: string;
    code?: string;
    password?: string;
  }>();
  const phone = typeof body.phone === "string" ? body.phone.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!isValidPhone(phone)) {
    return c.json({ error: "手机号格式错误" }, 400);
  }

  if (!isValidPassword(password)) {
    return c.json({ error: "密码长度需为6-32位" }, 400);
  }

  if (body.code !== "123456") {
    return c.json({ error: "验证码错误" }, 400);
  }

  const [existingUser] = await db
    .select()
    .from(users)
    .where(eq(users.phone, phone));

  if (existingUser) {
    return c.json({ error: "手机号已注册" }, 409);
  }

  const passwordHash = await Bun.password.hash(password);
  const [user] = await db
    .insert(users)
    .values({
      phone,
      nickname: `用户${phone.slice(-4)}`,
      passwordHash,
    })
    .returning();

  const token = await signToken(user.id);
  return c.json({ token, user }, 201);
});

// 手机号验证码/密码登录
auth.post("/phone", async (c) => {
  const body = await c.req.json<{
    phone?: string;
    code?: string;
    password?: string;
  }>();
  const phone = typeof body.phone === "string" ? body.phone.trim() : "";
  const code = typeof body.code === "string" ? body.code : undefined;
  const password = typeof body.password === "string" ? body.password : undefined;
  const hasCode = typeof code === "string";
  const hasPassword = typeof password === "string";

  if (!isValidPhone(phone)) {
    return c.json({ error: "手机号格式错误" }, 400);
  }

  if (hasCode === hasPassword) {
    return c.json({ error: "必须且只能提供验证码或密码" }, 400);
  }

  if (hasPassword) {
    if (!phone || !password) {
      return c.json({ error: "phone and password required" }, 400);
    }

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.phone, phone));

    if (!user || !user.passwordHash) {
      return c.json({ error: "手机号或密码错误" }, 401);
    }

    const verified = await Bun.password.verify(password, user.passwordHash);
    if (!verified) {
      return c.json({ error: "手机号或密码错误" }, 401);
    }

    const token = await signToken(user.id);
    return c.json({ token, user });
  }

  if (!phone || !code) {
    return c.json({ error: "phone and code required" }, 400);
  }

  // TODO: 接入真实短信验证码服务
  if (code !== "123456") {
    return c.json({ error: "验证码错误" }, 400);
  }

  // 使用 upsert 避免并发首次登录的竞态条件
  const [user] = await db
    .insert(users)
    .values({
      phone,
      nickname: `用户${phone.slice(-4)}`,
    })
    .onConflictDoUpdate({
      target: users.phone,
      set: { nickname: sql`${users.nickname}` },
    })
    .returning();

  const token = await signToken(user.id);
  return c.json({ token, user });
});

if (process.env.ENABLE_DEV_LOGIN === "true") {
  auth.post("/dev-login", async (c) => {
    const { phone } = await c.req.json<{ phone: string }>();
    const normalizedPhone = phone?.trim();
    if (!normalizedPhone) return c.json({ error: "phone is required" }, 400);

    const [user] = await db
      .insert(users)
      .values({
        phone: normalizedPhone,
        nickname: "开发用户",
      })
      .onConflictDoUpdate({
        target: users.phone,
        set: { nickname: sql`${users.nickname}` },
      })
      .returning();

    const token = await signToken(user.id);
    return c.json({ token, user });
  });
}

export default auth;
