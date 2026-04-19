import { Hono } from "hono";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { ALL_ACTIONS } from "shared";
import { db } from "../../db";
import { messages, petAvatars, petAvatarActions, pets, users } from "../../db/schema";
import { broadcast } from "../../ws";

const avatarsRoute = new Hono();

const VALID_AVATAR_STATUSES = new Set([
  "pending",
  "processing",
  "done",
  "failed",
  "approved",
  "rejected",
]);
const EDITABLE_ACTION_STATUSES = new Set(["approved", "processing"]);
const VALID_ACTIONS = new Set<string>(ALL_ACTIONS);
const ADMIN_TIME_ZONE = "Asia/Shanghai";
type AvatarStatus = (typeof petAvatars.$inferSelect)["status"];

type AvatarRow = {
  avatar: typeof petAvatars.$inferSelect;
  petId: string | null;
  petName: string | null;
  petSpecies: string | null;
  petBreed: string | null;
  petGender: string | null;
  petBirthday: string | null;
  userId: string | null;
  userNickname: string | null;
  userAvatarUrl: string | null;
  userWechatOpenid: string | null;
  userPhone: string | null;
};

function isSafeImageUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function toAvatarResponse(row: AvatarRow) {
  return {
    ...row.avatar,
    pet: row.petId
        ? {
          id: row.petId,
          name: row.petName,
          species: row.petSpecies,
          breed: row.petBreed,
          gender: row.petGender,
          birthday: row.petBirthday,
        }
      : null,
    user: row.userId
      ? {
          id: row.userId,
          nickname: row.userNickname,
          avatarUrl: row.userAvatarUrl,
          wechatOpenid: row.userWechatOpenid,
          phone: row.userPhone,
        }
      : null,
  };
}

async function getAvatarRow(avatarId: string) {
  const [row] = await db
    .select({
      avatar: petAvatars,
      petId: pets.id,
      petName: pets.name,
      petSpecies: pets.species,
      petBreed: pets.breed,
      petGender: pets.gender,
      petBirthday: pets.birthday,
      userId: users.id,
      userNickname: users.nickname,
      userAvatarUrl: users.avatarUrl,
      userWechatOpenid: users.wechatOpenid,
      userPhone: users.phone,
    })
    .from(petAvatars)
    .leftJoin(pets, eq(petAvatars.petId, pets.id))
    .leftJoin(users, eq(pets.userId, users.id))
    .where(eq(petAvatars.id, avatarId));

  return row ?? null;
}

async function getAvatarActions(avatarId: string) {
  return db
    .select()
    .from(petAvatarActions)
    .where(eq(petAvatarActions.petAvatarId, avatarId))
    .orderBy(asc(petAvatarActions.sortOrder), asc(petAvatarActions.actionType), asc(petAvatarActions.id));
}

function getAvatarOwnerContext(row: AvatarRow) {
  if (!row.petId || !row.petName || !row.userId) {
    return null;
  }

  return {
    petId: row.petId,
    petName: row.petName,
    userId: row.userId,
  };
}

avatarsRoute.get("/avatars", async (c) => {
  const status = c.req.query("status");

  if (status && !VALID_AVATAR_STATUSES.has(status)) {
    return c.json({ error: "Invalid status" }, 400);
  }

  const query = db
    .select({
      avatar: petAvatars,
      petId: pets.id,
      petName: pets.name,
      petSpecies: pets.species,
      petBreed: pets.breed,
      petGender: pets.gender,
      petBirthday: pets.birthday,
      userId: users.id,
      userNickname: users.nickname,
      userAvatarUrl: users.avatarUrl,
      userWechatOpenid: users.wechatOpenid,
      userPhone: users.phone,
    })
    .from(petAvatars)
    .leftJoin(pets, eq(petAvatars.petId, pets.id))
    .leftJoin(users, eq(pets.userId, users.id));

  const rows = status
    ? await query.where(eq(petAvatars.status, status as AvatarStatus)).orderBy(desc(petAvatars.createdAt))
    : await query.orderBy(desc(petAvatars.createdAt));

  return c.json({
    avatars: rows.map((row) => toAvatarResponse(row as AvatarRow)),
  });
});

