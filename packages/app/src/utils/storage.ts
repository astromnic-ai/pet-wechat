import Taro from "@tarojs/taro";

export type PetActivityMode = "free" | "custom" | "real";
export type PetModeRepeatType = "once" | "weekly";
export type PetModeWeekday = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

export interface PetModeSchedule {
  repeat: PetModeRepeatType;
  days: PetModeWeekday[];
  date?: string | null;
}

export interface PetModeSlot {
  id: string;
  day: PetModeWeekday;
  start: string;
  end: string;
  action: string;
  repeat: PetModeRepeatType;
  date?: string | null;
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

function getPetModeScheduleKey(petId?: string) {
  return `petActivityModeSchedule_${petId || "default"}`;
}

function padTime(value: string) {
  const [hour = "0", minute = "0"] = String(value || "").split(":");
  return `${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`;
}

function formatDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getWeekdayFromDate(date: Date): PetModeWeekday {
  const day = date.getDay();
  if (day === 0) return "sun";
  if (day === 1) return "mon";
  if (day === 2) return "tue";
  if (day === 3) return "wed";
  if (day === 4) return "thu";
  if (day === 5) return "fri";
  return "sat";
}

function getTodayWeekday() {
  return getWeekdayFromDate(new Date());
}

function normalizeSchedule(value: any): PetModeSchedule {
  const rawDays = Array.isArray(value?.days) ? value.days : [];
  const days = rawDays.filter((item): item is PetModeWeekday =>
    ["mon", "tue", "wed", "thu", "fri", "sat", "sun"].includes(String(item))
  );

  return {
    repeat: value?.repeat === "weekly" ? "weekly" : "once",
    days: days.length > 0 ? days : [getTodayWeekday()],
    date: typeof value?.date === "string" ? value.date : null,
  };
}

function normalizeLegacySlot(slot: any, index: number): PetModeSlot {
  return {
    id: String(slot?.id || `legacy-${index}`),
    day: slot?.day || getTodayWeekday(),
    start: padTime(slot?.start || "07:00"),
    end: padTime(slot?.end || "09:00"),
    action: String(slot?.action || "跑步"),
    repeat: slot?.repeat === "once" ? "once" : "weekly",
    date: typeof slot?.date === "string" ? slot.date : null,
  };
}

export function getPetActivityMode(petId?: string): PetActivityMode {
  const value = Taro.getStorageSync(getPetModeKey(petId));
  return value === "custom" || value === "real" ? value : "free";
}

export function setPetActivityMode(petId: string | undefined, mode: PetActivityMode) {
  Taro.setStorageSync(getPetModeKey(petId), mode);
}

export function getPetModeSchedule(petId?: string): PetModeSchedule {
  const value = Taro.getStorageSync(getPetModeScheduleKey(petId));
  if (value && typeof value === "object") {
    return normalizeSchedule(value);
  }

  return {
    repeat: "once",
    days: [getTodayWeekday()],
    date: formatDate(new Date()),
  };
}

export function setPetModeSchedule(petId: string | undefined, schedule: PetModeSchedule) {
  Taro.setStorageSync(getPetModeScheduleKey(petId), normalizeSchedule(schedule));
}

export function getPetModeSlots(petId?: string): PetModeSlot[] {
  const value = Taro.getStorageSync(getPetModeSlotsKey(petId));
  if (Array.isArray(value)) {
    return value.map((slot, index) => normalizeLegacySlot(slot, index));
  }

  return [];
}

export function setPetModeSlots(petId: string | undefined, slots: PetModeSlot[]) {
  Taro.setStorageSync(getPetModeSlotsKey(petId), slots);
}

export function getCurrentWeekDateByDay(day: PetModeWeekday, baseDate = new Date()) {
  const current = new Date(baseDate);
  current.setHours(0, 0, 0, 0);
  const currentDay = current.getDay();
  const mondayBasedIndex = currentDay === 0 ? 6 : currentDay - 1;
  const monday = new Date(current);
  monday.setDate(current.getDate() - mondayBasedIndex);
  const targetOffsetMap: Record<PetModeWeekday, number> = {
    mon: 0,
    tue: 1,
    wed: 2,
    thu: 3,
    fri: 4,
    sat: 5,
    sun: 6,
  };
  const target = new Date(monday);
  target.setDate(monday.getDate() + targetOffsetMap[day]);
  return formatDate(target);
}
