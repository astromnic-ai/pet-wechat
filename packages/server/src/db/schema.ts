import {
  check,
  foreignKey,
  pgTable,
  text,
  varchar,
  timestamp,
  integer,
  real,
  boolean,
  pgEnum,
  index,
  jsonb,
  unique,
  uniqueIndex,
  bigint,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createId } from "../utils/id";

// ===== 枚举 =====

export const speciesEnum = pgEnum("species", ["cat", "dog"]);
export const genderEnum = pgEnum("gender", ["male", "female", "unknown"]);
export const deviceStatusEnum = pgEnum("device_status", [
  "online",
  "offline",
  "pairing",
]);
export const avatarStatusEnum = pgEnum("avatar_status", [
  "pending",
  "processing",
  "done",
  "failed",
  "approved",
  "rejected",
]);
export const scheduleEffectiveTypeEnum = pgEnum("schedule_effective_type", [
  "everyday",
  "weekday",
  "friday",
]);
export const messageTypeEnum = pgEnum("message_type", [
  "authorization",
  "system",
]);
export const bindingTypeEnum = pgEnum("binding_type", [
  "owner",
  "authorized",
]);
export const authorizationStatusEnum = pgEnum("authorization_status", [
  "pending",
  "accepted",
  "rejected",
]);
export const deviceTypeEnum = pgEnum("device_type", ["collar", "desktop"]);
export const deviceClaimStatusEnum = pgEnum("device_claim_status", [
  "occupied",
  "available",
  "unclaimed",
  "reset_required",
]);
export const deviceUpgradeStatusEnum = pgEnum("device_upgrade_status", [
  "idle",
  "pending",
  "success",
  "failed",
]);
export const userSettingThemeEnum = pgEnum("user_setting_theme", [
  "system",
  "light",
  "dark",
  "blue",
]);
export const userSettingLanguageEnum = pgEnum("user_setting_language", [
  "zh-CN",
  "zh-TW",
  "en-US",
]);
export const membershipLevelEnum = pgEnum("membership_level", [
  "free",
  "basic",
  "pro",
  "premium",
]);
export const membershipStatusEnum = pgEnum("membership_status", [
  "active",
  "expired",
  "suspended",
]);
export const firmwareStateEnum = pgEnum("firmware_state", [
  "draft",
  "internal",
  "released",
  "quarantine",
]);
export const dispatchSourceEnum = pgEnum("dispatch_source", [
  "manual",
  "auto_full",
]);
export const petActivityModeEnum = pgEnum("pet_activity_mode", [
  "free",
  "custom",
  "real",
]);

// ===== 用户 =====

export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    wechatOpenid: text("wechat_openid").unique(),
    phone: text("phone").unique(),
    email: varchar("email", { length: 255 }),
    nickname: text("nickname").notNull(),
    avatarUrl: text("avatar_url"),
    avatarQuota: integer("avatar_quota").notNull().default(2),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [uniqueIndex("users_email_unique").on(table.email)],
);

