import { Hono } from "hono";
import { and, asc, desc, eq, isNotNull, isNull, sql, type SQL } from "drizzle-orm";
import type {
  AdminDeviceDetail,
  AdminDeviceListItem,
  AdminDeviceRelationItem,
  DeviceClaimStatus,
  DeviceStatus,
  DeviceType,
  DeviceUpgradeStatus,
  Species,
} from "shared";
import { ALL_ACTIONS } from "shared";
import { db } from "../../db";
import { users, pets, collarDevices, desktopDevices, desktopPetBindings, petAvatars, petBehaviors } from "../../db/schema";
import { createId } from "../../utils/id";
import { normalizeMac, NORMALIZED_MAC_REGEX } from "../../utils/mac";
import { buildPageResponse, parsePagination } from "../../utils/pagination";
import { pick } from "./utils";

function normalizeMacOrError(raw: unknown): { ok: true; mac: string } | { ok: false; error: string } {
  if (typeof raw !== "string" || !raw.trim()) {
    return { ok: false, error: "macAddress is required" };
  }
  const mac = normalizeMac(raw);
  if (!NORMALIZED_MAC_REGEX.test(mac)) {
    return { ok: false, error: "Invalid macAddress format" };
  }
  return { ok: true, mac };
}

function randomMac(): string {
  const hex = "0123456789ABCDEF";
  let out = "";
  for (let i = 0; i < 12; i++) out += hex[Math.floor(Math.random() * 16)];
  return out;
}

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

const TOTAL_ACTION_COUNT = ALL_ACTIONS.length;
const DAY_IN_MS = 24 * 60 * 60 * 1000;
const SPECIES_LABELS: Record<Species, string> = {
  cat: "猫",
  dog: "狗",
};
const VALID_DEVICE_TYPES = new Set<DeviceType>(["collar", "desktop"]);
const VALID_STATUS_FILTERS = new Set(["all", "online", "offline", "pairing"]);
const VALID_BINDING_FILTERS = new Set(["all", "bound", "unbound"]);
const VALID_IMAGE_STATUS_FILTERS = new Set(["all", "uploaded", "pending"]);
const VALID_SPECIES_FILTERS = new Set(["all", "cat", "dog", "other"]);
const VALID_SORT_FIELDS = new Set(["createdAt", "lastOnlineAt"]);
const VALID_SORT_ORDERS = new Set(["asc", "desc"]);

type AdminDesktopRow = {
  desktop: typeof desktopDevices.$inferSelect;
  ownerNickname: string | null;
  bindingId: string | null;
  bindingPetId: string | null;
  bindingPetName: string | null;
  bindingPetSpecies: string | null;
  avatarId: string | null;
};

type AdminCollarRow = {
  collar: typeof collarDevices.$inferSelect;
  ownerNickname: string | null;
  petName: string | null;
  petSpecies: string | null;
  avatarId: string | null;
};

type RawDeviceRow = {
  type: DeviceType;
  id: string;
  name: string;
  mac_address: string;
  status: DeviceStatus;
  claim_status: DeviceClaimStatus;
  upgrade_status: DeviceUpgradeStatus;
  firmware_version: string | null;
  user_id: string | null;
  user_nickname: string | null;
  pet_id: string | null;
  pet_name: string | null;
  pet_species: Species | null;
  pet_avatar_url: string | null;
  battery: number | null;
  signal: number | null;
  last_online_at: Date | string | null;
  created_at: Date | string;
  has_uploaded_avatar: boolean | string | number | null;
  avatar_uploaded: number | string | null;
  avatar_total: number | string | null;
  avatar_approved: number | string | null;
  avatar_pending: number | string | null;
  binding_count: number | string | null;
  binding_started_at: Date | string | null;
  owner_avatar_url?: string | null;
};

type RawCountRow = {
  total: number | string;
};

type RawRelatedDeviceRow = {
  type: DeviceType;
  id: string;
  name: string;
  status: DeviceStatus;
  claim_status: DeviceClaimStatus;
  last_online_at: Date | string | null;
  created_at: Date | string;
};

