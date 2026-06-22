import { Hono } from "hono";
import { createHash } from "crypto";
import { db } from "../db";
import {
  collarDevices,
  desktopDevices,
  desktopPetBindings,
  deviceAuthorizations,
  firmwareReleases,
  interactionEvents,
  inviteCodes,
  petBehaviors,
  pets,
  users,
} from "../db/schema";
import { eq, and, isNull, desc, sql } from "drizzle-orm";
import { generateInviteCode, verifyInviteCode } from "../utils/invite";
import { normalizeMac, NORMALIZED_MAC_REGEX } from "../utils/mac";
import { getEffectiveDeviceStatus } from "../utils/device-status";
import { deviceTypeSchema } from "../validators/user-end";
import { clearRetainedDesktopConfig, publishDesktopConfig } from "../ota/mqtt-client";

const devicesRoute = new Hono();

function getInviteCodeHash(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

function buildOnlineDeviceState() {
  const now = new Date();
  return {
    status: "online" as const,
    lastOnlineAt: now,
    updatedAt: now,
  };
}

async function findCollarByMac(macAddress: string) {
  const [collar] = await db
    .select()
    .from(collarDevices)
    .where(eq(collarDevices.macAddress, macAddress));

  return collar;
}

async function findCollarByChipId(chipId: string) {
  const [collar] = await db
    .select()
    .from(collarDevices)
    .where(eq(collarDevices.chipId, chipId));

  return collar;
}

async function findDesktopByMac(macAddress: string) {
  const [desktop] = await db
    .select()
    .from(desktopDevices)
    .where(eq(desktopDevices.macAddress, macAddress));

  return desktop;
}

async function findDesktopByChipId(chipId: string) {
  const [desktop] = await db
    .select()
    .from(desktopDevices)
    .where(eq(desktopDevices.chipId, chipId));

  return desktop;
}

type DesktopBindingRow = typeof desktopPetBindings.$inferSelect;
type DesktopDeviceRow = typeof desktopDevices.$inferSelect;
type DeviceOwnershipProbe = {
  deviceType?: "collar" | "desktop";
  macAddress?: string;
  chipId?: string;
};

function normalizeDeviceRegisterBody(body: { macAddress?: string; chipId?: string }) {
  const chipId = body.chipId?.trim() || "";
  const normalizedMac = normalizeMac(body.macAddress ?? "");
  const identity = chipId || normalizedMac;

  if (!identity) {
    return { error: "chipId or macAddress is required" } as const;
  }

  if (body.macAddress && !normalizedMac && !chipId) {
    return { error: "Invalid macAddress format" } as const;
  }

  return {
    chipId: chipId || null,
    macAddress: normalizedMac || chipId,
  } as const;
}

async function publishDesktopBindingConfig(
  desktop: Pick<DesktopDeviceRow, "id" | "chipId">,
  binding: DesktopBindingRow | null,
) {
  if (!desktop.chipId) {
    console.warn("[devices] skip desktop config publish because chipId is missing", {
      desktopId: desktop.id,
      petId: binding?.petId,
    });
    return;
  }

  try {
    if (binding) {
      await publishDesktopConfig(desktop.chipId, {
        v: 1,
        petId: binding.petId,
        bindingId: binding.id,
        bindingType: binding.bindingType,
      });
    } else {
      await clearRetainedDesktopConfig(desktop.chipId, "unbind");
    }
  } catch (error) {
    console.error("[devices] failed to publish desktop config", {
      desktopId: desktop.id,
      chipId: desktop.chipId,
      petId: binding?.petId,
      error,
    });
  }
}

function getInactiveMeta(lastOnlineAt: Date | string | null) {
  if (!lastOnlineAt) {
    return {
      inactiveDays: null,
      isInactive: false,
    };
  }

  const lastOnlineTime = new Date(lastOnlineAt);
  if (Number.isNaN(lastOnlineTime.getTime())) {
    return {
      inactiveDays: null,
      isInactive: false,
    };
  }

  const inactiveDays = Math.max(
    0,
    Math.floor((Date.now() - lastOnlineTime.getTime()) / (24 * 60 * 60 * 1000)),
  );

  return {
    inactiveDays,
    isInactive: inactiveDays > 30,
  };
}

async function getOwnedDesktops(userId: string) {
  const result = await db
    .select({
      desktop: desktopDevices,
      bindingId: desktopPetBindings.id,
      bindingPetId: desktopPetBindings.petId,
      bindingType: desktopPetBindings.bindingType,
    })
    .from(desktopDevices)
    .leftJoin(
      desktopPetBindings,
      and(
        eq(desktopPetBindings.desktopDeviceId, desktopDevices.id),
        isNull(desktopPetBindings.unboundAt),
      ),
    )
    .where(eq(desktopDevices.userId, userId));

  const desktops = new Map<
    string,
    typeof desktopDevices.$inferSelect & {
      bindings: Array<{
        id: string;
        petId: string;
        bindingType: (typeof desktopPetBindings.$inferSelect)["bindingType"];
      }>;
    }
  >();

  for (const row of result) {
    const existing = desktops.get(row.desktop.id);
    if (existing) {
      if (row.bindingId && row.bindingPetId && row.bindingType) {
        existing.bindings.push({
          id: row.bindingId,
          petId: row.bindingPetId,
          bindingType: row.bindingType,
        });
      }
      continue;
    }

    desktops.set(row.desktop.id, {
      ...row.desktop,
      status: getEffectiveDeviceStatus({
        type: "desktop",
        status: row.desktop.status,
        lastOnlineAt: row.desktop.lastOnlineAt,
      }),
      bindings:
        row.bindingId && row.bindingPetId && row.bindingType
          ? [
              {
                id: row.bindingId,
                petId: row.bindingPetId,
                bindingType: row.bindingType,
              },
            ]
          : [],
    });
  }

  return Array.from(desktops.values());
}

type DeviceInteractionCountRow = {
  device_key: string;
  count: number | string;
};

async function getDeviceInteractionCounts(userId: string) {
  const rows = await db.execute<DeviceInteractionCountRow>(sql`
    SELECT device_key, SUM(count)::int AS count
    FROM (
      SELECT CONCAT('collar:', ${collarDevices.id}) AS device_key, COUNT(${petBehaviors.id})::int AS count
      FROM ${collarDevices}
      LEFT JOIN ${petBehaviors} ON ${petBehaviors.collarDeviceId} = ${collarDevices.id}
      WHERE ${collarDevices.userId} = ${userId}
      GROUP BY ${collarDevices.id}

      UNION ALL

      SELECT CONCAT('desktop:', ${desktopDevices.id}) AS device_key, COUNT(${interactionEvents.id})::int AS count
      FROM ${desktopDevices}
      LEFT JOIN ${interactionEvents} ON ${interactionEvents.deviceId} = ${desktopDevices.id}
      WHERE ${desktopDevices.userId} = ${userId}
      GROUP BY ${desktopDevices.id}
    ) device_counts
    GROUP BY device_key
  `);

  return new Map(rows.map((row) => [row.device_key, Number(row.count) || 0]));
}

async function findDeviceOwnershipProbe(body: DeviceOwnershipProbe) {
  const chipId = body.chipId?.trim() || "";
  const normalizedMac = normalizeMac(body.macAddress ?? "");
  const canCheckCollar = !body.deviceType || body.deviceType === "collar";
  const canCheckDesktop = !body.deviceType || body.deviceType === "desktop";

  if (canCheckCollar) {
    const collar =
      (chipId ? await findCollarByChipId(chipId) : null) ??
      (normalizedMac ? await findCollarByMac(normalizedMac) : null);
    if (collar) return { deviceType: "collar" as const, device: collar };
  }

  if (canCheckDesktop) {
    const desktop =
      (chipId ? await findDesktopByChipId(chipId) : null) ??
      (normalizedMac ? await findDesktopByMac(normalizedMac) : null);
    if (desktop) return { deviceType: "desktop" as const, device: desktop };
  }

  return null;
}

async function releaseCollarOwnership(userId: string, id: string) {
  const [existing] = await db
    .select()
    .from(collarDevices)
    .where(and(eq(collarDevices.id, id), eq(collarDevices.userId, userId)));
  if (!existing) return null;

  const [collar] = await db
    .update(collarDevices)
    .set({
      userId: null,
      petId: null,
      claimStatus: "available",
      upgradeStatus: "idle",
      status: "offline",
      updatedAt: new Date(),
    })
    .where(eq(collarDevices.id, id))
    .returning();

  return collar ?? null;
}

async function releaseDesktopOwnership(userId: string, id: string) {
  const [existing] = await db
    .select()
    .from(desktopDevices)
    .where(and(eq(desktopDevices.id, id), eq(desktopDevices.userId, userId)));
  if (!existing) return null;

  await db
    .update(desktopPetBindings)
    .set({ unboundAt: new Date() })
    .where(
      and(
        eq(desktopPetBindings.desktopDeviceId, id),
        isNull(desktopPetBindings.unboundAt),
      ),
    );

  const [desktop] = await db
    .update(desktopDevices)
    .set({
      userId: null,
      claimStatus: "available",
      upgradeStatus: "idle",
      status: "offline",
      updatedAt: new Date(),
    })
    .where(eq(desktopDevices.id, id))
    .returning();

  if (desktop) {
    await publishDesktopBindingConfig(desktop, null);
  }

  return desktop ?? null;
}

// ===== 无主设备（供蓝牙发现后的认领流程匹配） =====

devicesRoute.get("/collars/unowned", async (c) => {
  const result = await db
    .select()
    .from(collarDevices)
    .where(isNull(collarDevices.userId));
  return c.json({ collars: result });
});

devicesRoute.get("/desktops/unowned", async (c) => {
  const result = await db
    .select()
    .from(desktopDevices)
    .where(isNull(desktopDevices.userId));
  return c.json({ desktops: result });
});

devicesRoute.post("/ownership/check", async (c) => {
  const userId = c.get("userId" as never) as string;
  const body = ((await c.req.json<DeviceOwnershipProbe>().catch(() => null)) ?? {}) as DeviceOwnershipProbe;
  const matched = await findDeviceOwnershipProbe(body);

  if (!matched) {
    return c.json({
      canBind: true,
      claimStatus: "unknown",
      message: null,
    });
  }

  const deviceUserId = matched.device.userId;
  if (deviceUserId && deviceUserId !== userId) {
    return c.json({
      canBind: false,
      claimStatus: "occupied",
      deviceType: matched.deviceType,
      message: "该设备已被其他账号绑定，无法再次绑定",
    });
  }

  return c.json({
    canBind: true,
    claimStatus: deviceUserId === userId ? "owned" : "available",
    deviceType: matched.deviceType,
    message: null,
  });
});

devicesRoute.post("/collars/register", async (c) => {
  const userId = c.get("userId" as never) as string;
  const body =
    (await c.req
      .json<{ macAddress?: string; chipId?: string; name?: string }>()
      .catch(() => null)) ?? {};
  const identity = normalizeDeviceRegisterBody(body);

  if ("error" in identity) {
    return c.json({ error: identity.error }, 400);
  }

  let existing = identity.chipId ? await findCollarByChipId(identity.chipId) : null;
  if (!existing && NORMALIZED_MAC_REGEX.test(identity.macAddress)) {
    existing = await findCollarByMac(identity.macAddress);
  }

  if (!existing) {
    const [collar] = await db
      .insert(collarDevices)
      .values({
        userId,
        name: body.name ?? "我的项圈",
        chipId: identity.chipId,
        macAddress: identity.macAddress,
        ...buildOnlineDeviceState(),
      })
      .onConflictDoNothing()
      .returning();

    if (collar) {
      return c.json({ collar }, 201);
    }

    existing = identity.chipId ? await findCollarByChipId(identity.chipId) : null;
    if (!existing && NORMALIZED_MAC_REGEX.test(identity.macAddress)) {
      existing = await findCollarByMac(identity.macAddress);
    }
    if (!existing) {
      return c.json({ error: "Collar registration failed" }, 500);
    }
  }

  if (existing.userId === null) {
    const [collar] = await db
      .update(collarDevices)
      .set({
        userId,
        name: body.name ?? existing.name,
        chipId: identity.chipId ?? existing.chipId,
        macAddress: NORMALIZED_MAC_REGEX.test(identity.macAddress)
          ? identity.macAddress
          : existing.macAddress,
        claimStatus: "occupied" as const,
        ...buildOnlineDeviceState(),
      })
      .where(and(eq(collarDevices.id, existing.id), isNull(collarDevices.userId)))
      .returning();

    if (!collar) {
      const latest = identity.chipId
        ? await findCollarByChipId(identity.chipId)
        : NORMALIZED_MAC_REGEX.test(identity.macAddress)
          ? await findCollarByMac(identity.macAddress)
          : null;
      if (latest?.userId === userId) {
        return c.json({ collar: latest });
      }

      return c.json({ error: "该项圈已被其他账号绑定，无法再次绑定" }, 409);
    }

    return c.json({ collar });
  }

  if (existing.userId === userId) {
    const [collar] = await db
      .update(collarDevices)
      .set({
        chipId: identity.chipId ?? existing.chipId,
        ...buildOnlineDeviceState(),
      })
      .where(eq(collarDevices.id, existing.id))
      .returning();

    return c.json({ collar: collar ?? existing });
  }

  return c.json({ error: "该项圈已被其他账号绑定，无法再次绑定" }, 409);
});

devicesRoute.post("/desktops/register", async (c) => {
  const userId = c.get("userId" as never) as string;
  const body =
    (await c.req
      .json<{ macAddress?: string; chipId?: string; name?: string }>()
      .catch(() => null)) ?? {};
  const identity = normalizeDeviceRegisterBody(body);

  if ("error" in identity) {
    return c.json({ error: identity.error }, 400);
  }

  let existing = identity.chipId ? await findDesktopByChipId(identity.chipId) : null;
  if (!existing && NORMALIZED_MAC_REGEX.test(identity.macAddress)) {
    existing = await findDesktopByMac(identity.macAddress);
  }

  if (!existing) {
    const [desktop] = await db
      .insert(desktopDevices)
      .values({
        userId,
        name: body.name ?? "我的桌面端",
        chipId: identity.chipId,
        macAddress: identity.macAddress,
        ...buildOnlineDeviceState(),
      })
      .onConflictDoNothing()
      .returning();

    if (desktop) {
      return c.json({ desktop }, 201);
    }

    existing = identity.chipId ? await findDesktopByChipId(identity.chipId) : null;
    if (!existing && NORMALIZED_MAC_REGEX.test(identity.macAddress)) {
      existing = await findDesktopByMac(identity.macAddress);
    }
    if (!existing) {
      return c.json({ error: "Desktop registration failed" }, 500);
    }
  }

  if (existing.userId === null) {
    const [desktop] = await db
      .update(desktopDevices)
      .set({
        userId,
        name: body.name ?? existing.name,
        chipId: identity.chipId ?? existing.chipId,
        macAddress: NORMALIZED_MAC_REGEX.test(identity.macAddress)
          ? identity.macAddress
          : existing.macAddress,
        claimStatus: "occupied" as const,
        ...buildOnlineDeviceState(),
      })
      .where(and(eq(desktopDevices.id, existing.id), isNull(desktopDevices.userId)))
      .returning();

    if (!desktop) {
      const latest = identity.chipId
        ? await findDesktopByChipId(identity.chipId)
        : NORMALIZED_MAC_REGEX.test(identity.macAddress)
          ? await findDesktopByMac(identity.macAddress)
          : null;
      if (latest?.userId === userId) {
        return c.json({ desktop: latest });
      }

      return c.json({ error: "该桌面摆台已被其他账号绑定，无法再次绑定" }, 409);
    }

    return c.json({ desktop });
  }

  if (existing.userId === userId) {
    const [desktop] = await db
      .update(desktopDevices)
      .set({
        chipId: identity.chipId ?? existing.chipId,
        ...buildOnlineDeviceState(),
      })
      .where(eq(desktopDevices.id, existing.id))
      .returning();

    return c.json({ desktop: desktop ?? existing });
  }

  return c.json({ error: "该桌面摆台已被其他账号绑定，无法再次绑定" }, 409);
});

// ===== 设备认领（蓝牙配对后的账号绑定） =====

devicesRoute.post("/collars/:id/claim", async (c) => {
  const userId = c.get("userId" as never) as string;
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));

  // 原子操作：只认领 userId 为空的设备，防止并发抢占
  const [collar] = await db
    .update(collarDevices)
    .set({
      userId,
      name: body.name ?? "我的项圈",
      claimStatus: "occupied" as const,
      ...buildOnlineDeviceState(),
    })
    .where(and(eq(collarDevices.id, id), isNull(collarDevices.userId)))
    .returning();

  if (!collar) return c.json({ error: "Device not found or already claimed" }, 404);
  return c.json({ collar });
});

