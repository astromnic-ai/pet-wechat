import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { db } from "../db";
import { users } from "../db/schema";
import { eq } from "drizzle-orm";

// TODO: 生产环境必须通过环境变量设置 JWT_SECRET，当前回退值仅用于开发
const JWT_SECRET = process.env.JWT_SECRET ?? "wispnook-dev-secret-change-in-prod";

export interface JwtPayload {
  userId: string;
  exp: number;
}

export async function signToken(userId: string): Promise<string> {
  const payload: JwtPayload = {
    userId,
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30, // 30 days
  };
  const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = btoa(JSON.stringify(payload));
  const data = `${header}.${body}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(JWT_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  const signature = btoa(String.fromCharCode(...new Uint8Array(sig)));
  return `${data}.${signature}`;
}

export async function verifyToken(token: string): Promise<JwtPayload> {
  const [header, body, signature] = token.split(".");
  if (!header || !body || !signature) throw new Error("Invalid token");

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(JWT_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );
  const data = `${header}.${body}`;
  const sigBytes = Uint8Array.from(atob(signature), (c) => c.charCodeAt(0));
  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    sigBytes,
    new TextEncoder().encode(data)
  );
  if (!valid) throw new Error("Invalid signature");

  const payload: JwtPayload = JSON.parse(atob(body));
  if (payload.exp < Math.floor(Date.now() / 1000)) throw new Error("Token expired");
  return payload;
}

export const authMiddleware = createMiddleware<{
  Variables: { userId: string };
}>(async (c, next) => {
  // admin 路由使用独立的 admin key 认证，跳过 JWT 校验
  if (c.req.path.startsWith("/api/admin")) {
    await next();
    return;
  }

  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw new HTTPException(401, { message: "Missing token" });
  }
  try {
    const payload = await verifyToken(authHeader.slice(7));
    c.set("userId", payload.userId);
    await next();
  } catch {
    throw new HTTPException(401, { message: "Invalid token" });
  }
});