avatarsRoute.get("/avatars/:id", async (c) => {
  const avatarId = c.req.param("id");
  const row = await getAvatarRow(avatarId);

  if (!row) {
    return c.json({ error: "Avatar not found" }, 404);
  }

  const actions = await getAvatarActions(avatarId);

  return c.json({
    avatar: {
      ...toAvatarResponse(row),
      actions,
    },
  });
});

avatarsRoute.put("/avatars/:id/approve", async (c) => {
  const avatarId = c.req.param("id");
  const row = await getAvatarRow(avatarId);

  if (!row) {
    return c.json({ error: "Avatar not found" }, 404);
  }

  if (row.avatar.status === "approved" || row.avatar.status === "processing" || row.avatar.status === "done") {
    return c.json({ avatar: toAvatarResponse(row) });
  }

  if (row.avatar.status !== "pending" && row.avatar.status !== "rejected") {
    return c.json({ error: "Avatar cannot be approved" }, 400);
  }

  const ownerContext = getAvatarOwnerContext(row);
  if (!ownerContext) {
    return c.json({ error: "Avatar relation not found" }, 400);
  }

  const reviewedAt = new Date();

  const [avatar] = await db.transaction(async (tx) => {
    const [updatedAvatar] = await tx
      .update(petAvatars)
      .set({
        status: "approved",
        rejectReason: null,
        reviewedAt,
      })
      .where(eq(petAvatars.id, avatarId))
      .returning();

    await tx.insert(messages).values({
      userId: ownerContext.userId,
      type: "system",
      title: "图像审核通过",
      content: `您的宠物 ${ownerContext.petName} 的图像已通过审核`,
    });

    return [updatedAvatar];
  });

  return c.json({
    avatar: toAvatarResponse({
      ...row,
      avatar: avatar ?? {
        ...row.avatar,
        status: "approved",
        rejectReason: null,
        reviewedAt,
      },
    }),
  });
});

avatarsRoute.put("/avatars/:id/reject", async (c) => {
  const avatarId = c.req.param("id");
  const body = await c.req.json<{ reason?: string }>();
  const reason = body.reason?.trim();

  if (!reason) {
    return c.json({ error: "reason is required" }, 400);
  }

  const row = await getAvatarRow(avatarId);

  if (!row) {
    return c.json({ error: "Avatar not found" }, 404);
  }

  if (row.avatar.status === "approved" || row.avatar.status === "processing" || row.avatar.status === "done") {
    return c.json({ error: "Avatar cannot be rejected" }, 400);
  }

  if (row.avatar.status !== "pending" && row.avatar.status !== "rejected") {
    return c.json({ error: "Avatar cannot be rejected" }, 400);
  }

  const ownerContext = getAvatarOwnerContext(row);
  if (!ownerContext) {
    return c.json({ error: "Avatar relation not found" }, 400);
  }

  const nextReviewedAt = row.avatar.status === "pending" ? new Date() : row.avatar.reviewedAt;

  const [avatar] = await db.transaction(async (tx) => {
    const [updatedAvatar] = await tx
      .update(petAvatars)
      .set(
        row.avatar.status === "pending"
          ? {
              status: "rejected",
              rejectReason: reason,
              reviewedAt: nextReviewedAt,
            }
          : {
              rejectReason: reason,
            },
      )
      .where(eq(petAvatars.id, avatarId))
      .returning();

    await tx.insert(messages).values({
      userId: ownerContext.userId,
      type: "system",
      title: "图像审核未通过",
      content: `您的宠物 ${ownerContext.petName} 的图像审核未通过：${reason}`,
    });

    return [updatedAvatar];
  });

  return c.json({
    avatar: toAvatarResponse({
      ...row,
      avatar:
        avatar ??
        (row.avatar.status === "pending"
          ? {
              ...row.avatar,
              status: "rejected",
              rejectReason: reason,
              reviewedAt: nextReviewedAt,
            }
          : {
              ...row.avatar,
              rejectReason: reason,
            }),
    }),
  });
});