devicesRoute.post("/desktops/:id/claim", async (c) => {
  const userId = c.get("userId" as never) as string;
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));

  const [desktop] = await db
    .update(desktopDevices)
    .set({
      userId,
      name: body.name ?? "我的桌面端",
      claimStatus: "occupied" as const,
      ...buildOnlineDeviceState(),
    })
    .where(and(eq(desktopDevices.id, id), isNull(desktopDevices.userId)))
    .returning();

  if (!desktop) return c.json({ error: "Device not found or already claimed" }, 404);
  return c.json({ desktop });
});

// ===== 项圈设备 =====

devicesRoute.get("/collars", async (c) => {
  const userId = c.get("userId" as never) as string;
  const result = await db
    .select()
    .from(collarDevices)
    .where(eq(collarDevices.userId, userId));
  return c.json({ collars: result });
});

devicesRoute.post("/collars", async (c) => {
  const userId = c.get("userId" as never) as string;
  const body = await c.req.json<{
    name?: string;
    macAddress: string;
    petId?: string | null;
    replace?: boolean;
  }>();

  // 如果指定了 petId，校验宠物归属
  if (body.petId) {
    const [pet] = await db
      .select()
      .from(pets)
      .where(and(eq(pets.id, body.petId), eq(pets.userId, userId)));
    if (!pet) return c.json({ error: "Pet not found" }, 404);
  }

  const [collar] = await db
    .insert(collarDevices)
    .values({
      userId,
      name: body.name ?? "我的项圈",
      macAddress: body.macAddress,
      petId: body.petId ?? null,
      ...buildOnlineDeviceState(),
    })
    .returning();
  return c.json({ collar }, 201);
});