type DeviceListFilters = {
  keyword: string;
  type: DeviceType | "all";
  model: string;
  imageStatus: "all" | "uploaded" | "pending";
  bindingStatus: "all" | "bound" | "unbound";
  species: "all" | Species | "other";
  status: "all" | DeviceStatus;
  sort: "createdAt" | "lastOnlineAt";
  order: "asc" | "desc";
};

function toIsoString(value: Date | string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  return value instanceof Date ? value.toISOString() : value;
}

function toRequiredIsoString(value: Date | string): string {
  return toIsoString(value) ?? new Date(0).toISOString();
}

function toInt(value: number | string | null | undefined, fallback = 0): number {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "string" && value.length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  return fallback;
}

function toNullableInt(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  return toInt(value);
}

function toBoolean(value: boolean | string | number | null | undefined): boolean {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return value !== 0;
  }

  if (typeof value === "string") {
    const normalized = value.toLowerCase();
    return normalized === "true" || normalized === "t" || normalized === "1";
  }

  return false;
}

function calculateCompanionDays(value: Date | string | null | undefined): number {
  if (!value) {
    return 0;
  }

  const start = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(start.getTime())) {
    return 0;
  }

  return Math.max(0, Math.floor((Date.now() - start.getTime()) / DAY_IN_MS));
}

function toAdminDeviceListItem(row: RawDeviceRow): AdminDeviceListItem {
  return {
    type: row.type,
    id: row.id,
    name: row.name,
    macAddress: row.mac_address,
    status: row.status,
    claimStatus: row.claim_status,
    upgradeStatus: row.upgrade_status,
    firmwareVersion: row.firmware_version,
    userId: row.user_id,
    userNickname: row.user_nickname,
    petId: row.pet_id,
    petName: row.pet_name,
    petSpecies: row.pet_species,
    petAvatarUrl: row.pet_avatar_url,
    battery: toNullableInt(row.battery),
    signal: toNullableInt(row.signal),
    lastOnlineAt: toIsoString(row.last_online_at),
    createdAt: toRequiredIsoString(row.created_at),
    hasUploadedAvatar: toBoolean(row.has_uploaded_avatar),
    avatarProgress: {
      uploaded: toInt(row.avatar_uploaded),
      total: toInt(row.avatar_total, TOTAL_ACTION_COUNT),
    },
    bindingCount: toInt(row.binding_count),
  };
}

function toAdminDeviceRelationItem(row: RawRelatedDeviceRow): AdminDeviceRelationItem {
  return {
    type: row.type,
    id: row.id,
    name: row.name,
    status: row.status,
    claimStatus: row.claim_status,
    lastOnlineAt: toIsoString(row.last_online_at),
    createdAt: toRequiredIsoString(row.created_at),
  };
}

async function executeRows<T extends Record<string, unknown>>(query: SQL): Promise<T[]> {
  return await db.execute(query) as unknown as T[];
}

function toTextArraySql(values: readonly string[]) {
  return sql`ARRAY[${sql.join(values.map((value) => sql`${value}`), sql`, `)}]::text[]`;
}

