import { Hono } from "hono";
import { and, asc, desc, eq, isNotNull, isNull, type SQL } from "drizzle-orm";
import { db } from "../../db";
import { users, pets, collarDevices, desktopDevices, desktopPetBindings, petBehaviors } from "../../db/schema";
import { createId } from "../../utils/id";
import { pick } from "./utils";

async function validateCollarPetBinding(collarDeviceId: string, petId: string) {
  const [collar] = await db.select().from(collarDevices).where(eq(collarDevices.id, collarDeviceId));
  if (!collar) {
    return { valid: false as const, status: 404 as const, error: "Collar not found" };
  }
  if (collar.petId !== petId) {
    return { valid: false as const, status: 400 as const, error: "项圈与宠物不匹配" };
  }
  return { valid: true as const, collar };
}

const devicesRoute = new Hono();

type AdminDesktopRow = {
  desktop: typeof desktopDevices.$inferSelect;
  ownerNickname: string | null;
  bindingId: string | null;
  bindingPetId: string | null;
  bindingPetName: string | null;
};

function mapDesktopRows(rows: AdminDesktopRow[]) {
  const desktops = new Map<
    string,
    typeof desktopDevices.$inferSelect & {
      ownerNickname: string | null;
      bindingPetNames: string[];
      activeBindingCount: number;
    }
  >();

  for (const row of rows) {
    const bindingPetLabel = row.bindingPetName ?? row.bindingPetId ?? "已绑定宠物";
    const existing = desktops.get(row.desktop.id);
    if (existing) {
      if (row.bindingId && !existing.bindingPetNames.includes(bindingPetLabel)) {
        existing.bindingPetNames.push(bindingPetLabel);
      }
      continue;
    }

    desktops.set(row.desktop.id, {
      ...row.desktop,
      ownerNickname: row.ownerNickname,
      bindingPetNames: row.bindingId ? [bindingPetLabel] : [],
      activeBindingCount: 0,
    });
  }

  return Array.from(desktops.values()).map((desktop) => ({
    ...desktop,
    activeBindingCount: desktop.bindingPetNames.length,
  }));
}

devicesRoute.get("/collars", async (c) => {
  const status = c.req.query("status");
  const bound = c.req.query("bound");
  const species = c.req.query("species");
  const sort = c.req.query("sort");
  const order = c.req.query("order");

  const filters: SQL[] = [];

  if (status === "online" || status === "offline") {
    filters.push(eq(collarDevices.status, status));
  }

  if (bound === "true") {
    filters.push(isNotNull(collarDevices.userId));
  } else if (bound === "false") {
    filters.push(isNull(collarDevices.userId));
  }

  if (species === "cat" || species === "dog") {
    filters.push(eq(pets.species, species));
  }

  const sortField = sort === "lastOnlineAt" ? collarDevices.lastOnlineAt : collarDevices.createdAt;
  const orderBy = order === "asc" ? asc(sortField) : desc(sortField);

  const result = await db
    .select({
      collar: collarDevices,
      ownerNickname: users.nickname,
      petName: pets.name,
    })
    .from(collarDevices)
    .leftJoin(users, eq(collarDevices.userId, users.id))
    .leftJoin(pets, eq(collarDevices.petId, pets.id))
    .where(filters.length > 0 ? and(...filters) : undefined)
    .orderBy(orderBy);
  return c.json({
    collars: result.map((row) => ({
      ...row.collar,
      ownerNickname: row.ownerNickname,
      petName: row.petName,
    })),
  });
});

devicesRoute.post("/collars", async (c) => {
  const body = await c.req.json();
  const [collar] = await db
    .insert(collarDevices)
    .values({
      userId: body.userId ?? null,
      name: body.name?.trim() || "未命名项圈",
      macAddress: body.macAddress ?? `MOCK:${createId().slice(0, 11).replace(/(.{2})/g, "$1:").slice(0, 17)}`,
      petId: body.userId ? (body.petId ?? null) : null,
      status: body.status ?? "offline",
      battery: body.battery ?? 100,
      signal: body.signal ?? -50,
      firmwareVersion: body.firmwareVersion ?? "1.0.0",
    })
    .returning();
  return c.json({ collar }, 201);
});

devicesRoute.put("/collars/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json();
  const allowed = pick(body, ["name", "macAddress", "petId", "status", "battery", "signal", "firmwareVersion", "userId"]);
  const [collar] = await db
    .update(collarDevices)
    .set({ ...allowed, updatedAt: new Date() })
    .where(eq(collarDevices.id, id))
    .returning();
  if (!collar) return c.json({ error: "Collar not found" }, 404);
  return c.json({ collar });
});

devicesRoute.delete("/collars/:id", async (c) => {
  const id = c.req.param("id");
  await db.delete(petBehaviors).where(eq(petBehaviors.collarDeviceId, id));
  await db.delete(collarDevices).where(eq(collarDevices.id, id));
  return c.json({ success: true });
});