devicesRoute.put("/collars/:id", async (c) => {
  const userId = c.get("userId" as never) as string;
  const id = c.req.param("id");
  const body = await c.req.json();

  const [existing] = await db
    .select()
    .from(collarDevices)
    .where(and(eq(collarDevices.id, id), eq(collarDevices.userId, userId)));
  if (!existing) return c.json({ error: "Collar not found" }, 404);

  // 如果更新 petId，校验宠物归属
  if (body.petId !== undefined && body.petId !== null) {
    const [pet] = await db
      .select()
      .from(pets)
      .where(and(eq(pets.id, body.petId), eq(pets.userId, userId)));
    if (!pet) return c.json({ error: "Pet not found" }, 404);

    if (existing.petId && existing.petId !== body.petId && !body.replace) {
      return c.json(
        {
          error: "Collar already bound to another pet",
          currentPetId: existing.petId,
          requiresReplace: true,
        },
        409,
      );
    }
  }

  const [collar] = await db
    .update(collarDevices)
    .set({
      name: body.name ?? existing.name,
      petId: body.petId !== undefined ? body.petId : existing.petId,
      ...buildOnlineDeviceState(),
    })
    .where(eq(collarDevices.id, id))
    .returning();
  return c.json({ collar });
});

devicesRoute.delete("/collars/:id", async (c) => {
  const userId = c.get("userId" as never) as string;
  const id = c.req.param("id");
  const collar = await releaseCollarOwnership(userId, id);
  if (!collar) return c.json({ error: "Collar not found" }, 404);
  return c.json({ success: true });
});