function getDeviceAggregationCtes() {
  return sql`
    WITH avatar_counts_by_pet AS (
      SELECT
        pa.pet_id,
        BOOL_OR(pa.status IN ('approved', 'done')) AS has_uploaded_avatar,
        COUNT(DISTINCT paa.action_type) FILTER (
          WHERE paa.action_type = ANY(${toTextArraySql(ALL_ACTIONS)})
        )::int AS uploaded_actions,
        COUNT(DISTINCT pa.id) FILTER (
          WHERE pa.status IN ('approved', 'done')
        )::int AS approved_count,
        COUNT(DISTINCT pa.id) FILTER (
          WHERE pa.status IN ('pending', 'processing')
        )::int AS pending_count
      FROM pet_avatars pa
      LEFT JOIN pet_avatar_actions paa ON paa.pet_avatar_id = pa.id
      GROUP BY pa.pet_id
    ),
    avatar_latest_by_pet AS (
      SELECT DISTINCT ON (pa.pet_id)
        pa.pet_id,
        NULLIF(pa.source_image_url, '') AS pet_avatar_url
      FROM pet_avatars pa
      WHERE NULLIF(pa.source_image_url, '') IS NOT NULL
      ORDER BY
        pa.pet_id,
        CASE WHEN pa.status IN ('approved', 'done') THEN 0 ELSE 1 END,
        pa.created_at DESC,
        pa.id DESC
    ),
    avatar_stats_by_pet AS (
      SELECT
        COALESCE(ac.pet_id, al.pet_id) AS pet_id,
        COALESCE(ac.has_uploaded_avatar, false) AS has_uploaded_avatar,
        al.pet_avatar_url,
        COALESCE(ac.uploaded_actions, 0) AS uploaded_actions,
        COALESCE(ac.approved_count, 0) AS approved_count,
        COALESCE(ac.pending_count, 0) AS pending_count
      FROM avatar_counts_by_pet ac
      FULL OUTER JOIN avatar_latest_by_pet al ON al.pet_id = ac.pet_id
    ),
    desktop_binding_stats AS (
      SELECT
        b.desktop_device_id,
        COUNT(*)::int AS binding_count
      FROM desktop_pet_bindings b
      WHERE b.unbound_at IS NULL
      GROUP BY b.desktop_device_id
    ),
    desktop_latest_binding AS (
      SELECT DISTINCT ON (b.desktop_device_id)
        b.desktop_device_id,
        b.pet_id,
        b.created_at
      FROM desktop_pet_bindings b
      WHERE b.unbound_at IS NULL
      ORDER BY b.desktop_device_id, b.created_at DESC, b.id DESC
    ),
    collar_rows AS (
      SELECT
        'collar'::text AS type,
        cd.id,
        cd.name,
        cd.mac_address,
        cd.status,
        cd.claim_status,
        cd.upgrade_status,
        cd.firmware_version,
        cd.user_id,
        u.nickname AS user_nickname,
        cd.pet_id,
        p.name AS pet_name,
        p.species AS pet_species,
        aps.pet_avatar_url,
        cd.battery,
        cd.signal,
        cd.last_online_at,
        cd.created_at,
        COALESCE(aps.has_uploaded_avatar, false) AS has_uploaded_avatar,
        COALESCE(aps.uploaded_actions, 0) AS avatar_uploaded,
        ${TOTAL_ACTION_COUNT}::int AS avatar_total,
        COALESCE(aps.approved_count, 0) AS avatar_approved,
        COALESCE(aps.pending_count, 0) AS avatar_pending,
        CASE WHEN cd.pet_id IS NULL THEN 0 ELSE 1 END::int AS binding_count,
        CASE WHEN cd.pet_id IS NULL THEN NULL ELSE cd.created_at END AS binding_started_at
      FROM collar_devices cd
      LEFT JOIN users u ON u.id = cd.user_id
      LEFT JOIN pets p ON p.id = cd.pet_id
      LEFT JOIN avatar_stats_by_pet aps ON aps.pet_id = cd.pet_id
    ),
    desktop_rows AS (
      SELECT
        'desktop'::text AS type,
        dd.id,
        dd.name,
        dd.mac_address,
        dd.status,
        dd.claim_status,
        dd.upgrade_status,
        dd.firmware_version,
        dd.user_id,
        u.nickname AS user_nickname,
        dlb.pet_id,
        p.name AS pet_name,
        p.species AS pet_species,
        aps.pet_avatar_url,
        NULL::int AS battery,
        NULL::int AS signal,
        dd.last_online_at,
        dd.created_at,
        COALESCE(aps.has_uploaded_avatar, false) AS has_uploaded_avatar,
        COALESCE(aps.uploaded_actions, 0) AS avatar_uploaded,
        ${TOTAL_ACTION_COUNT}::int AS avatar_total,
        COALESCE(aps.approved_count, 0) AS avatar_approved,
        COALESCE(aps.pending_count, 0) AS avatar_pending,
        COALESCE(dbs.binding_count, 0) AS binding_count,
        dlb.created_at AS binding_started_at
      FROM desktop_devices dd
      LEFT JOIN users u ON u.id = dd.user_id
      LEFT JOIN desktop_binding_stats dbs ON dbs.desktop_device_id = dd.id
      LEFT JOIN desktop_latest_binding dlb ON dlb.desktop_device_id = dd.id
      LEFT JOIN pets p ON p.id = dlb.pet_id
      LEFT JOIN avatar_stats_by_pet aps ON aps.pet_id = dlb.pet_id
    ),
    merged_devices AS (
      SELECT * FROM collar_rows
      UNION ALL
      SELECT * FROM desktop_rows
    )
  `;
}

