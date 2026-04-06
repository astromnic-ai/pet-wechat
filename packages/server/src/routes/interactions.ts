import { Hono } from "hono";
import { and, asc, eq, gte, isNull } from "drizzle-orm";
import { db } from "../db";
import { desktopPetBindings, deviceInteractions, pets } from "../db/schema";
import { broadcast } from "../ws";

const interactionsRoute = new Hono();

const VALID_INTERACTION_TYPES = new Set(["touch", "shake", "gesture"]);
const VALID_RANGES = new Set(["day", "week", "month"]);

type InteractionType = "touch" | "shake" | "gesture";
type StatsRange = "day" | "week" | "month";
const MAX_FUTURE_TIMESTAMP_MS = 60 * 60 * 1000;

function normalizeTimestamp(timestamp: Date | string) {
  return timestamp instanceof Date ? timestamp.toISOString() : timestamp;
}

function normalizeDateKey(timestamp: Date | string) {
  return normalizeTimestamp(timestamp).slice(0, 10);
}

function normalizeCount(value: unknown, defaultValue: number) {
  if (value === undefined) {
    return defaultValue;
  }

  if (typeof value !== "number" || !Number.isInteger(value)) {
    return null;
  }

  if (value < 1 || value > 1000) {
    return null;
  }

  return value;
}

function parseInteractionTimestamp(value: unknown) {
  if (value === undefined) {
    return new Date();
  }

  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) {
    return null;
  }

  if (timestamp.getTime() > Date.now() + MAX_FUTURE_TIMESTAMP_MS) {
    return "timestamp 不能晚于当前时间 1 小时";
  }

  return timestamp;
}

async function ensureOwnedPet(userId: string, petId: string) {
  const [pet] = await db
    .select()
    .from(pets)
    .where(and(eq(pets.id, petId), eq(pets.userId, userId)))
    .limit(1);

  return pet ?? null;
}

function getRangeStart(range: StatsRange) {
  const now = Date.now();

  switch (range) {
    case "week":
      return new Date(now - 7 * 24 * 60 * 60 * 1000);
    case "month":
      return new Date(now - 30 * 24 * 60 * 60 * 1000);
    case "day":
    default:
      return new Date(now - 24 * 60 * 60 * 1000);
  }
}

interactionsRoute.post("/", async (c) => {
  const body = await c.req.json<{
    desktopDeviceId?: string;
    petId?: string;
    interactionType?: string;
    count?: number;
    timestamp?: string;
  }>();
  const desktopDeviceId =
    typeof body.desktopDeviceId === "string" ? body.desktopDeviceId.trim() : "";
  const petId = typeof body.petId === "string" ? body.petId.trim() : "";
  const interactionType = body.interactionType;
  const count = normalizeCount(body.count, 1);
  const timestamp = parseInteractionTimestamp(body.timestamp);

  if (!desktopDeviceId || !petId) {
    return c.json({ error: "desktopDeviceId 和 petId 必填" }, 400);
  }

  if (!VALID_INTERACTION_TYPES.has(interactionType ?? "")) {
    return c.json({ error: "无效的 interactionType" }, 400);
  }

  if (count === null) {
    return c.json({ error: "count 必须是 1-1000 的正整数" }, 400);
  }

  if (timestamp === null) {
    return c.json({ error: "timestamp 格式错误" }, 400);
  }

  if (typeof timestamp === "string") {
    return c.json({ error: timestamp }, 400);
  }

  const [binding] = await db
    .select()
    .from(desktopPetBindings)
    .where(
      and(
        eq(desktopPetBindings.desktopDeviceId, desktopDeviceId),
        eq(desktopPetBindings.petId, petId),
        isNull(desktopPetBindings.unboundAt),
      ),
    )
    .limit(1);

  if (!binding) {
    return c.json({ error: "桌面设备与宠物未绑定" }, 400);
  }

  const [pet] = await db
    .select()
    .from(pets)
    .where(eq(pets.id, petId))
    .limit(1);

  if (!pet) {
    return c.json({ error: "Pet not found" }, 404);
  }

  const [interaction] = await db
    .insert(deviceInteractions)
    .values({
      desktopDeviceId,
      petId,
      interactionType: interactionType as InteractionType,
      count,
      timestamp,
    })
    .returning();

  broadcast(pet.userId, {
    type: "interaction:new",
    data: {
      interactionId: interaction.id,
      desktopDeviceId: interaction.desktopDeviceId,
      petId: interaction.petId,
      interactionType: interaction.interactionType,
      count: interaction.count,
      timestamp: normalizeTimestamp(interaction.timestamp),
    },
  });

  return c.json({ interaction }, 201);
});

interactionsRoute.get("/:petId/stats", async (c) => {
  const userId = c.get("userId" as never) as string;
  const petId = c.req.param("petId");
  const range = (c.req.query("range") ?? "day") as StatsRange;

  if (!VALID_RANGES.has(range)) {
    return c.json({ error: "无效的 range 参数" }, 400);
  }

  const pet = await ensureOwnedPet(userId, petId);
  if (!pet) {
    return c.json({ error: "Pet not found" }, 404);
  }

  const interactions = await db
    .select()
    .from(deviceInteractions)
    .where(and(eq(deviceInteractions.petId, petId), gte(deviceInteractions.timestamp, getRangeStart(range))))
    .orderBy(asc(deviceInteractions.timestamp));

  const byType: Record<InteractionType, number> = {
    touch: 0,
    shake: 0,
    gesture: 0,
  };
  const trendMap = new Map<string, number>();
  let totalCount = 0;

  for (const interaction of interactions) {
    totalCount += interaction.count;
    byType[interaction.interactionType] += interaction.count;

    const dateKey = normalizeDateKey(interaction.timestamp);
    trendMap.set(dateKey, (trendMap.get(dateKey) ?? 0) + interaction.count);
  }

  const trend = Array.from(trendMap.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, count]) => ({ date, count }));

  return c.json({
    totalCount,
    byType,
    trend,
  });
});

export default interactionsRoute;