// ===== 桌面端设备 =====

devicesRoute.get("/desktops", async (c) => {
  const userId = c.get("userId" as never) as string;
  const desktops = await getOwnedDesktops(userId);
  return c.json({ desktops });
});

devicesRoute.post("/desktops", async (c) => {
  const userId = c.get("userId" as never) as string;
  const body = await c.req.json();
  const [desktop] = await db
    .insert(desktopDevices)
    .values({
      userId,
      name: body.name ?? "我的桌面端",
      macAddress: body.macAddress,
      ...buildOnlineDeviceState(),
    })
    .returning();
  return c.json({ desktop }, 201);
});

devicesRoute.delete("/desktops/:id", async (c) => {
  const userId = c.get("userId" as never) as string;
  const id = c.req.param("id");
  const desktop = await releaseDesktopOwnership(userId, id);
  if (!desktop) return c.json({ error: "Desktop not found" }, 404);
  return c.json({ success: true });
});

devicesRoute.get("/", async (c) => {
  const userId = c.get("userId" as never) as string;
  const [collars, desktops, interactionCounts] = await Promise.all([
    db.select().from(collarDevices).where(eq(collarDevices.userId, userId)),
    getOwnedDesktops(userId),
    getDeviceInteractionCounts(userId),
  ]);

  const devices = [
    ...collars.map((collar) => ({
      deviceId: collar.id,
      deviceType: "collar" as const,
      name: collar.name,
      status: getEffectiveDeviceStatus({
        type: "collar",
        status: collar.status,
        lastOnlineAt: collar.lastOnlineAt,
      }),
      firmwareVersion: collar.firmwareVersion,
      claimStatus: collar.claimStatus,
      usageDurationMinutes: collar.usageDurationMinutes,
      interactionCount: interactionCounts.get(`collar:${collar.id}`) ?? 0,
      upgradeStatus: collar.upgradeStatus,
      lastOnlineAt: collar.lastOnlineAt,
      ...getInactiveMeta(collar.lastOnlineAt),
      petId: collar.petId,
      bindings: [],
    })),
    ...desktops.map((desktop) => ({
      deviceId: desktop.id,
      deviceType: "desktop" as const,
      name: desktop.name,
      status: getEffectiveDeviceStatus({
        type: "desktop",
        status: desktop.status,
        lastOnlineAt: desktop.lastOnlineAt,
      }),
      firmwareVersion: desktop.firmwareVersion,
      claimStatus: desktop.claimStatus,
      usageDurationMinutes: desktop.usageDurationMinutes,
      interactionCount: interactionCounts.get(`desktop:${desktop.id}`) ?? 0,
      upgradeStatus: desktop.upgradeStatus,
      lastOnlineAt: desktop.lastOnlineAt,
      ...getInactiveMeta(desktop.lastOnlineAt),
      petId: desktop.bindings[0]?.petId ?? null,
      bindings: desktop.bindings,
    })),
  ];

  return c.json({ devices });
});

