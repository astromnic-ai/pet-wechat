import { and, eq, ne, sql } from "drizzle-orm";
import { Hono } from "hono";
import {
  DEFAULT_FREE_BENEFITS,
  MEMBERSHIP_LEVEL_LABELS,
  type Membership,
  type MembershipBenefit,
  type MembershipLevel,
  type MembershipStatus,
} from "shared";
import { db } from "../../db";
import { memberships, petAvatars, pets, users } from "../../db/schema";

const membershipsRoute = new Hono();

const VALID_MEMBERSHIP_LEVELS = new Set<MembershipLevel>(
  Object.keys(MEMBERSHIP_LEVEL_LABELS) as MembershipLevel[],
);
const VALID_MEMBERSHIP_STATUSES = new Set<MembershipStatus>([
  "active",
  "expired",
  "suspended",
]);

type MembershipContext = {
  user: typeof users.$inferSelect;
  membership: typeof memberships.$inferSelect | null;
};

type MembershipUpdateBody = {
  level?: unknown;
  status?: unknown;
  expireAt?: unknown;
  benefits?: unknown;
  avatarQuotaTotal?: unknown;
};

function cloneBenefits(benefits: readonly MembershipBenefit[]): MembershipBenefit[] {
  return benefits.map((benefit) => ({ ...benefit }));
}

function isMembershipBenefit(value: unknown): value is MembershipBenefit {
  if (!value || typeof value !== "object") {
    return false;
  }

  const benefit = value as Record<string, unknown>;
  return (
    typeof benefit.key === "string" &&
    typeof benefit.label === "string" &&
    (typeof benefit.value === "string" ||
      (typeof benefit.value === "number" && Number.isFinite(benefit.value)) ||
      benefit.value === null) &&
    typeof benefit.enabled === "boolean"
  );
}

function parseBenefits(value: unknown): MembershipBenefit[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const benefitKeys = new Set<string>();
  const benefits: MembershipBenefit[] = [];

  for (const item of value) {
    if (!isMembershipBenefit(item)) {
      return null;
    }

    const key = item.key.trim();
    const label = item.label.trim();
    if (!key || !label || benefitKeys.has(key)) {
      return null;
    }

    benefitKeys.add(key);
    benefits.push({
      ...item,
      key,
      label,
    });
  }

  return benefits;
}

function resolveStoredBenefits(value: unknown): MembershipBenefit[] {
  const parsed = parseBenefits(value);
  return parsed ?? cloneBenefits(DEFAULT_FREE_BENEFITS);
}

function toIsoString(value: Date | string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  return value instanceof Date ? value.toISOString() : value;
}

function parseExpireAt(value: unknown): Date | null | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  if (typeof value !== "string") {
    return undefined;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function parseAvatarQuotaTotal(value: unknown): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    return undefined;
  }

  return value;
}

async function getMembershipContext(userId: string): Promise<MembershipContext | null> {
  const [context] = await db
    .select({
      user: users,
      membership: memberships,
    })
    .from(users)
    .leftJoin(memberships, eq(memberships.userId, users.id))
    .where(eq(users.id, userId))
    .limit(1);

  if (!context) {
    return null;
  }

  return {
    user: context.user,
    membership: context.membership ?? null,
  };
}

async function getAvatarQuotaUsed(userId: string): Promise<number> {
  const [result] = await db
    .select({
      count: sql<number>`count(*)::int`,
    })
    .from(petAvatars)
    .innerJoin(pets, eq(petAvatars.petId, pets.id))
    .where(and(eq(pets.userId, userId), ne(petAvatars.status, "rejected")));

  return Number(result?.count ?? 0);
}

async function buildMembershipResponse(userId: string): Promise<Membership | null> {
  const context = await getMembershipContext(userId);

  if (!context) {
    return null;
  }

  const avatarQuotaUsed = await getAvatarQuotaUsed(userId);
  const level = context.membership?.level ?? "free";

  return {
    level,
    levelLabel: MEMBERSHIP_LEVEL_LABELS[level],
    status: context.membership?.status ?? "active",
    startAt: toIsoString(context.membership?.startAt ?? context.user.createdAt),
    expireAt: toIsoString(context.membership?.expireAt ?? null),
    benefits: context.membership
      ? resolveStoredBenefits(context.membership.benefits)
      : cloneBenefits(DEFAULT_FREE_BENEFITS),
    avatarQuotaUsed,
    avatarQuotaTotal: context.user.avatarQuota,
  };
}

membershipsRoute.get("/users/:id/membership", async (c) => {
  const membership = await buildMembershipResponse(c.req.param("id"));

  if (!membership) {
    return c.json({ error: "User not found" }, 404);
  }

  return c.json(membership);
});

membershipsRoute.put("/users/:id/membership", async (c) => {
  const userId = c.req.param("id");
  const body = await c.req.json<MembershipUpdateBody>();

  if (!VALID_MEMBERSHIP_LEVELS.has(body.level as MembershipLevel)) {
    return c.json({ error: "Invalid membership level" }, 400);
  }

  if (
    body.status !== undefined &&
    !VALID_MEMBERSHIP_STATUSES.has(body.status as MembershipStatus)
  ) {
    return c.json({ error: "Invalid membership status" }, 400);
  }

  const expireAt = parseExpireAt(body.expireAt);
  if (body.expireAt !== undefined && expireAt === undefined) {
    return c.json({ error: "Invalid expireAt" }, 400);
  }

  const nextBenefits =
    body.benefits === undefined ? undefined : parseBenefits(body.benefits);
  if (body.benefits !== undefined && !nextBenefits) {
    return c.json({ error: "Invalid benefits" }, 400);
  }

  const avatarQuotaTotal = parseAvatarQuotaTotal(body.avatarQuotaTotal);
  if (body.avatarQuotaTotal !== undefined && avatarQuotaTotal === undefined) {
    return c.json({ error: "Invalid avatarQuotaTotal" }, 400);
  }

  const level = body.level as MembershipLevel;

  const updated = await db.transaction(async (tx) => {
    const [context] = await tx
      .select({
        user: users,
        membership: memberships,
      })
      .from(users)
      .leftJoin(memberships, eq(memberships.userId, users.id))
      .where(eq(users.id, userId))
      .limit(1);

    if (!context) {
      return null;
    }

    const currentBenefits = context.membership
      ? resolveStoredBenefits(context.membership.benefits)
      : cloneBenefits(DEFAULT_FREE_BENEFITS);

    const nextAvatarQuotaTotal = avatarQuotaTotal ?? context.user.avatarQuota;

    await tx
      .update(users)
      .set({
        avatarQuota: nextAvatarQuotaTotal,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));

    await tx
      .insert(memberships)
      .values({
        userId,
        level,
        status: (body.status as MembershipStatus | undefined) ?? context.membership?.status ?? "active",
        expireAt:
          expireAt === undefined ? (context.membership?.expireAt ?? null) : expireAt,
        benefits: nextBenefits ?? currentBenefits,
      })
      .onConflictDoUpdate({
        target: memberships.userId,
        set: {
          level,
          status:
            (body.status as MembershipStatus | undefined) ??
            context.membership?.status ??
            "active",
          expireAt:
            expireAt === undefined ? (context.membership?.expireAt ?? null) : expireAt,
          benefits: nextBenefits ?? currentBenefits,
          updatedAt: new Date(),
        },
      });

    return true;
  });

  if (!updated) {
    return c.json({ error: "User not found" }, 404);
  }

  const membership = await buildMembershipResponse(userId);

  if (!membership) {
    return c.json({ error: "User not found" }, 404);
  }

  return c.json(membership);
});

export default membershipsRoute;