function buildDeviceListWhereClause(filters: DeviceListFilters) {
  const conditions: SQL[] = [];

  if (filters.keyword) {
    const keyword = `%${filters.keyword}%`;
    conditions.push(sql`
      (
        merged_devices.name ILIKE ${keyword}
        OR merged_devices.mac_address ILIKE ${keyword}
        OR COALESCE(merged_devices.user_nickname, '') ILIKE ${keyword}
      )
    `);
  }

  if (filters.type !== "all") {
    conditions.push(sql`merged_devices.type = ${filters.type}`);
  }

  if (filters.model) {
    conditions.push(sql`merged_devices.name ILIKE ${`${filters.model}%`}`);
  }

  if (filters.status !== "all") {
    conditions.push(sql`merged_devices.status = ${filters.status}`);
  }

  if (filters.bindingStatus === "bound") {
    conditions.push(sql`merged_devices.binding_count > 0`);
  } else if (filters.bindingStatus === "unbound") {
    conditions.push(sql`merged_devices.binding_count = 0`);
  }

  if (filters.species === "other") {
    conditions.push(sql`
      (
        (merged_devices.type = 'collar' AND merged_devices.pet_species IS NULL)
        OR
        (
          merged_devices.type = 'desktop'
          AND NOT EXISTS (
            SELECT 1
            FROM desktop_pet_bindings b
            INNER JOIN pets p ON p.id = b.pet_id
            WHERE b.desktop_device_id = merged_devices.id
              AND b.unbound_at IS NULL
              AND p.species IN ('cat', 'dog')
          )
        )
      )
    `);
  } else if (filters.species !== "all") {
    conditions.push(sql`
      (
        (merged_devices.type = 'collar' AND merged_devices.pet_species = ${filters.species})
        OR
        (
          merged_devices.type = 'desktop'
          AND EXISTS (
            SELECT 1
            FROM desktop_pet_bindings b
            INNER JOIN pets p ON p.id = b.pet_id
            WHERE b.desktop_device_id = merged_devices.id
              AND b.unbound_at IS NULL
              AND p.species = ${filters.species}
          )
        )
      )
    `);
  }

  if (filters.imageStatus === "uploaded") {
    conditions.push(sql`
      (
        (merged_devices.type = 'collar' AND COALESCE(merged_devices.has_uploaded_avatar, false))
        OR
        (
          merged_devices.type = 'desktop'
          AND EXISTS (
            SELECT 1
            FROM desktop_pet_bindings b
            LEFT JOIN avatar_counts_by_pet ac ON ac.pet_id = b.pet_id
            WHERE b.desktop_device_id = merged_devices.id
              AND b.unbound_at IS NULL
              AND COALESCE(ac.has_uploaded_avatar, false)
          )
        )
      )
    `);
  } else if (filters.imageStatus === "pending") {
    conditions.push(sql`
      (
        (merged_devices.type = 'collar' AND NOT COALESCE(merged_devices.has_uploaded_avatar, false))
        OR
        (
          merged_devices.type = 'desktop'
          AND NOT EXISTS (
            SELECT 1
            FROM desktop_pet_bindings b
            LEFT JOIN avatar_counts_by_pet ac ON ac.pet_id = b.pet_id
            WHERE b.desktop_device_id = merged_devices.id
              AND b.unbound_at IS NULL
              AND COALESCE(ac.has_uploaded_avatar, false)
          )
        )
      )
    `);
  }

  if (conditions.length === 0) {
    return sql``;
  }

  return sql`WHERE ${sql.join(conditions, sql` AND `)}`;
}