devicesRoute.get("/firmware/status", async (c) => {
  const userId = c.get("userId" as never) as string;
  const [collars, desktops, releases] = await Promise.all([
    db.select().from(collarDevices).where(eq(collarDevices.userId, userId)),
    db.select().from(desktopDevices).where(eq(desktopDevices.userId, userId)),
    db.select().from(firmwareReleases).orderBy(desc(firmwareReleases.releasedAt)),
  ]);

  const latestReleaseByType = new Map<string, typeof firmwareReleases.$inferSelect>();
  for (const release of releases) {
    if (latestReleaseByType.has(release.deviceType)) continue;
    latestReleaseByType.set(release.deviceType, release);
  }

  const devices = [
    ...collars.map((collar) => {
      const latestRelease = latestReleaseByType.get("collar");
      return {
        deviceId: collar.id,
        deviceType: "collar" as const,
        currentVersion: collar.firmwareVersion,
        latestVersion: latestRelease?.version ?? collar.firmwareVersion ?? null,
        hasUpdate: Boolean(
          latestRelease?.version &&
            latestRelease.version !== (collar.firmwareVersion ?? null),
        ),
        releaseNotes: latestRelease?.releaseNotes ?? null,
        upgradeStatus: collar.upgradeStatus,
      };
    }),
    ...desktops.map((desktop) => {
      const latestRelease = latestReleaseByType.get("desktop");
      return {
        deviceId: desktop.id,
        deviceType: "desktop" as const,
        currentVersion: desktop.firmwareVersion,
        latestVersion: latestRelease?.version ?? desktop.firmwareVersion ?? null,
        hasUpdate: Boolean(
          latestRelease?.version &&
            latestRelease.version !== (desktop.firmwareVersion ?? null),
        ),
        releaseNotes: latestRelease?.releaseNotes ?? null,
        upgradeStatus: desktop.upgradeStatus,
      };
    }),
  ];

  return c.json({ devices });
});

