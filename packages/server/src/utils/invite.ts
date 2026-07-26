/**
 * 邀请码工具：使用 HMAC 签名生成/验证邀请码
 * 邀请码编码了 fromUserId + petId，无需额外数据库表
 */

import { createHmac, timingSafeEqual } from "crypto";

const INVITE_SECRET =
  process.env.INVITE_SECRET ?? "wispnook-invite-secret-dev";

const INVITE_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 天过期

interface InvitePayload {
  fromUserId: string;
  petId: string;
  createdAt: number;
}

function toBase64Url(value: string | Buffer): string {
  return Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fromBase64Url(value: string): Buffer {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(padded, "base64");
}

function signInviteData(data: string): Buffer {
  return createHmac("sha256", INVITE_SECRET).update(data).digest();
}

export function generateInviteCode(payload: InvitePayload): string {
  const data = toBase64Url(JSON.stringify(payload));
  const signature = toBase64Url(signInviteData(data));
  return `${data}.${signature}`;
}

export function verifyInviteCode(code: string): InvitePayload | null {
  try {
    const [data, signature] = code.split(".");
    if (!data || !signature) return null;

    const expectedSignature = signInviteData(data);
    const actualSignature = fromBase64Url(signature);

    if (
      expectedSignature.length !== actualSignature.length ||
      !timingSafeEqual(expectedSignature, actualSignature)
    ) {
      return null;
    }

    const payload = JSON.parse(fromBase64Url(data).toString("utf8")) as Partial<InvitePayload>;
    if (typeof payload.fromUserId !== "string" || typeof payload.petId !== "string") {
      return null;
    }

    // 检查过期（无 createdAt 的旧码视为过期）
    if (typeof payload.createdAt !== "number" || Date.now() - payload.createdAt > INVITE_EXPIRY_MS) {
      return null;
    }

    return {
      fromUserId: payload.fromUserId,
      petId: payload.petId,
      createdAt: payload.createdAt,
    };
  } catch {
    return null;
  }
}
