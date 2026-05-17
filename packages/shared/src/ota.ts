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