devicesRoute.post("/:deviceType/:deviceId/firmware/upgrade", async (c) => {
  const userId = c.get("userId" as never) as string;
  const parsedDeviceType = deviceTypeSchema.safeParse(c.req.param("deviceType"));
  if (!parsedDeviceType.success) {
    return c.json({ error: "Invalid deviceType" }, 400);
  }

  const deviceId = c.req.param("deviceId");
  const deviceType = parsedDeviceType.data;

  if (deviceType === "collar") {
    const [device] = await db
      .select()
      .from(collarDevices)
      .where(and(eq(collarDevices.id, deviceId), eq(collarDevices.userId, userId)));
    if (!device) return c.json({ error: "Device not found" }, 404);

    await db
      .update(collarDevices)
      .set({
        upgradeStatus: "pending",
        updatedAt: new Date(),
      })
      .where(eq(collarDevices.id, deviceId));
  } else {
    const [device] = await db
      .select()
      .from(desktopDevices)
      .where(and(eq(desktopDevices.id, deviceId), eq(desktopDevices.userId, userId)));
    if (!device) return c.json({ error: "Device not found" }, 404);

    await db
      .update(desktopDevices)
      .set({
        upgradeStatus: "pending",
        updatedAt: new Date(),
      })
      .where(eq(desktopDevices.id, deviceId));
  }

  return c.json({ accepted: true, upgradeStatus: "pending" as const });
});

