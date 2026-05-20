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
  start: string;
  end: string;
  action: string;
  day?: PetModeWeekday;
  repeat?: PetModeRepeatType;
  date?: string | null;
}

export interface PetModePlan {
  id: string;
  repeat: PetModeRepeatType;
  days: PetModeWeekday[];
  date?: string | null;
  slots: PetModeSlot[];
}

export type ProfileGender = "male" | "female" | "unknown";

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

function getPetModePlansKey(petId?: string) {
  return `petActivityModePlans_${petId || "default"}`;
}

function getPetCustomActionLabelsKey(petId?: string) {
  return `petCustomActionLabels_${petId || "default"}`;
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
    start: padTime(slot?.start || "07:00"),
    end: padTime(slot?.end || "09:00"),
    action: String(slot?.action || "跑步"),
    day: slot?.day || getTodayWeekday(),
    repeat: slot?.repeat === "once" ? "once" : "weekly",
    date: typeof slot?.date === "string" ? slot.date : null,
  };
}

function normalizePlan(value: any, index: number): PetModePlan {
  const schedule = normalizeSchedule(value);
  const slots = Array.isArray(value?.slots)
    ? value.slots.map((slot: any, slotIndex: number) => {
        const normalized = normalizeLegacySlot(slot, slotIndex);
        return {
          id: normalized.id,
          start: normalized.start,
          end: normalized.end,
          action: normalized.action,
          day: schedule.days.includes(normalized.day) ? normalized.day : schedule.days[0],
          repeat: schedule.repeat,
          date: schedule.repeat === "once" && normalized.day ? getCurrentWeekDateByDay(normalized.day) : null,
        };
      })
    : [];

  return {
    id: String(value?.id || `plan-${index}`),
    repeat: schedule.repeat,
    days: schedule.days,
    date: schedule.date,
    slots,
  };
}

function getLegacyPetModePlan(petId?: string): PetModePlan[] {
  const scheduleValue = Taro.getStorageSync(getPetModeScheduleKey(petId));
  const slotsValue = Taro.getStorageSync(getPetModeSlotsKey(petId));
  const schedule = normalizeSchedule(scheduleValue);
  const slots = Array.isArray(slotsValue)
    ? slotsValue.map((slot, index) => {
        const normalized = normalizeLegacySlot(slot, index);
        return {
          id: normalized.id,
          start: normalized.start,
          end: normalized.end,
          action: normalized.action,
        };
      })
    : [];

  if (slots.length === 0) {
    return [];
  }

  return [
    {
      id: "legacy-plan",
      repeat: schedule.repeat,
      days: schedule.days,
      date: schedule.date,
      slots,
    },
  ];
}

export function getPetActivityMode(petId?: string): PetActivityMode {
  const value = Taro.getStorageSync(getPetModeKey(petId));
  return value === "custom" || value === "real" ? value : "free";
}

export function setPetActivityMode(petId: string | undefined, mode: PetActivityMode) {
  Taro.setStorageSync(getPetModeKey(petId), mode);
}

export function getPetModeSchedule(petId?: string): PetModeSchedule {
  const plans = getPetModePlans(petId);
  const firstPlan = plans[0];
  if (firstPlan) {
    return {
      repeat: firstPlan.repeat,
      days: firstPlan.days,
      date: firstPlan.date ?? null,
    };
  }

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
  const plans = getPetModePlans(petId);
  if (plans.length > 0) {
    return plans.flatMap((plan) =>
      plan.slots.map((slot) => ({
        id: slot.id,
        start: slot.start,
        end: slot.end,
        action: slot.action,
        day: slot.day || plan.days[0] || getTodayWeekday(),
        repeat: plan.repeat,
        date: plan.repeat === "once" && slot.day ? getCurrentWeekDateByDay(slot.day) : plan.date ?? null,
      }))
    );
  }

  const value = Taro.getStorageSync(getPetModeSlotsKey(petId));
  if (Array.isArray(value)) {
    return value.map((slot, index) => normalizeLegacySlot(slot, index));
  }

  return [];
}

export function setPetModeSlots(petId: string | undefined, slots: PetModeSlot[]) {
  Taro.setStorageSync(getPetModeSlotsKey(petId), slots);
}

export function getPetModePlans(petId?: string): PetModePlan[] {
  const value = Taro.getStorageSync(getPetModePlansKey(petId));
  if (Array.isArray(value)) {
    return value.map((plan, index) => normalizePlan(plan, index));
  }

  return getLegacyPetModePlan(petId);
}

export function getPersistedPetModePlans(petId?: string): PetModePlan[] {
  const value = Taro.getStorageSync(getPetModePlansKey(petId));
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((plan, index) => normalizePlan(plan, index));
}

export function setPetModePlans(petId: string | undefined, plans: PetModePlan[]) {
  const normalizedPlans = plans.map((plan, index) => normalizePlan(plan, index));
  Taro.setStorageSync(getPetModePlansKey(petId), normalizedPlans);

  const firstPlan = normalizedPlans[0];
  if (firstPlan) {
    Taro.setStorageSync(
      getPetModeScheduleKey(petId),
      normalizeSchedule({
        repeat: firstPlan.repeat,
        days: firstPlan.days,
        date: firstPlan.date ?? null,
      })
    );
    Taro.setStorageSync(
      getPetModeSlotsKey(petId),
      firstPlan.slots.map((slot) => ({
        ...slot,
        day: slot.day || firstPlan.days[0] || getTodayWeekday(),
        repeat: firstPlan.repeat,
        date: firstPlan.repeat === "once" && slot.day ? getCurrentWeekDateByDay(slot.day) : firstPlan.date ?? null,
      }))
    );
    return;
  }

  Taro.removeStorageSync(getPetModeScheduleKey(petId));
  Taro.removeStorageSync(getPetModeSlotsKey(petId));
}

export function getPetCustomActionLabels(petId?: string): string[] {
  const value = Taro.getStorageSync(getPetCustomActionLabelsKey(petId));
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .map((item) => String(item || "").trim())
        .filter(Boolean)
    )
  );
}

export function addPetCustomActionLabel(petId: string | undefined, label: string) {
  const nextLabel = String(label || "").trim();
  if (!nextLabel) return;

  const current = getPetCustomActionLabels(petId);
  if (current.includes(nextLabel)) return;
  Taro.setStorageSync(getPetCustomActionLabelsKey(petId), [...current, nextLabel]);
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
