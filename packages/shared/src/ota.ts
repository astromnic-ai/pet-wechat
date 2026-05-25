export type FirmwareState = "draft" | "internal" | "released" | "quarantine";

export type OtaStage =
  | "received"
  | "waiting_idle"
  | "deferred"
  | "downloading"
  | "verifying"
  | "installing"
  | "rebooting"
  | "verified"
  | "rolled_back"
  | "failed";

export type OtaCommandPayload = {
  v: 1;
  version: string;
  url: string;
  sha256: string;
  size: number;
  force?: boolean;
  minFromVersion?: string | null;
};

export type PetActivityMode = "free" | "custom" | "real";
export type PetModeRepeatType = "once" | "weekly";
export type PetModeWeekday = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

export type PetModeSlotDTO = {
  id: string;
  start: string;
  end: string;
  action: string;
  sortOrder?: number;
};

export type PetModePlanDTO = {
  id: string;
  repeat: PetModeRepeatType;
  days: PetModeWeekday[];
  date: string | null;
  sortOrder?: number;
  slots: PetModeSlotDTO[];
};

export type PetActionMqttPayload = {
  v: 1;
  action: string;
  label?: number;
};

export type DesktopConfigMqttPayload = {
  v: 1;
  petId: string;
  bindingId: string;
  bindingType: "owner" | "authorized";
};

export const ACTION_LABEL_MAP: Record<string, number> = {
  "base-lay": 0,
  "base-seat": 1,
  "base-walk": 2,
  "base-run": 3,
  "base-eat": 4,
  "base-sleep": 5,
  "base-stand": 6,
};

export function actionToLabel(action: string): number | undefined {
  return ACTION_LABEL_MAP[action];
}

export type OtaProgressPayload = {
  v?: number;
  version: string;
  stage: OtaStage;
  percent?: number;
  code?: string;
  reason?: string;
  ts: number;
};

export type StatusPayload = {
  v?: number;
  online: boolean;
  fw?: string;
  ip?: string;
  rssi?: number;
  free_heap?: number;
  freeHeap?: number;
  mac?: string;
  hw?: string;
  model?: string;
  ts?: number;
};