devicesRoute.delete("/:type/:id", async (c) => {
  const userId = c.get("userId" as never) as string;
  const parsedType = deviceTypeSchema.safeParse(c.req.param("type"));
  if (!parsedType.success) {
    return c.json({ error: "Invalid device type" }, 400);
  }

  const id = c.req.param("id");
  const type = parsedType.data;
  const device =
    type === "collar"
      ? await releaseCollarOwnership(userId, id)
      : await releaseDesktopOwnership(userId, id);

  if (!device) {
    return c.json({ error: type === "collar" ? "Collar not found" : "Desktop not found" }, 404);
  }

  return c.json({ success: true });
});

// ===== 桌面端-宠物绑定 =====

devicesRoute.post("/desktops/:id/bind", async (c) => {
  const userId = c.get("userId" as never) as string;
  const desktopId = c.req.param("id");
  const body = await c.req.json<{
    petId: string;
    bindingType: "owner" | "authorized";
    replace?: boolean;
  }>();

  const [desktop] = await db
    .select()
    .from(desktopDevices)
    .where(and(eq(desktopDevices.id, desktopId), eq(desktopDevices.userId, userId)));
  if (!desktop) return c.json({ error: "Desktop not found" }, 404);

  // 校验 petId 归属当前用户
  const [pet] = await db
    .select()
    .from(pets)
    .where(and(eq(pets.id, body.petId), eq(pets.userId, userId)));
  if (!pet) return c.json({ error: "Pet not found" }, 404);

  const result = await db.transaction(async (tx) => {
    await tx
      .update(desktopDevices)
      .set(buildOnlineDeviceState())
      .where(eq(desktopDevices.id, desktopId));

    const activeBindings = await tx
      .select()
      .from(desktopPetBindings)
      .where(
        and(
          eq(desktopPetBindings.desktopDeviceId, desktopId),
          isNull(desktopPetBindings.unboundAt),
        ),
      );
    const activeBinding = activeBindings.find((binding) => binding.petId === body.petId);

    if (activeBinding) {
      return { binding: activeBinding, created: false };
    }

    if (activeBindings.length > 0 && !body.replace) {
      return {
        error: "Desktop already bound to another pet",
        currentPetId: activeBindings[0].petId,
        requiresReplace: true,
      } as const;
    }

    await tx
      .update(desktopPetBindings)
      .set({ unboundAt: new Date() })
      .where(
        and(
          eq(desktopPetBindings.desktopDeviceId, desktopId),
          isNull(desktopPetBindings.unboundAt),
        ),
      );

    const [binding] = await tx
      .insert(desktopPetBindings)
      .values({
        desktopDeviceId: desktopId,
        petId: body.petId,
        bindingType: body.bindingType,
      })
      .returning();

    return { binding, created: true };
  });

  if ("error" in result) {
    return c.json(result, 409);
  }

  await publishDesktopBindingConfig(desktop, result.binding);

  return c.json({ binding: result.binding }, result.created ? 201 : 200);
});

devicesRoute.delete("/desktops/:id/bind/:bindingId", async (c) => {
  const userId = c.get("userId" as never) as string;
  const desktopId = c.req.param("id");
  const bindingId = c.req.param("bindingId");

  // 校验桌面端归属当前用户
  const [desktop] = await db
    .select()
    .from(desktopDevices)
    .where(and(eq(desktopDevices.id, desktopId), eq(desktopDevices.userId, userId)));
  if (!desktop) return c.json({ error: "Desktop not found" }, 404);

  // 软删除：设置 unbound_at
  const [binding] = await db
    .update(desktopPetBindings)
    .set({ unboundAt: new Date() })
    .where(
      and(
        eq(desktopPetBindings.id, bindingId),
        eq(desktopPetBindings.desktopDeviceId, desktopId),
        isNull(desktopPetBindings.unboundAt),
      )
    )
    .returning();
  if (!binding) return c.json({ error: "Binding not found" }, 404);

  const [remainingBinding] = await db
    .select()
    .from(desktopPetBindings)
    .where(
      and(
        eq(desktopPetBindings.desktopDeviceId, desktopId),
        isNull(desktopPetBindings.unboundAt),
      )
    );
  await publishDesktopBindingConfig(desktop, remainingBinding ?? null);

  return c.json({ success: true });
});

