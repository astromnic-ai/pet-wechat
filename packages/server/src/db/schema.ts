import {
  check,
  foreignKey,
  pgTable,
  text,
  timestamp,
  integer,
  real,
  boolean,
  pgEnum,
  unique,
  uniqueIndex,
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

// ===== 用户 =====

export const users = pgTable("users", {
  id: text("id").primaryKey().$defaultFn(createId),
  wechatOpenid: text("wechat_openid").unique(),
  phone: text("phone").unique(),
  nickname: text("nickname").notNull(),
  avatarUrl: text("avatar_url"),
  avatarQuota: integer("avatar_quota").notNull().default(2),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

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
  activityScore: integer("activity_score").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ===== 项圈设备 =====

export const collarDevices = pgTable("collar_devices", {
  id: text("id").primaryKey().$defaultFn(createId),
  userId: text("user_id"),
  petId: text("pet_id"),
  name: text("name").notNull(),
  macAddress: text("mac_address").notNull().unique(),
  status: deviceStatusEnum("status").notNull().default("offline"),
  battery: integer("battery"),
  signal: integer("signal"),
  firmwareVersion: text("firmware_version"),
  lastOnlineAt: timestamp("last_online_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ===== 桌面端设备 =====

export const desktopDevices = pgTable("desktop_devices", {
  id: text("id").primaryKey().$defaultFn(createId),
  userId: text("user_id"),
  name: text("name").notNull(),
  macAddress: text("mac_address").notNull().unique(),
  status: deviceStatusEnum("status").notNull().default("offline"),
  firmwareVersion: text("firmware_version"),
  lastOnlineAt: timestamp("last_online_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ===== 桌面端-宠物绑定 =====

export const desktopPetBindings = pgTable("desktop_pet_bindings", {
  id: text("id").primaryKey().$defaultFn(createId),
  desktopDeviceId: text("desktop_device_id").notNull(),
  petId: text("pet_id").notNull(),
  bindingType: bindingTypeEnum("binding_type").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  unboundAt: timestamp("unbound_at", { withTimezone: true }),
});

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
  (t) => [unique().on(t.fromUserId, t.toUserId, t.petId)],
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

export const petAvatars = pgTable("pet_avatars", {
  id: text("id").primaryKey().$defaultFn(createId),
  petId: text("pet_id").notNull(),
  sourceImageUrl: text("source_image_url").notNull(),
  additionalImageUrls: text("additional_image_urls"),
  status: avatarStatusEnum("status").notNull().default("pending"),
  rejectReason: text("reject_reason"),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const petAvatarActions = pgTable("pet_avatar_actions", {
  id: text("id").primaryKey().$defaultFn(createId),
  petAvatarId: text("pet_avatar_id").notNull(),
  actionType: text("action_type").notNull(),
  imageUrl: text("image_url").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
});

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
