import Taro from "@tarojs/taro";

export type PetActivityMode = "free" | "custom" | "real";

export interface PetModeSlot {
  start: string;
  end: string;
  action: string;
}

export function isLoggedIn(): boolean {
  return !!Taro.getStorageSync("token");
}

export function getUserInfo(): any {
  const data = Taro.getStorageSync("userInfo");
  return data ? JSON.parse(data) : null;
}

export function setUserInfo(user: any) {
  Taro.setStorageSync("userInfo", JSON.stringify(user));
}

export function isFirstLogin(userId: string): boolean {
  return !Taro.getStorageSync(`hasCompletedGuide_${userId}`);
}

export function hasCompletedGuide(): boolean {
  const userId = Taro.getStorageSync("userId");
  return Boolean(userId && Taro.getStorageSync(`hasCompletedGuide_${userId}`));
}

export function markGuideCompleted() {
  const userId = Taro.getStorageSync("userId");
  if (userId) {
    Taro.setStorageSync(`hasCompletedGuide_${userId}`, "1");
  }
  // Clean up the legacy global flag so different test accounts don't
  // accidentally skip the first-time device-selection flow.
  Taro.removeStorageSync("hasCompletedGuide");
}

function getPetModeKey(petId?: string) {
  return `petActivityMode_${petId || "default"}`;
}

function getPetModeSlotsKey(petId?: string) {
  return `petActivityModeSlots_${petId || "default"}`;
}

export function getPetActivityMode(petId?: string): PetActivityMode {
  const value = Taro.getStorageSync(getPetModeKey(petId));
  return value === "custom" || value === "real" ? value : "free";
}

export function setPetActivityMode(petId: string | undefined, mode: PetActivityMode) {
  Taro.setStorageSync(getPetModeKey(petId), mode);
}

export function getPetModeSlots(petId?: string): PetModeSlot[] {
  const value = Taro.getStorageSync(getPetModeSlotsKey(petId));
  if (Array.isArray(value)) {
    return value;
  }

  return [
    { start: "7:00", end: "9:00", action: "跑步" },
    { start: "9:00", end: "12:00", action: "睡觉" },
    { start: "12:00", end: "14:00", action: "吃饭" },
  ];
}

export function setPetModeSlots(petId: string | undefined, slots: PetModeSlot[]) {
  Taro.setStorageSync(getPetModeSlotsKey(petId), slots);
}