// ===== 邀请授权 =====

devicesRoute.post("/invite", async (c) => {
  const userId = c.get("userId" as never) as string;
  const body = await c.req.json<{ petId?: string }>();
  if (!body.petId) return c.json({ error: "petId is required" }, 400);

  const [pet] = await db
    .select()
    .from(pets)
    .where(and(eq(pets.id, body.petId), eq(pets.userId, userId)));
  if (!pet) return c.json({ error: "Pet not found" }, 404);

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, userId));

  const inviteCode = generateInviteCode({
    fromUserId: userId,
    petId: pet.id,
    createdAt: Date.now(),
  });

  const codeHash = getInviteCodeHash(inviteCode);
  await db
    .insert(inviteCodes)
    .values({
      codeHash,
      fromUserId: userId,
      petId: pet.id,
    })
    .onConflictDoNothing({ target: inviteCodes.codeHash });

  return c.json({
    inviteCode,
    petId: pet.id,
    petName: pet.name,
    fromNickname: user?.nickname ?? "未知用户",
  });
});

devicesRoute.post("/invite/:code/accept", async (c) => {
  const userId = c.get("userId" as never) as string;
  const code = c.req.param("code");
  const payload = verifyInviteCode(code);
  if (!payload) return c.json({ error: "Invalid invite code" }, 400);

  if (payload.fromUserId === userId) {
    return c.json({ error: "Cannot accept your own invite" }, 400);
  }

  const [pet] = await db
    .select()
    .from(pets)
    .where(
      and(eq(pets.id, payload.petId), eq(pets.userId, payload.fromUserId))
    )
    .limit(1);
  if (!pet) return c.json({ error: "Pet not found" }, 404);

  const codeHash = getInviteCodeHash(code);
  const [inviteCodeRecord] = await db
    .select()
    .from(inviteCodes)
    .where(eq(inviteCodes.codeHash, codeHash))
    .limit(1);

  if (
    inviteCodeRecord &&
    (inviteCodeRecord.fromUserId !== payload.fromUserId ||
      inviteCodeRecord.petId !== payload.petId)
  ) {
    return c.json({ error: "Invalid invite code" }, 400);
  }

  if (inviteCodeRecord?.acceptedBy) {
    return c.json({ error: "邀请已失效" }, 409);
  }

  const [existingAuthorization] = await db
    .select()
    .from(deviceAuthorizations)
    .where(
      and(
        eq(deviceAuthorizations.fromUserId, payload.fromUserId),
        eq(deviceAuthorizations.toUserId, userId),
        eq(deviceAuthorizations.petId, payload.petId),
        eq(deviceAuthorizations.status, "accepted")
      )
    )
    .limit(1);
  if (existingAuthorization) {
    return c.json({ error: "Already accepted this invite" }, 409);
  }

  let authorization: typeof deviceAuthorizations.$inferSelect | undefined;
  let bindings: typeof desktopPetBindings.$inferSelect[] = [];

  try {
    await db.transaction(async (tx) => {
      if (inviteCodeRecord) {
        const [claimedInviteCode] = await tx
          .update(inviteCodes)
          .set({
            acceptedBy: userId,
            acceptedAt: new Date(),
          })
          .where(
            and(
              eq(inviteCodes.codeHash, codeHash),
              isNull(inviteCodes.acceptedBy),
            ),
          )
          .returning({ id: inviteCodes.id });

        if (!claimedInviteCode) {
          throw new Error("INVITE_CODE_EXPIRED");
        }
      }

      [authorization] = await tx
        .insert(deviceAuthorizations)
        .values({
          fromUserId: payload.fromUserId,
          toUserId: userId,
          petId: payload.petId,
          status: "accepted",
        })
        .returning();

      const userDesktops = await tx
        .select()
        .from(desktopDevices)
        .where(eq(desktopDevices.userId, userId));

      bindings =
        userDesktops.length > 0
          ? await tx
              .insert(desktopPetBindings)
              .values(
                userDesktops.map((desktop) => ({
                  desktopDeviceId: desktop.id,
                  petId: payload.petId,
                  bindingType: "authorized" as const,
                })),
              )
              .returning()
          : [];
    });
  } catch (error) {
    if (error instanceof Error && error.message === "INVITE_CODE_EXPIRED") {
      return c.json({ error: "邀请已失效" }, 409);
    }
    throw error;
  }

  return c.json({ authorization, bindings }, 201);
});

export default devicesRoute;
