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
export type DeviceType = "collar" | "desktop";
export type DeviceClaimStatus = "occupied" | "available" | "reset_required";
export type DeviceUpgradeStatus = "idle" | "pending" | "success" | "failed";
export type UserSettingTheme = "system" | "light" | "dark" | "blue";
export type UserSettingLanguage = "zh-CN" | "zh-TW" | "en-US";
export type ContentSlug = "help" | "about" | "privacy" | "user-agreement";

// ===== 用户 =====

export interface User {
  id: string;
  wechatOpenid: string | null;
  phone: string | null;
  email: string | null;
  nickname: string;
  avatarUrl: string | null;
  avatarQuota: number;
  avatarQuotaPurchased?: number;
  avatarQuotaFromDesktops?: number;
  avatarQuotaUsed?: number;
  avatarQuotaTotal?: number;
  avatarQuotaRemaining?: number;
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
  latestAvatarId?: string | null;
  latestAvatarStatus?: AvatarStatus | null;
  latestAvatarSourceImageUrl?: string | null;
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
  claimStatus: DeviceClaimStatus;
  usageDurationMinutes: number;
  upgradeStatus: DeviceUpgradeStatus;
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
  claimStatus: DeviceClaimStatus;
  usageDurationMinutes: number;
  upgradeStatus: DeviceUpgradeStatus;
  lastOnlineAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DeviceSummaryBinding {
  id: string;
  petId: string;
  bindingType: BindingType;
}

export interface DeviceSummary {
  deviceId: string;
  deviceType: DeviceType;
  name: string;
  status: DeviceStatus;
  firmwareVersion: string | null;
  claimStatus: DeviceClaimStatus;
  usageDurationMinutes: number;
  upgradeStatus: DeviceUpgradeStatus;
  lastOnlineAt: string | null;
  inactiveDays: number | null;
  isInactive: boolean;
  petId?: string | null;
  bindings?: DeviceSummaryBinding[];
}

export interface DeviceFirmwareStatus {
  deviceId: string;
  deviceType: DeviceType;
  currentVersion: string | null;
  latestVersion: string | null;
  hasUpdate: boolean;
  releaseNotes: string | null;
  upgradeStatus: DeviceUpgradeStatus;
}

export interface DesktopPetBinding {
  id: string;
  desktopDeviceId: string;
  petId: string;
  bindingType: BindingType;
  createdAt: string;
  unboundAt: string | null;
}

export interface AdminDeviceAvatarProgress {
  uploaded: number;
  total: number;
}

export interface AdminDeviceListItem {
  type: DeviceType;
  id: string;
  name: string;
  macAddress: string;
  status: DeviceStatus;
  claimStatus: DeviceClaimStatus;
  upgradeStatus: DeviceUpgradeStatus;
  userId: string | null;
  userNickname: string | null;
  petId: string | null;
  petName: string | null;
  petSpecies: Species | null;
  petAvatarUrl: string | null;
  battery: number | null;
  signal: number | null;
  lastOnlineAt: string | null;
  createdAt: string;
  hasUploadedAvatar: boolean;
  avatarProgress: AdminDeviceAvatarProgress;
  bindingCount: number;
}

export interface AdminDeviceDetailOwner {
  id: string;
  nickname: string;
  avatarUrl: string | null;
}

export interface AdminDeviceDetailPet {
  id: string;
  name: string;
  species: Species;
  speciesLabel: string;
  avatarUrl: string | null;
  companionDays: number;
}

export interface AdminDeviceRelationItem {
  type: DeviceType;
  id: string;
  name: string;
  status: DeviceStatus;
  claimStatus: DeviceClaimStatus;
  lastOnlineAt: string | null;
  createdAt: string;
}

export interface AdminDeviceDetailAvatarProgress extends AdminDeviceAvatarProgress {
  approved: number;
  pending: number;
}

export interface AdminDeviceDetail {
  device: AdminDeviceListItem;
  owner: AdminDeviceDetailOwner | null;
  pet: AdminDeviceDetailPet | null;
  relatedDevices: AdminDeviceRelationItem[];
  avatarProgress: AdminDeviceDetailAvatarProgress;
  lastSyncedAt: string | null;
  activatedAt: string;
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
  additionalImageUrls?: string | null;
  petDescription?: string | null;
  funFact?: string | null;
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
  videoUrl?: string | null;
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

// ===== 用户设置 =====

export interface UserSettings {
  messageEnabled: boolean;
  soundEnabled: boolean;
  theme: UserSettingTheme;
  language: UserSettingLanguage;
}

// ===== 互动统计 =====

export interface InteractionStatsBucket {
  label: string;
  count: number;
}

export interface InteractionStats {
  totalCount: number;
  todayCount: number;
  weekCount: number;
  monthCount: number;
  buckets?: InteractionStatsBucket[];
}

// ===== 内容页 =====

export interface ContentPage {
  slug: ContentSlug;
  title: string;
  body: string;
  version: string;
  updatedAt: string;
}

// ===== 账号绑定 =====

export interface BindCodeSendResponse {
  accepted: boolean;
  mockCode: string;
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
