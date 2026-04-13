import { Hono } from "hono";
import { db } from "../db";
import { users } from "../db/schema";
import { sql } from "drizzle-orm";
import { signToken } from "../middleware/auth";

const auth = new Hono();

let wxAccessTokenCache:
  | {
      token: string;
      expiresAt: number;
    }
  | null = null;

async function getWechatAccessToken(appid: string, secret: string) {
  const now = Date.now();
  if (wxAccessTokenCache && wxAccessTokenCache.expiresAt > now + 60_000) {
    return wxAccessTokenCache.token;
  }

  const tokenRes = await fetch(
    `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${appid}&secret=${secret}`
  );
  const tokenData = (await tokenRes.json()) as {
    access_token?: string;
    expires_in?: number;
    errcode?: number;
    errmsg?: string;
  };

  if (!tokenData.access_token) {
    throw new Error(tokenData.errmsg ?? "获取微信 access_token 失败");
  }

  wxAccessTokenCache = {
    token: tokenData.access_token,
    expiresAt: now + (tokenData.expires_in ?? 7200) * 1000,
  };

  return tokenData.access_token;
}

// 微信小程序登录：前端传 code，后端换 openid
auth.post("/wechat", async (c) => {
  const { code } = await c.req.json<{ code: string }>();
  if (!code) return c.json({ error: "code is required" }, 400);

  const appid = process.env.WX_APPID ?? "";
  const secret = process.env.WX_SECRET ?? "";

  if (!appid || !secret) {
    return c.json({ error: "微信登录未配置" }, 500);
  }

  let openid: string;
  const wxRes = await fetch(
    `https://api.weixin.qq.com/sns/jscode2session?appid=${appid}&secret=${secret}&js_code=${code}&grant_type=authorization_code`
  );
  const wxData = (await wxRes.json()) as { openid?: string; errcode?: number; errmsg?: string };
  if (!wxData.openid) {
    return c.json({ error: wxData.errmsg ?? "微信登录失败" }, 400);
  }
  openid = wxData.openid;

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

// 手机号验证码登录
auth.post("/phone", async (c) => {
  const { phone, code } = await c.req.json<{ phone: string; code: string }>();
  if (!phone || !code) return c.json({ error: "phone and code required" }, 400);

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

// 微信手机号快捷登录
auth.post("/phone/wechat", async (c) => {
  const { code } = await c.req.json<{ code: string }>();
  if (!code) return c.json({ error: "code is required" }, 400);

  const appid = process.env.WX_APPID ?? "";
  const secret = process.env.WX_SECRET ?? "";

  if (!appid || !secret) {
    return c.json({ error: "微信手机号快捷登录未配置" }, 500);
  }

  try {
    const accessToken = await getWechatAccessToken(appid, secret);
    const phoneRes = await fetch(
      `https://api.weixin.qq.com/wxa/business/getuserphonenumber?access_token=${accessToken}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      }
    );

    const phoneData = (await phoneRes.json()) as {
      phone_info?: {
        phoneNumber?: string;
        purePhoneNumber?: string;
      };
      errcode?: number;
      errmsg?: string;
    };

    const phone =
      phoneData.phone_info?.purePhoneNumber || phoneData.phone_info?.phoneNumber;

    if (!phone) {
      return c.json({ error: phoneData.errmsg ?? "获取手机号失败" }, 400);
    }

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
  } catch (error: any) {
    return c.json({ error: error?.message ?? "微信手机号快捷登录失败" }, 500);
  }
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