avatarsRoute.get("/avatars/:id/actions", async (c) => {
  const avatarId = c.req.param("id");
  const row = await getAvatarRow(avatarId);

  if (!row) {
    return c.json({ error: "Avatar not found" }, 404);
  }

  const actions = await getAvatarActions(avatarId);

  return c.json({ actions });
});

avatarsRoute.post("/avatars/:id/actions", async (c) => {
  const avatarId = c.req.param("id");
  const body = await c.req.json<{ actionType?: string; imageUrl?: string }>();
  const actionType = body.actionType;
  const imageUrl = body.imageUrl;

  if (typeof actionType !== "string" || !VALID_ACTIONS.has(actionType)) {
    return c.json({ error: "Invalid actionType" }, 400);
  }

  if (typeof imageUrl !== "string" || !isSafeImageUrl(imageUrl)) {
    return c.json({ error: "Invalid imageUrl" }, 400);
  }

  const row = await getAvatarRow(avatarId);

  if (!row) {
    return c.json({ error: "Avatar not found" }, 404);
  }

  if (!EDITABLE_ACTION_STATUSES.has(row.avatar.status)) {
    return c.json({ error: "Avatar must be approved or processing" }, 400);
  }

  const [action, avatar] = await db.transaction(async (tx) => {
    const [existingAction] = await tx
      .select()
      .from(petAvatarActions)
      .where(
        and(
          eq(petAvatarActions.petAvatarId, avatarId),
          eq(petAvatarActions.actionType, actionType),
        ),
      )
      .limit(1);

    const [lastAction] = await tx
      .select()
      .from(petAvatarActions)
      .where(eq(petAvatarActions.petAvatarId, avatarId))
      .orderBy(desc(petAvatarActions.sortOrder), desc(petAvatarActions.id))
      .limit(1);

    const [createdOrUpdatedAction] = existingAction
      ? await tx
          .update(petAvatarActions)
          .set({
            imageUrl,
          })
          .where(eq(petAvatarActions.id, existingAction.id))
          .returning()
      : await tx
          .insert(petAvatarActions)
          .values({
            petAvatarId: avatarId,
            actionType,
            imageUrl,
            sortOrder: (lastAction?.sortOrder ?? -1) + 1,
          })
          .returning();

    if (row.avatar.status === "approved") {
      const [updatedAvatar] = await tx
        .update(petAvatars)
        .set({ status: "processing" })
        .where(eq(petAvatars.id, avatarId))
        .returning();

      return [createdOrUpdatedAction, updatedAvatar];
    }

    return [createdOrUpdatedAction, row.avatar];
  });

  return c.json({
    action,
    avatarStatus: avatar?.status ?? (row.avatar.status === "approved" ? "processing" : row.avatar.status),
  });
});

avatarsRoute.delete("/avatars/:id/actions/:actionId", async (c) => {
  const avatarId = c.req.param("id");
  const actionId = c.req.param("actionId");
  const row = await getAvatarRow(avatarId);

  if (!row) {
    return c.json({ error: "Avatar not found" }, 404);
  }

  if (!EDITABLE_ACTION_STATUSES.has(row.avatar.status)) {
    return c.json({ error: "Avatar actions can only be deleted while approved or processing" }, 400);
  }

  const [action] = await db
    .select()
    .from(petAvatarActions)
    .where(and(eq(petAvatarActions.id, actionId), eq(petAvatarActions.petAvatarId, avatarId)));

  if (!action) {
    return c.json({ error: "Action not found" }, 404);
  }

  await db.transaction(async (tx) => {
    await tx
      .delete(petAvatarActions)
      .where(and(eq(petAvatarActions.id, actionId), eq(petAvatarActions.petAvatarId, avatarId)));

    const [remainingAction] = await tx
      .select({ id: petAvatarActions.id })
      .from(petAvatarActions)
      .where(eq(petAvatarActions.petAvatarId, avatarId))
      .limit(1);

    if (!remainingAction && row.avatar.status === "processing") {
      await tx
        .update(petAvatars)
        .set({ status: "approved" })
        .where(eq(petAvatars.id, avatarId));
    }
  });

  return c.json({ success: true });
});