export const memberships = pgTable(
  "memberships",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    level: membershipLevelEnum("level").notNull().default("free"),
    status: membershipStatusEnum("status").notNull().default("active"),
    startAt: timestamp("start_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    expireAt: timestamp("expire_at", { withTimezone: true }),
    benefits: jsonb("benefits").notNull().default(sql`'[]'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [uniqueIndex("uq_memberships_user_id").on(table.userId)],
);

// ===== 宠物 =====

export const pets = pgTable("pets", {
  id: text("id").primaryKey().$defaultFn(createId),
  userId: text("user_id").notNull(),
  name: text("name").notNull(),
  species: speciesEnum("species").notNull(),
  breed: text("breed"),
  gender: genderEnum("gender").notNull().default("unknown"),
  birthday: text("birthday"),
  weight: real("weight"),
  draftAvatarSourceImageUrl: text("draft_avatar_source_image_url"),
  activityScore: integer("activity_score").notNull().default(0),
  activityMode: petActivityModeEnum("activity_mode").notNull().default("free"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ===== 项圈设备 =====

export const collarDevices = pgTable(
  "collar_devices",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    userId: text("user_id"),
    petId: text("pet_id"),
    name: text("name").notNull(),
    chipId: text("chip_id").unique(),
    macAddress: text("mac_address").notNull().unique(),
    status: deviceStatusEnum("status").notNull().default("offline"),
    battery: integer("battery"),
    signal: integer("signal"),
    firmwareVersion: text("firmware_version"),
    claimStatus: deviceClaimStatusEnum("claim_status")
      .notNull()
      .default("occupied"),
    usageDurationMinutes: integer("usage_duration_minutes")
      .notNull()
      .default(0),
    upgradeStatus: deviceUpgradeStatusEnum("upgrade_status")
      .notNull()
      .default("idle"),
    lastOnlineAt: timestamp("last_online_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("idx_collar_devices_pet_id").on(table.petId)],
);

// ===== 桌面端设备 =====

export const desktopDevices = pgTable("desktop_devices", {
  id: text("id").primaryKey().$defaultFn(createId),
  userId: text("user_id"),
  name: text("name").notNull(),
  chipId: text("chip_id").unique(),
  macAddress: text("mac_address").notNull().unique(),
  status: deviceStatusEnum("status").notNull().default("offline"),
  firmwareVersion: text("firmware_version"),
  claimStatus: deviceClaimStatusEnum("claim_status")
    .notNull()
    .default("occupied"),
  usageDurationMinutes: integer("usage_duration_minutes")
    .notNull()
    .default(0),
  upgradeStatus: deviceUpgradeStatusEnum("upgrade_status")
    .notNull()
    .default("idle"),
  lastOnlineAt: timestamp("last_online_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ===== 桌面端-宠物绑定 =====

export const desktopPetBindings = pgTable(
  "desktop_pet_bindings",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    desktopDeviceId: text("desktop_device_id").notNull(),
    petId: text("pet_id").notNull(),
    bindingType: bindingTypeEnum("binding_type").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    unboundAt: timestamp("unbound_at", { withTimezone: true }),
  },
  (table) => [
    index("idx_desktop_pet_bindings_device_created_at")
      .on(table.desktopDeviceId, sql`${table.createdAt} desc`)
      .where(sql`${table.unboundAt} is null`),
    index("idx_desktop_pet_bindings_pet_id")
      .on(table.petId)
      .where(sql`${table.unboundAt} is null`),
  ],
);

// ===== 设备授权 =====

export const deviceAuthorizations = pgTable(
  "device_authorizations",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    fromUserId: text("from_user_id").notNull(),
    toUserId: text("to_user_id").notNull(),
    petId: text("pet_id").notNull(),
    status: authorizationStatusEnum("status").notNull().default("accepted"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [unique().on(table.fromUserId, table.toUserId, table.petId)],
);

export const inviteCodes = pgTable("invite_codes", {
  id: text("id").primaryKey().$defaultFn(createId),
  codeHash: text("code_hash").notNull().unique(),
  fromUserId: text("from_user_id").notNull(),
  petId: text("pet_id").notNull(),
  acceptedBy: text("accepted_by"),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ===== 宠物形象 =====

export const petAvatars = pgTable(
  "pet_avatars",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    petId: text("pet_id").notNull(),
    sourceImageUrl: text("source_image_url").notNull(),
    additionalImageUrls: text("additional_image_urls"),
    petDescription: text("pet_description"),
    funFact: text("fun_fact"),
    status: avatarStatusEnum("status").notNull().default("pending"),
    rejectReason: text("reject_reason"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_pet_avatars_pet_created_at").on(
      table.petId,
      sql`${table.createdAt} desc`,
    ),
  ],
);

export const petAvatarActions = pgTable(
  "pet_avatar_actions",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    petAvatarId: text("pet_avatar_id").notNull(),
    actionType: text("action_type").notNull(),
    imageUrl: text("image_url").notNull(),
    videoUrl: text("video_url"),
    videoHash: text("video_hash"),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (table) => [
    uniqueIndex("uq_pet_avatar_actions_avatar_action_type").on(
      table.petAvatarId,
      table.actionType,
    ),
    index("idx_pet_avatar_actions_avatar_sort_order").on(
      table.petAvatarId,
      table.sortOrder,
      table.id,
    ),
  ],
);

// ===== 宠物行为 =====

export const petBehaviors = pgTable("pet_behaviors", {
  id: text("id").primaryKey().$defaultFn(createId),
  petId: text("pet_id").notNull(),
  collarDeviceId: text("collar_device_id").notNull(),
  actionType: text("action_type").notNull(),
  timestamp: timestamp("timestamp", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const petModePlans = pgTable(
  "pet_mode_plans",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    petId: text("pet_id")
      .notNull()
      .references(() => pets.id, { onDelete: "cascade" }),
    repeat: text("repeat").notNull(),
    days: jsonb("days").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    date: text("date"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_pet_mode_plans_pet_sort").on(table.petId, table.sortOrder, table.id),
    check("pet_mode_plans_repeat_check", sql`${table.repeat} IN ('once', 'weekly')`),
  ],
);

export const petModeSlots = pgTable(
  "pet_mode_slots",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    planId: text("plan_id").notNull(),
    start: text("start").notNull(),
    end: text("end").notNull(),
    action: text("action").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (table) => [
    foreignKey({
      columns: [table.planId],
      foreignColumns: [petModePlans.id],
      name: "pet_mode_slots_plan_id_pet_mode_plans_id_fk",
    }).onDelete("cascade"),
    index("idx_pet_mode_slots_plan_sort").on(table.planId, table.sortOrder, table.id),
  ],
);

export const behaviorSchedules = pgTable(
  "behavior_schedules",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    species: text("species").notNull(),
    name: text("name").notNull(),
    effectiveType: scheduleEffectiveTypeEnum("effective_type")
      .notNull()
      .default("everyday"),
    isActive: boolean("is_active").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("behavior_schedules_active_unique")
      .on(table.species, table.effectiveType)
      .where(sql`${table.isActive} = true`),
  ],
);

export const behaviorScheduleBlocks = pgTable(
  "behavior_schedule_blocks",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    scheduleId: text("schedule_id").notNull(),
    actionType: text("action_type").notNull(),
    startMinutes: integer("start_minutes").notNull(),
    endMinutes: integer("end_minutes").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (table) => [
    foreignKey({
      columns: [table.scheduleId],
      foreignColumns: [behaviorSchedules.id],
      name: "behavior_schedule_blocks_schedule_id_behavior_schedules_id_fk",
    }).onDelete("cascade"),
    check(
      "behavior_schedule_blocks_start_minutes_check",
      sql`${table.startMinutes} >= 0 AND ${table.startMinutes} < 1440`,
    ),
    check(
      "behavior_schedule_blocks_end_minutes_check",
      sql`${table.endMinutes} > 0 AND ${table.endMinutes} <= 1440`,
    ),
    check(
      "behavior_schedule_blocks_range_check",
      sql`${table.startMinutes} < ${table.endMinutes}`,
    ),
  ],
);

export const interactionEvents = pgTable(
  "interaction_events",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    petId: text("pet_id")
      .notNull()
      .references(() => pets.id, { onDelete: "cascade" }),
    deviceId: text("device_id"),
    actionType: text("action_type").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_interaction_events_pet_occurred_at").on(
      table.petId,
      table.occurredAt,
    ),
    index("idx_interaction_events_user_occurred_at").on(
      table.userId,
      table.occurredAt,
    ),
    index("idx_interaction_events_device_occurred_at").on(
      table.deviceId,
      table.occurredAt,
    ),
  ],
);

export const userSettings = pgTable("user_settings", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  messageEnabled: boolean("message_enabled").notNull().default(true),
  soundEnabled: boolean("sound_enabled").notNull().default(true),
  theme: userSettingThemeEnum("theme").notNull().default("system"),
  language: userSettingLanguageEnum("language").notNull().default("zh-CN"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const firmwareReleases = pgTable(
  "firmware_releases",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    deviceType: deviceTypeEnum("device_type").notNull(),
    version: varchar("version", { length: 64 }).notNull(),
    releaseNotes: text("release_notes").notNull(),
    releasedAt: timestamp("released_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("uq_firmware_releases_device_type_version").on(
      table.deviceType,
      table.version,
    ),
    index("idx_firmware_releases_device_type_released_at").on(
      table.deviceType,
      table.releasedAt,
    ),
  ],
);

// ===== 摆台 OTA =====

export const otaTokens = pgTable(
  "ota_tokens",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    name: text("name").notNull(),
    tokenHash: text("token_hash").notNull(),
    tokenPrefix: text("token_prefix").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdBy: text("created_by").notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("uq_ota_tokens_token_hash").on(table.tokenHash),
    index("idx_ota_tokens_revoked_at").on(table.revokedAt),
  ],
);

export const firmwareVersions = pgTable(
  "firmware_versions",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    version: text("version").notNull(),
    state: firmwareStateEnum("state").notNull().default("draft"),
    sha256: text("sha256").notNull(),
    size: bigint("size", { mode: "number" }).notNull(),
    storageKey: text("storage_key").notNull(),
    releaseNote: text("release_note"),
    force: boolean("force").notNull().default(false),
    minFromVersion: text("min_from_version"),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    uploadedByTokenId: text("uploaded_by_token_id").references(() => otaTokens.id, {
      onDelete: "set null",
    }),
    quarantinedAt: timestamp("quarantined_at", { withTimezone: true }),
    quarantinedReason: text("quarantined_reason"),
  },
  (table) => [
    uniqueIndex("uq_firmware_versions_version").on(table.version),
    index("idx_firmware_versions_state_version").on(table.state, table.version),
    check("firmware_versions_sha256_check", sql`length(${table.sha256}) = 64`),
    check("firmware_versions_size_check", sql`${table.size} > 0`),
  ],
);

export const internalDevices = pgTable("internal_devices", {
  chipId: text("chip_id").primaryKey(),
  addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
  addedBy: text("added_by").notNull(),
  note: text("note"),
});

export const deviceRegistry = pgTable(
  "device_registry",
  {
    chipId: text("chip_id").primaryKey(),
    online: boolean("online").notNull().default(false),
    fw: text("fw"),
    ip: text("ip"),
    rssi: integer("rssi"),
    freeHeap: bigint("free_heap", { mode: "number" }),
    mac: text("mac"),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_device_registry_online_fw").on(table.online, table.fw),
    index("idx_device_registry_last_seen_at").on(sql`${table.lastSeenAt} desc`),
  ],
);

export const dispatchJobs = pgTable(
  "dispatch_jobs",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    version: text("version").notNull(),
    chipIds: jsonb("chip_ids").$type<string[]>().notNull(),
    source: dispatchSourceEnum("source").notNull().default("manual"),
    dispatchedAt: timestamp("dispatched_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    totalCount: integer("total_count").notNull(),
    immediateCount: integer("immediate_count").notNull(),
    throttledCount: integer("throttled_count").notNull(),
    createdBy: text("created_by"),
  },
  (table) => [
    index("idx_dispatch_jobs_version_dispatched_at").on(
      table.version,
      sql`${table.dispatchedAt} desc`,
    ),
    check("dispatch_jobs_total_count_check", sql`${table.totalCount} >= 0`),
    check("dispatch_jobs_immediate_count_check", sql`${table.immediateCount} >= 0`),
    check("dispatch_jobs_throttled_count_check", sql`${table.throttledCount} >= 0`),
  ],
);

export const otaProgress = pgTable(
  "ota_progress",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    chipId: text("chip_id").notNull(),
    version: text("version").notNull(),
    stage: text("stage").notNull(),
    percent: integer("percent"),
    code: text("code"),
    reason: text("reason"),
    deviceTs: bigint("device_ts", { mode: "number" }).notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_ota_progress_chip_id").on(table.chipId),
    index("idx_ota_progress_chip_version_received").on(
      table.chipId,
      table.version,
      sql`${table.receivedAt} desc`,
    ),
    uniqueIndex("uq_ota_progress_dedupe").on(
      table.chipId,
      table.version,
      table.stage,
      table.deviceTs,
    ),
    check(
      "ota_progress_percent_check",
      sql`${table.percent} IS NULL OR (${table.percent} >= 0 AND ${table.percent} <= 100)`,
    ),
  ],
);

export const otaRollbacks = pgTable(
  "ota_rollbacks",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    chipId: text("chip_id").notNull(),
    version: text("version").notNull(),
    code: text("code"),
    reason: text("reason"),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    seenCount: integer("seen_count").notNull().default(1),
  },
  (table) => [
    uniqueIndex("uq_ota_rollbacks_chip_id_version").on(table.chipId, table.version),
    index("idx_ota_rollbacks_version_last_seen").on(
      table.version,
      sql`${table.lastSeenAt} desc`,
    ),
    check("ota_rollbacks_seen_count_check", sql`${table.seenCount} > 0`),
  ],
);

// ===== 消息 =====

export const messages = pgTable("messages", {
  id: text("id").primaryKey().$defaultFn(createId),
  userId: text("user_id").notNull(),
  type: messageTypeEnum("type").notNull(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  isRead: boolean("is_read").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