function getDeviceOrderClause(sort: DeviceListFilters["sort"], order: DeviceListFilters["order"]) {
  const primaryColumn = sort === "lastOnlineAt" ? "last_online_at" : "created_at";
  const direction = order.toUpperCase();
  return sql.raw(`${primaryColumn} ${direction} NULLS LAST, type ASC, id DESC`);
}

function mapCollarRows(rows: AdminCollarRow[]) {
  const collars = new Map<
    string,
    typeof collarDevices.$inferSelect & {
      ownerNickname: string | null;
      petName: string | null;
      petSpecies: string | null;
      hasUploadedImage: boolean;
    }
  >();

  for (const row of rows) {
    const existing = collars.get(row.collar.id);
    if (existing) {
      existing.hasUploadedImage = existing.hasUploadedImage || !!row.avatarId;
      continue;
    }

    collars.set(row.collar.id, {
      ...row.collar,
      ownerNickname: row.ownerNickname,
      petName: row.petName,
      petSpecies: row.petSpecies,
      hasUploadedImage: !!row.avatarId,
    });
  }

  return Array.from(collars.values());
}

function mapDesktopRows(rows: AdminDesktopRow[]) {
  const desktops = new Map<
    string,
    typeof desktopDevices.$inferSelect & {
      ownerNickname: string | null;
      bindingPetNames: string[];
      bindingPetSpeciesList: string[];
      activeBindingCount: number;
      hasUploadedImage: boolean;
    }
  >();

  for (const row of rows) {
    const bindingPetLabel = row.bindingPetName ?? row.bindingPetId ?? "已绑定宠物";
    const existing = desktops.get(row.desktop.id);
    if (existing) {
      if (row.bindingId && !existing.bindingPetNames.includes(bindingPetLabel)) {
        existing.bindingPetNames.push(bindingPetLabel);
      }
      if (row.bindingPetSpecies && !existing.bindingPetSpeciesList.includes(row.bindingPetSpecies)) {
        existing.bindingPetSpeciesList.push(row.bindingPetSpecies);
      }
      existing.hasUploadedImage = existing.hasUploadedImage || !!row.avatarId;
      continue;
    }

    desktops.set(row.desktop.id, {
      ...row.desktop,
      ownerNickname: row.ownerNickname,
      bindingPetNames: row.bindingId ? [bindingPetLabel] : [],
      bindingPetSpeciesList: row.bindingPetSpecies ? [row.bindingPetSpecies] : [],
      activeBindingCount: 0,
      hasUploadedImage: !!row.avatarId,
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
      petSpecies: pets.species,
      avatarId: petAvatars.id,
    })
    .from(collarDevices)
    .leftJoin(users, eq(collarDevices.userId, users.id))
    .leftJoin(pets, eq(collarDevices.petId, pets.id))
    .leftJoin(petAvatars, eq(collarDevices.petId, petAvatars.petId))
    .where(filters.length > 0 ? and(...filters) : undefined)
    .orderBy(orderBy);
  return c.json({
    collars: mapCollarRows(result as AdminCollarRow[]),
  });
});