avatarsRoute.post("/avatars/:id/sync", async (c) => {
  const avatarId = c.req.param("id");
  const row = await getAvatarRow(avatarId);

  if (!row) {
    return c.json({ error: "Avatar not found" }, 404);
  }

  if (row.avatar.status === "done") {
    return c.json({ avatar: toAvatarResponse(row) });
  }

  const ownerContext = getAvatarOwnerContext(row);
  if (!ownerContext) {
    return c.json({ error: "Avatar relation not found" }, 400);
  }

  const actions = await getAvatarActions(avatarId);
  if (actions.length === 0) {
    return c.json({ error: "Avatar must have at least one action" }, 400);
  }

  if (row.avatar.status !== "processing" && row.avatar.status !== "approved") {
    return c.json({ error: "Avatar must be processing or approved" }, 400);
  }

  const [avatar] = await db.transaction(async (tx) => {
    const [updatedAvatar] = await tx
      .update(petAvatars)
      .set({ status: "done" })
      .where(eq(petAvatars.id, avatarId))
      .returning();

    await tx.insert(messages).values({
      userId: ownerContext.userId,
      type: "system",
      title: "形象已就绪",
      content: `${ownerContext.petName} 的新形象已生成，快去主页看看吧。`,
    });

    return [updatedAvatar];
  });

  broadcast(ownerContext.userId, {
    type: "avatar:done",
    data: {
      petId: ownerContext.petId,
      avatarId,
      petName: ownerContext.petName,
    },
  });

  return c.json({
    avatar: toAvatarResponse({
      ...row,
      avatar: avatar ?? {
        ...row.avatar,
        status: "done",
      },
    }),
  });
});

avatarsRoute.get("/avatar-review/stats", async (c) => {
  const [row] = await db.execute<{
    pending_review: number | string;
    approved_total: number | string;
    synced_to_devices: number | string;
    today_new_uploads: number | string;
    today_completed: number | string;
  }>(sql`
    SELECT
      COUNT(*) FILTER (WHERE pa.status = 'pending')::int AS pending_review,
      COUNT(*) FILTER (
        WHERE pa.status IN ('approved', 'processing', 'done')
      )::int AS approved_total,
      COUNT(*) FILTER (
        WHERE pa.status = 'approved'
          AND (
            EXISTS (
              SELECT 1
              FROM collar_devices cd
              WHERE cd.pet_id = pa.pet_id
                AND cd.status = 'online'
            )
            OR EXISTS (
              SELECT 1
              FROM desktop_pet_bindings b
              WHERE b.pet_id = pa.pet_id
                AND b.unbound_at IS NULL
            )
          )
      )::int AS synced_to_devices,
      COUNT(*) FILTER (
        WHERE (pa.created_at AT TIME ZONE ${ADMIN_TIME_ZONE})::date = (now() AT TIME ZONE ${ADMIN_TIME_ZONE})::date
      )::int AS today_new_uploads,
      COUNT(*) FILTER (
        WHERE pa.status IN ('approved', 'rejected')
          AND (pa.reviewed_at AT TIME ZONE ${ADMIN_TIME_ZONE})::date = (now() AT TIME ZONE ${ADMIN_TIME_ZONE})::date
      )::int AS today_completed
    FROM pet_avatars pa
  `);

  return c.json({
    pendingReview: Number(row?.pending_review ?? 0),
    approvedTotal: Number(row?.approved_total ?? 0),
    syncedToDevices: Number(row?.synced_to_devices ?? 0),
    todayNewUploads: Number(row?.today_new_uploads ?? 0),
    todayCompleted: Number(row?.today_completed ?? 0),
  });
});

export default avatarsRoute;
