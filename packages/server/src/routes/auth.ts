import { Hono } from "hono";
import { createHash, createHmac } from "node:crypto";
import { db } from "../db";
import { users } from "../db/schema";
import { sql } from "drizzle-orm";
import { signToken } from "../middleware/auth";
import { bindPhoneSendCodeSchema, bindPhoneVerifySchema } from "../validators/user-end";

const auth = new Hono();
const DEFAULT_SMS_CODE = "123456";
const SMS_CODE_TTL_MS = Number(process.env.SMS_CODE_TTL_SECONDS ?? 300) * 1000;
const TENCENT_SMS_ENDPOINT = "sms.tencentcloudapi.com";
const TENCENT_SMS_SERVICE = "sms";
const TENCENT_SMS_ACTION = "SendSms";
const TENCENT_SMS_VERSION = "2021-01-11";

const smsCodeStore = new Map<
  string,
  {
    code: string;
    expiresAt: number;
  }
>();

const sanitizeStoredNicknameSql = sql`CASE
  WHEN ${users.nickname} IN ('微信用户', '开发用户', '测试用户')
    OR ${users.nickname} LIKE '用户____'
  THEN ''
  ELSE ${users.nickname}
END`;

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

function generateSmsCode() {
  if (process.env.SMS_MOCK_CODE?.trim()) {
    return process.env.SMS_MOCK_CODE.trim();
  }

  if (process.env.NODE_ENV !== "production" || process.env.ENABLE_DEV_LOGIN === "true") {
    return DEFAULT_SMS_CODE;
  }

  return Math.floor(100000 + Math.random() * 900000).toString();
}

function isSmsProviderConfigured() {
  return Boolean(
    process.env.TENCENT_SECRET_ID?.trim() &&
      process.env.TENCENT_SECRET_KEY?.trim() &&
      process.env.TENCENT_SMS_APP_ID?.trim() &&
      process.env.TENCENT_SMS_SIGN_NAME?.trim() &&
      process.env.TENCENT_SMS_TEMPLATE_ID?.trim(),
  );
}

function shouldUseMockSms() {
  return !isSmsProviderConfigured() && process.env.NODE_ENV !== "production";
}