devicesRoute.post("/collars", async (c) => {
  const body = await c.req.json();

  let macAddress: string;
  if (body.macAddress === undefined || body.macAddress === null || body.macAddress === "") {
    macAddress = randomMac();
  } else {
    const check = normalizeMacOrError(body.macAddress);
    if (!check.ok) return c.json({ error: check.error }, 400);
    macAddress = check.mac;
  }

  const [collar] = await db
    .insert(collarDevices)
    .values({
      userId: body.userId ?? null,
      name: body.name?.trim() || "未命名项圈",
      macAddress,
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
  if (allowed.macAddress !== undefined) {
    const check = normalizeMacOrError(allowed.macAddress);
    if (!check.ok) return c.json({ error: check.error }, 400);
    allowed.macAddress = check.mac;
  }
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
      bindingPetSpecies: pets.species,
      avatarId: petAvatars.id,
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
    .leftJoin(petAvatars, eq(desktopPetBindings.petId, petAvatars.petId))
    .where(filters.length > 0 ? and(...filters) : undefined)
    .orderBy(orderBy);
  return c.json({
    desktops: mapDesktopRows(result as AdminDesktopRow[]),
  });
});

devicesRoute.post("/desktops", async (c) => {
  const body = await c.req.json();

  let macAddress: string;
  if (body.macAddress === undefined || body.macAddress === null || body.macAddress === "") {
    macAddress = randomMac();
  } else {
    const check = normalizeMacOrError(body.macAddress);
    if (!check.ok) return c.json({ error: check.error }, 400);
    macAddress = check.mac;
  }

  const [desktop] = await db
    .insert(desktopDevices)
    .values({
      userId: body.userId ?? null,
      name: body.name?.trim() || "未命名桌面端",
      macAddress,
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
  if (allowed.macAddress !== undefined) {
    const check = normalizeMacOrError(allowed.macAddress);
    if (!check.ok) return c.json({ error: check.error }, 400);
    allowed.macAddress = check.mac;
  }
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

devicesRoute.get("/devices", async (c) => {
  const pagination = parsePagination(c);
  const keyword = c.req.query("keyword")?.trim() ?? "";
  const type = (c.req.query("type")?.trim() ?? "all") as DeviceListFilters["type"];
  const model = c.req.query("model")?.trim() ?? "";
  const imageStatus = (c.req.query("imageStatus")?.trim() ?? "all") as DeviceListFilters["imageStatus"];
  const bindingStatus = (c.req.query("bindingStatus")?.trim() ?? "all") as DeviceListFilters["bindingStatus"];
  const species = (c.req.query("species")?.trim() ?? "all") as DeviceListFilters["species"];
  const status = (c.req.query("status")?.trim() ?? "all") as DeviceListFilters["status"];
  const sort = (c.req.query("sort")?.trim() ?? "createdAt") as DeviceListFilters["sort"];
  const order = (c.req.query("order")?.trim() ?? "desc") as DeviceListFilters["order"];

  if (type !== "all" && !VALID_DEVICE_TYPES.has(type)) {
    return c.json({ error: "Invalid type" }, 400);
  }

  if (!VALID_IMAGE_STATUS_FILTERS.has(imageStatus)) {
    return c.json({ error: "Invalid imageStatus" }, 400);
  }

  if (!VALID_BINDING_FILTERS.has(bindingStatus)) {
    return c.json({ error: "Invalid bindingStatus" }, 400);
  }

  if (!VALID_SPECIES_FILTERS.has(species)) {
    return c.json({ error: "Invalid species" }, 400);
  }

  if (!VALID_STATUS_FILTERS.has(status)) {
    return c.json({ error: "Invalid status" }, 400);
  }

  if (!VALID_SORT_FIELDS.has(sort)) {
    return c.json({ error: "Invalid sort" }, 400);
  }

  if (!VALID_SORT_ORDERS.has(order)) {
    return c.json({ error: "Invalid order" }, 400);
  }

  const filters: DeviceListFilters = {
    keyword,
    type,
    model: model === "all" ? "" : model,
    imageStatus,
    bindingStatus,
    species,
    status,
    sort,
    order,
  };
  const whereClause = buildDeviceListWhereClause(filters);
  const orderClause = getDeviceOrderClause(sort, order);

  const [rows, countRows] = await Promise.all([
    executeRows<RawDeviceRow>(sql`
      ${getDeviceAggregationCtes()}
      SELECT
        merged_devices.type,
        merged_devices.id,
        merged_devices.name,
        merged_devices.mac_address,
        merged_devices.status,
        merged_devices.claim_status,
        merged_devices.upgrade_status,
        merged_devices.firmware_version,
        merged_devices.user_id,
        merged_devices.user_nickname,
        merged_devices.pet_id,
        merged_devices.pet_name,
        merged_devices.pet_species,
        merged_devices.pet_avatar_url,
        merged_devices.battery,
        merged_devices.signal,
        merged_devices.last_online_at,
        merged_devices.created_at,
        merged_devices.has_uploaded_avatar,
        merged_devices.avatar_uploaded,
        merged_devices.avatar_total,
        merged_devices.avatar_approved,
        merged_devices.avatar_pending,
        merged_devices.binding_count,
        merged_devices.binding_started_at
      FROM merged_devices
      ${whereClause}
      ORDER BY ${orderClause}
      LIMIT ${pagination.pageSize}
      OFFSET ${pagination.offset}
    `),
    executeRows<RawCountRow>(sql`
      ${getDeviceAggregationCtes()}
      SELECT COUNT(*)::int AS total
      FROM merged_devices
      ${whereClause}
    `),
  ]);

  return c.json(
    buildPageResponse(
      rows.map((row) => toAdminDeviceListItem(row)),
      toInt(countRows[0]?.total),
      pagination,
    ),
  );
});

devicesRoute.get("/devices/:type/:id/detail", async (c) => {
  const type = c.req.param("type") as DeviceType;
  const id = c.req.param("id");

  if (!VALID_DEVICE_TYPES.has(type)) {
    return c.json({ error: "Invalid type" }, 400);
  }

  const [row] = await executeRows<RawDeviceRow>(sql`
    ${getDeviceAggregationCtes()}
    SELECT
      merged_devices.type,
      merged_devices.id,
      merged_devices.name,
      merged_devices.mac_address,
      merged_devices.status,
      merged_devices.claim_status,
      merged_devices.upgrade_status,
      merged_devices.firmware_version,
      merged_devices.user_id,
      merged_devices.user_nickname,
      merged_devices.pet_id,
      merged_devices.pet_name,
      merged_devices.pet_species,
      merged_devices.pet_avatar_url,
      merged_devices.battery,
      merged_devices.signal,
      merged_devices.last_online_at,
      merged_devices.created_at,
      merged_devices.has_uploaded_avatar,
      merged_devices.avatar_uploaded,
      merged_devices.avatar_total,
      merged_devices.avatar_approved,
      merged_devices.avatar_pending,
      merged_devices.binding_count,
      merged_devices.binding_started_at,
      u.avatar_url AS owner_avatar_url
    FROM merged_devices
    LEFT JOIN users u ON u.id = merged_devices.user_id
    WHERE merged_devices.type = ${type}
      AND merged_devices.id = ${id}
    LIMIT 1
  `);

  if (!row) {
    return c.json({ error: "Device not found" }, 404);
  }

  const relatedDevices = row.user_id
    ? await executeRows<RawRelatedDeviceRow>(sql`
        ${getDeviceAggregationCtes()}
        SELECT
          merged_devices.type,
          merged_devices.id,
          merged_devices.name,
          merged_devices.status,
          merged_devices.claim_status,
          merged_devices.last_online_at,
          merged_devices.created_at
        FROM merged_devices
        WHERE merged_devices.user_id = ${row.user_id}
          AND NOT (
            merged_devices.type = ${row.type}
            AND merged_devices.id = ${row.id}
          )
        ORDER BY
          CASE WHEN merged_devices.type <> ${row.type} THEN 0 ELSE 1 END,
          merged_devices.last_online_at DESC NULLS LAST,
          merged_devices.created_at DESC,
          merged_devices.id DESC
      `)
    : [];

  const device = toAdminDeviceListItem(row);
  const detail: AdminDeviceDetail = {
    device,
    owner:
      row.user_id && row.user_nickname
        ? {
            id: row.user_id,
            nickname: row.user_nickname,
            avatarUrl: row.owner_avatar_url ?? null,
          }
        : null,
    pet:
      row.pet_id && row.pet_name && row.pet_species
        ? {
            id: row.pet_id,
            name: row.pet_name,
            species: row.pet_species,
            speciesLabel: SPECIES_LABELS[row.pet_species],
            avatarUrl: row.pet_avatar_url,
            companionDays: calculateCompanionDays(row.binding_started_at),
          }
        : null,
    relatedDevices: relatedDevices.map((item) => toAdminDeviceRelationItem(item)),
    avatarProgress: {
      total: toInt(row.avatar_total, TOTAL_ACTION_COUNT),
      uploaded: toInt(row.avatar_uploaded),
      approved: toInt(row.avatar_approved),
      pending: toInt(row.avatar_pending),
    },
    lastSyncedAt: device.lastOnlineAt,
    activatedAt: device.createdAt,
  };

  return c.json(detail);
});

export default devicesRoute;
