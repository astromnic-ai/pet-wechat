import { SCHEDULE_SPECIES, type ActionType } from "./constants";

// ===== 枚举 =====

export type Species = "cat" | "dog";
export type Gender = "male" | "female" | "unknown";
export type DeviceStatus = "online" | "offline" | "pairing";
export type AvatarStatus =
  | "pending"
  | "processing"
  | "done"
  | "failed"
  | "approved"
  | "rejected";
export type MessageType = "authorization" | "system";
export type BindingType = "owner" | "authorized";
export type AuthorizationStatus = "pending" | "accepted" | "rejected";
export type ScheduleEffectiveType = "everyday" | "weekday";

// ===== 用户 =====

export interface User {
  id: string;
  wechatOpenid: string | null;
  phone: string | null;
  nickname: string;
  avatarUrl: string | null;
  avatarQuota: number;
  createdAt: string;
  updatedAt: string;
}

// ===== 宠物 =====

export interface Pet {
  id: string;
  userId: string;
  name: string;
  species: Species;
  breed: string | null;
  gender: Gender;
  birthday: string | null;
  weight: number | null;
  activityScore: number;
  latestBehavior?: PetLatestBehavior | null;
  avatarImageUrl?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PetLatestBehavior {
  actionType: string;
  timestamp: string;
}

// ===== 设备 =====

export interface CollarDevice {
  id: string;
  userId: string | null;
  petId: string | null;
  name: string;
  macAddress: string;
  status: DeviceStatus;
  battery: number | null;
  signal: number | null;
  firmwareVersion: string | null;
  lastOnlineAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DesktopDevice {
  id: string;
  userId: string | null;
  name: string;
  macAddress: string;
  status: DeviceStatus;
  firmwareVersion: string | null;
  lastOnlineAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DesktopPetBinding {
  id: string;
  desktopDeviceId: string;
  petId: string;
  bindingType: BindingType;
  createdAt: string;
  unboundAt: string | null;
}

// ===== 设备授权 =====

export interface DeviceAuthorization {
  id: string;
  fromUserId: string;
  toUserId: string;
  petId: string;
  status: AuthorizationStatus;
  createdAt: string;
}

// ===== 宠物形象 =====

export interface PetAvatar {
  id: string;
  petId: string;
  sourceImageUrl: string;
  status: AvatarStatus;
  rejectReason?: string | null;
  reviewedAt?: string | null;
  createdAt: string;
}

export interface PetAvatarAction {
  id: string;
  petAvatarId: string;
  actionType: string;
  imageUrl: string;
  sortOrder: number;
}

export interface BehaviorSchedule {
  id: string;
  species: (typeof SCHEDULE_SPECIES)[number];
  name: string;
  effectiveType: ScheduleEffectiveType;
  isActive: boolean;
  blocks?: BehaviorScheduleBlock[];
  createdAt: string;
  updatedAt: string;
}

export interface BehaviorScheduleBlock {
  id: string;
  scheduleId: string;
  actionType: ActionType;
  startMinutes: number;
  endMinutes: number;
  sortOrder: number;
}

// ===== 行为 =====

export interface PetBehavior {
  id: string;
  petId: string;
  collarDeviceId: string;
  actionType: string;
  timestamp: string;
}

export interface WsBehaviorNewMessage {
  type: "behavior:new";
  data: {
    petId: string;
    actionType: string;
    timestamp: string;
  };
}

export interface WsAvatarDoneMessage {
  type: "avatar:done";
  data: {
    petId: string;
    avatarId: string;
    petName: string;
  };
}

export interface WsPingMessage {
  type: "ping";
}

export interface WsPongMessage {
  type: "pong";
}

export type WsMessage =
  | WsBehaviorNewMessage
  | WsAvatarDoneMessage
  | WsPingMessage
  | WsPongMessage;

// ===== 邀请 =====

export interface InvitePayload {
  fromUserId: string;
  petId: string;
  petName: string;
  fromNickname: string;
}

// ===== 消息 =====

export interface Message {
  id: string;
  userId: string;
  type: MessageType;
  title: string;
  content: string;
  isRead: boolean;
  createdAt: string;
}