devicesRoute.get("/desktops", async (c) => {
  const status = c.req.query("status");
  const bound = c.req.query("bound");
  const sort = c.req.query("sort");
  const order = c.req.query("order");

  const filters: SQL[] = [];

  if (status === "online" || status === "offline") {
    filters.push(eq(desktopDevices.status, status));
  }

  if (bound === "true") {
    filters.push(isNotNull(desktopPetBindings.id));
  } else if (bound === "false") {
    filters.push(isNull(desktopPetBindings.id));
  }

  const sortField = sort === "lastOnlineAt" ? desktopDevices.lastOnlineAt : desktopDevices.createdAt;
  const orderBy = order === "asc" ? asc(sortField) : desc(sortField);

  const result = await db
    .select({
      desktop: desktopDevices,
      ownerNickname: users.nickname,
      bindingId: desktopPetBindings.id,
      bindingPetId: desktopPetBindings.petId,
      bindingPetName: pets.name,
    })
    .from(desktopDevices)
    .leftJoin(users, eq(desktopDevices.userId, users.id))
    .leftJoin(
      desktopPetBindings,
      and(
        eq(desktopPetBindings.desktopDeviceId, desktopDevices.id),
        isNull(desktopPetBindings.unboundAt),
      ),
    )
    .leftJoin(pets, eq(desktopPetBindings.petId, pets.id))
    .where(filters.length > 0 ? and(...filters) : undefined)
    .orderBy(orderBy);
  return c.json({
    desktops: mapDesktopRows(result as AdminDesktopRow[]),
  });
});

devicesRoute.post("/desktops", async (c) => {
  const body = await c.req.json();
  const [desktop] = await db
    .insert(desktopDevices)
    .values({
      userId: body.userId ?? null,
      name: body.name?.trim() || "未命名桌面端",
      macAddress: body.macAddress ?? `MOCK:${createId().slice(0, 11).replace(/(.{2})/g, "$1:").slice(0, 17)}`,
      status: body.status ?? "offline",
      firmwareVersion: body.firmwareVersion ?? "1.0.0",
    })
    .returning();
  return c.json({ desktop }, 201);
});

devicesRoute.put("/desktops/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json();
  const allowed = pick(body, ["name", "macAddress", "status", "firmwareVersion", "userId"]);
  const [desktop] = await db
    .update(desktopDevices)
    .set({ ...allowed, updatedAt: new Date() })
    .where(eq(desktopDevices.id, id))
    .returning();
  if (!desktop) return c.json({ error: "Desktop not found" }, 404);
  return c.json({ desktop });
});

devicesRoute.delete("/desktops/:id", async (c) => {
  const id = c.req.param("id");
  await db.update(desktopPetBindings).set({ unboundAt: new Date() }).where(eq(desktopPetBindings.desktopDeviceId, id));
  await db.delete(desktopDevices).where(eq(desktopDevices.id, id));
  return c.json({ success: true });
});

devicesRoute.get("/behaviors", async (c) => {
  const limit = Number(c.req.query("limit") ?? 50);
  const result = await db
    .select({
      behavior: petBehaviors,
      petName: pets.name,
      collarName: collarDevices.name,
    })
    .from(petBehaviors)
    .leftJoin(pets, eq(petBehaviors.petId, pets.id))
    .leftJoin(collarDevices, eq(petBehaviors.collarDeviceId, collarDevices.id))
    .orderBy(desc(petBehaviors.timestamp))
    .limit(limit);
  return c.json({
    behaviors: result.map((row) => ({
      ...row.behavior,
      petName: row.petName,
      collarName: row.collarName,
    })),
  });
});

devicesRoute.post("/behaviors", async (c) => {
  const body = await c.req.json();
  const validation = await validateCollarPetBinding(body.collarDeviceId, body.petId);
  if (!validation.valid) {
    return c.json({ error: validation.error }, validation.status);
  }
  const [behavior] = await db
    .insert(petBehaviors)
    .values({
      petId: body.petId,
      collarDeviceId: body.collarDeviceId,
      actionType: body.actionType,
      timestamp: body.timestamp ? new Date(body.timestamp) : new Date(),
    })
    .returning();
  return c.json({ behavior }, 201);
});

devicesRoute.post("/behaviors/auto", async (c) => {
  const body = await c.req.json<{
    petId: string;
    collarDeviceId: string;
    count?: number;
    intervalMinutes?: number;
  }>();

  const count = Math.min(body.count ?? 10, 100);
  const intervalMinutes = body.intervalMinutes ?? 30;
  const actionTypes = ["walking", "running", "sleeping", "eating", "playing", "resting", "jumping"];
  const now = Date.now();
  const validation = await validateCollarPetBinding(body.collarDeviceId, body.petId);
  if (!validation.valid) {
    return c.json({ error: validation.error }, validation.status);
  }

  const values = Array.from({ length: count }, (_, index) => ({
    petId: body.petId,
    collarDeviceId: body.collarDeviceId,
    actionType: actionTypes[Math.floor(Math.random() * actionTypes.length)],
    timestamp: new Date(now - index * intervalMinutes * 60 * 1000),
  }));

  const behaviors = await db.insert(petBehaviors).values(values).returning();
  return c.json({ behaviors, count: behaviors.length }, 201);
});

export default devicesRoute;