function sha256Hex(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function hmacSha256(key: string | Buffer, value: string) {
  return createHmac("sha256", key).update(value).digest();
}

function formatTencentDate(timestamp: number) {
  return new Date(timestamp * 1000).toISOString().slice(0, 10);
}

function buildTemplateParamSet(code: string) {
  const ttlMinutes = Math.max(1, Math.ceil(SMS_CODE_TTL_MS / 60_000)).toString();
  const templateParams = process.env.TENCENT_SMS_TEMPLATE_PARAMS?.trim();
  if (!templateParams) return [code];

  return templateParams.split(",").map((param) =>
    param
      .trim()
      .replaceAll("{code}", code)
      .replaceAll("{ttlMinutes}", ttlMinutes),
  );
}

async function sendTencentSmsCode(phone: string, code: string) {
  const secretId = process.env.TENCENT_SECRET_ID?.trim();
  const secretKey = process.env.TENCENT_SECRET_KEY?.trim();
  const smsSdkAppId = process.env.TENCENT_SMS_APP_ID?.trim();
  const signName = process.env.TENCENT_SMS_SIGN_NAME?.trim();
  const templateId = process.env.TENCENT_SMS_TEMPLATE_ID?.trim();
  const region = process.env.TENCENT_SMS_REGION?.trim() || "ap-guangzhou";

  if (!secretId || !secretKey || !smsSdkAppId || !signName || !templateId) {
    throw new Error("短信服务未配置");
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const date = formatTencentDate(timestamp);
  const payload = JSON.stringify({
    PhoneNumberSet: [`+86${phone}`],
    SmsSdkAppId: smsSdkAppId,
    SignName: signName,
    TemplateId: templateId,
    TemplateParamSet: buildTemplateParamSet(code),
  });
  const hashedRequestPayload = sha256Hex(payload);
  const canonicalRequest = [
    "POST",
    "/",
    "",
    `content-type:application/json; charset=utf-8\nhost:${TENCENT_SMS_ENDPOINT}\nx-tc-action:${TENCENT_SMS_ACTION.toLowerCase()}\n`,
    "content-type;host;x-tc-action",
    hashedRequestPayload,
  ].join("\n");
  const credentialScope = `${date}/${TENCENT_SMS_SERVICE}/tc3_request`;
  const hashedCanonicalRequest = sha256Hex(canonicalRequest);
  const stringToSign = [
    "TC3-HMAC-SHA256",
    timestamp.toString(),
    credentialScope,
    hashedCanonicalRequest,
  ].join("\n");
  const secretDate = hmacSha256(`TC3${secretKey}`, date);
  const secretService = hmacSha256(secretDate, TENCENT_SMS_SERVICE);
  const secretSigning = hmacSha256(secretService, "tc3_request");
  const signature = createHmac("sha256", secretSigning).update(stringToSign).digest("hex");
  const authorization = [
    `TC3-HMAC-SHA256 Credential=${secretId}/${credentialScope}`,
    "SignedHeaders=content-type;host;x-tc-action",
    `Signature=${signature}`,
  ].join(", ");

  const res = await fetch(`https://${TENCENT_SMS_ENDPOINT}`, {
    method: "POST",
    headers: {
      Authorization: authorization,
      "Content-Type": "application/json; charset=utf-8",
      Host: TENCENT_SMS_ENDPOINT,
      "X-TC-Action": TENCENT_SMS_ACTION,
      "X-TC-Timestamp": timestamp.toString(),
      "X-TC-Version": TENCENT_SMS_VERSION,
      "X-TC-Region": region,
    },
    body: payload,
  });
  const data = (await res.json()) as {
    Response?: {
      Error?: { Code?: string; Message?: string };
      SendStatusSet?: Array<{ Code?: string; Message?: string }>;
    };
  };
  const response = data.Response;
  const sendStatus = response?.SendStatusSet?.[0];

  if (!res.ok || response?.Error || sendStatus?.Code !== "Ok") {
    throw new Error(response?.Error?.Message || sendStatus?.Message || "短信发送失败");
  }
}

async function sendSmsCode(phone: string, code: string) {
  if (shouldUseMockSms()) {
    console.info(`[auth] mock sms login code for ${phone}: ${code}`);
    return;
  }

  await sendTencentSmsCode(phone, code);
}

function verifySmsCode(phone: string, code: string) {
  const cached = smsCodeStore.get(phone);
  if (!cached || cached.expiresAt < Date.now()) {
    smsCodeStore.delete(phone);
    return false;
  }

  if (cached.code !== code) {
    return false;
  }

  smsCodeStore.delete(phone);
  return true;
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
      nickname: "",
    })
    .onConflictDoUpdate({
      target: users.wechatOpenid,
      set: { nickname: sanitizeStoredNicknameSql },
    })
    .returning();

  const token = await signToken(user.id);
  return c.json({ token, user });
});

// 手机号验证码登录
auth.post("/phone/send-code", async (c) => {
  const rawBody = await c.req.json().catch(() => null);
  const parsedBody = bindPhoneSendCodeSchema.safeParse(rawBody);
  if (!parsedBody.success) {
    return c.json({ error: "Invalid phone" }, 400);
  }

  const { phone } = parsedBody.data;
  const code = generateSmsCode();
  smsCodeStore.set(phone, {
    code,
    expiresAt: Date.now() + SMS_CODE_TTL_MS,
  });
  try {
    await sendSmsCode(phone, code);
  } catch (error) {
    smsCodeStore.delete(phone);
    return c.json({ error: error instanceof Error ? error.message : "短信发送失败" }, 502);
  }

  return c.json({
    accepted: true,
    expiresIn: Math.floor(SMS_CODE_TTL_MS / 1000),
    ...(shouldUseMockSms() || process.env.SMS_MOCK_CODE?.trim()
      ? { mockCode: code }
      : {}),
  });
});

auth.post("/phone", async (c) => {
  const rawBody = await c.req.json().catch(() => null);
  const parsedBody = bindPhoneVerifySchema.safeParse(rawBody);
  if (!parsedBody.success) return c.json({ error: "phone and code required" }, 400);

  const { phone, code } = parsedBody.data;
  if (!verifySmsCode(phone, code)) {
    return c.json({ error: "验证码错误" }, 400);
  }

  // 使用 upsert 避免并发首次登录的竞态条件
  const [user] = await db
    .insert(users)
    .values({
      phone,
      nickname: "",
    })
    .onConflictDoUpdate({
      target: users.phone,
      set: { nickname: sanitizeStoredNicknameSql },
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
        nickname: "",
      })
      .onConflictDoUpdate({
        target: users.phone,
        set: { nickname: sanitizeStoredNicknameSql },
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
        nickname: "",
      })
      .onConflictDoUpdate({
        target: users.phone,
        set: { nickname: sanitizeStoredNicknameSql },
      })
      .returning();

    const token = await signToken(user.id);
    return c.json({ token, user });
  });
}

export default auth;
