// ===== 枚举 =====

export type Species = "cat" | "dog" | "other";
export type Gender = "male" | "female" | "unknown";
export type DeviceStatus = "online" | "offline" | "pairing";
export type AvatarStatus = "pending" | "processing" | "done" | "failed";
export type MessageType =
  | "authorization"
  | "system"
  | "activity"
  | "health"
  | "device"
  | "community";
export type PetActivityMode = "free" | "custom" | "real";
export type ScheduleSource = "system" | "custom";
export type CustomActionStatus = "pending" | "processing" | "done" | "failed";
export type InteractionType = "touch" | "shake" | "gesture";
export type BindingType = "owner" | "authorized";
export type AuthorizationStatus = "pending" | "accepted" | "rejected";

// ===== 用户 =====

export interface User {
  id: string;
  wechatOpenid: string | null;
  phone: string | null;
  nickname: string;
  avatarUrl: string | null;
  avatarQuota: number;
  deviceBindingQuota?: number;
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
  description?: string | null;
  color?: string | null;
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

export interface PetMode {
  id: string;
  petId: string;
  mode: PetActivityMode;
  createdAt: string;
  updatedAt: string;
}

export interface PetModeSchedule {
  id: string;
  petId: string;
  source: ScheduleSource;
  startTime: string;
  endTime: string;
  actionType: string;
  sortOrder: number;
  createdAt: string;
}

export interface CustomAction {
  id: string;
  petId: string;
  userId: string;
  name: string;
  description: string | null;
  videoUrl: string;
  status: CustomActionStatus;
  resultImageUrl: string | null;
  createdAt: string;
}

export interface DeviceInteraction {
  id: string;
  desktopDeviceId: string;
  petId: string;
  interactionType: InteractionType;
  count: number;
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
  createdAt: string;
}

export interface PetAvatarAction {
  id: string;
  petAvatarId: string;
  actionType: string;
  imageUrl: string;
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

export interface WsCustomActionDoneMessage {
  type: "custom-action:done";
  data: {
    petId: string;
    actionId: string;
    resultImageUrl: string | null;
  };
}

export interface WsInteractionNewMessage {
  type: "interaction:new";
  data: {
    interactionId: string;
    desktopDeviceId: string;
    petId: string;
    interactionType: InteractionType;
    count: number;
    timestamp: string;
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
  | WsCustomActionDoneMessage
  | WsInteractionNewMessage
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
