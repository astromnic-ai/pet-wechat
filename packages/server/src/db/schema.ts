import {
  pgTable,
  text,
  timestamp,
  integer,
  real,
  boolean,
  pgEnum,
  unique,
} from "drizzle-orm/pg-core";
import { createId } from "../utils/id";

// ===== 枚举 =====

export const speciesEnum = pgEnum("species", ["cat", "dog", "other"]);
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
]);
export const messageTypeEnum = pgEnum("message_type", [
  "authorization",
  "system",
  "activity",
  "health",
  "device",
  "community",
]);
export const petActivityModeEnum = pgEnum("pet_activity_mode", [
  "free",
  "custom",
  "real",
]);
export const scheduleSourceEnum = pgEnum("schedule_source", [
  "system",
  "custom",
]);
export const customActionStatusEnum = pgEnum("custom_action_status", [
  "pending",
  "processing",
  "done",
  "failed",
]);
export const interactionTypeEnum = pgEnum("interaction_type", [
  "touch",
  "shake",
  "gesture",
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
  passwordHash: text("password_hash"),
  avatarQuota: integer("avatar_quota").notNull().default(2),
  deviceBindingQuota: integer("device_binding_quota").notNull().default(3),
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
  description: text("description"),
  color: text("color"),
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

// ===== 宠物活动模式 =====

export const petModes = pgTable("pet_modes", {
  id: text("id").primaryKey().$defaultFn(createId),
  petId: text("pet_id")
    .notNull()
    .references(() => pets.id, { onDelete: "cascade" })
    .unique(),
  mode: petActivityModeEnum("mode").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const petModeSchedules = pgTable("pet_mode_schedules", {
  id: text("id").primaryKey().$defaultFn(createId),
  petId: text("pet_id")
    .notNull()
    .references(() => pets.id, { onDelete: "cascade" }),
  source: scheduleSourceEnum("source").notNull(),
  startTime: text("start_time").notNull(),
  endTime: text("end_time").notNull(),
  actionType: text("action_type").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ===== 自定义动作 =====

export const customActions = pgTable("custom_actions", {
  id: text("id").primaryKey().$defaultFn(createId),
  petId: text("pet_id")
    .notNull()
    .references(() => pets.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  videoUrl: text("video_url").notNull(),
  status: customActionStatusEnum("status").notNull(),
  resultImageUrl: text("result_image_url"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ===== 设备互动 =====

export const deviceInteractions = pgTable("device_interactions", {
  id: text("id").primaryKey().$defaultFn(createId),
  desktopDeviceId: text("desktop_device_id")
    .notNull()
    .references(() => desktopDevices.id, { onDelete: "cascade" }),
  petId: text("pet_id")
    .notNull()
    .references(() => pets.id, { onDelete: "cascade" }),
  interactionType: interactionTypeEnum("interaction_type").notNull(),
  count: integer("count").notNull().default(1),
  timestamp: timestamp("timestamp", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

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
