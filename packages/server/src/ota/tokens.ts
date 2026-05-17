import { createHash, randomBytes } from "node:crypto";
import { eq, and, isNull, desc } from "drizzle-orm";
import { db } from "../db";
import { otaTokens } from "../db/schema";

export type OtaTokenRow = typeof otaTokens.$inferSelect;

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function createOtaToken(opts: { name: string; createdBy: string }) {
  const token = `ota_${randomBytes(32).toString("base64url")}`;
  const tokenHash = hashToken(token);
  const tokenPrefix = token.slice(0, 12);

  const [row] = await db
    .insert(otaTokens)
    .values({
      name: opts.name,
      tokenHash,
      tokenPrefix,
      createdBy: opts.createdBy,
    })
    .returning();

  return { token, row };
}

export async function verifyOtaToken(token: string) {
  const tokenHash = hashToken(token);
  const [row] = await db
    .select()
    .from(otaTokens)
    .where(and(eq(otaTokens.tokenHash, tokenHash), isNull(otaTokens.revokedAt)))
    .limit(1);

  if (!row) return null;

  await db
    .update(otaTokens)
    .set({ lastUsedAt: new Date() })
    .where(eq(otaTokens.id, row.id));

  return row;
}

export async function listOtaTokens() {
  return await db
    .select({
      id: otaTokens.id,
      name: otaTokens.name,
      tokenPrefix: otaTokens.tokenPrefix,
      createdAt: otaTokens.createdAt,
      createdBy: otaTokens.createdBy,
      revokedAt: otaTokens.revokedAt,
      lastUsedAt: otaTokens.lastUsedAt,
    })
    .from(otaTokens)
    .orderBy(desc(otaTokens.createdAt));
}

export async function revokeOtaToken(id: string) {
  const [row] = await db
    .update(otaTokens)
    .set({ revokedAt: new Date() })
    .where(eq(otaTokens.id, id))
    .returning();
  return row ?? null;
}
