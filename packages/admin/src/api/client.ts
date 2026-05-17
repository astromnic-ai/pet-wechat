import type {
  AdminDeviceDetail,
  AdminDeviceListItem,
  AvatarReviewStats,
  CustomizationTask,
  DeviceType,
  FirmwareState,
  Membership,
  PresignResponse,
} from "shared";

type PageResponse<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
};

type OtaOkResponse<T> = T & {
  ok: true;
};

type OtaErrorResponse = {
  ok: false;
  code: string;
  message: string;
};

export type OtaError = Error & {
  code?: string;
};

export type OtaFirmwareVersion = {
  id: string;
  version: string;
  state: FirmwareState;
  sha256: string;
  size: number;
  storageKey: string;
  releaseNote: string | null;
  force: boolean;
  minFromVersion: string | null;
  uploadedAt: string;
  uploadedByTokenId: string | null;
  quarantinedAt: string | null;
  quarantinedReason: string | null;
};

export type OtaInternalDevice = {
  chipId: string;
  addedAt: string;
  addedBy: string;
  note: string | null;
};

export type OtaRegistryDevice = {
  chipId: string;
  online: boolean;
  fw: string | null;
  ip: string | null;
  rssi: number | null;
  freeHeap: number | null;
  mac: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
};

export type OtaDispatchJob = {
  id: string;
  version: string;
  chipIds: string[];
  source: "manual" | "auto_full" | "internal_auto";
  dispatchedAt: string;
  totalCount: number;
  immediateCount: number;
  throttledCount: number;
  createdBy: string | null;
  progress: Record<string, number>;
};

export type OtaToken = {
  id: string;
  name: string;
  tokenPrefix: string;
  createdAt: string;
  createdBy: string;
  revokedAt: string | null;
  lastUsedAt: string | null;
};

export function getAdminKey() {
  return localStorage.getItem("adminKey") || "";
}

export function setAdminKey(key: string) {
  localStorage.setItem("adminKey", key);
}

export async function verifyAdminKey(key: string): Promise<boolean> {
  const res = await fetch("/api/admin/stats", {
    headers: {
      "Content-Type": "application/json",
      "X-Admin-Key": key,
    },
  });

  if (res.status === 401) {
    return false;
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }

  return true;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`/api/admin${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-Admin-Key": getAdminKey(),
      ...options?.headers,
    },
  });

  if (res.status === 401) {
    localStorage.removeItem("adminKey");
    window.location.reload();
    throw new Error("Admin Key 无效");
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

async function otaRequest<T>(path: string, options?: RequestInit): Promise<T> {
  const isFormData = options?.body instanceof FormData;
  const res = await fetch(`/api/admin${path}`, {
    ...options,
    headers: {
      ...(isFormData ? {} : { "Content-Type": "application/json" }),
      "X-Admin-Key": getAdminKey(),
      ...options?.headers,
    },
  });

  if (res.status === 401) {
    localStorage.removeItem("adminKey");
    window.location.reload();
    throw new Error("Admin Key 无效");
  }

  const payload = (await res.json().catch(() => null)) as OtaOkResponse<T> | OtaErrorResponse | null;
  if (!res.ok || payload?.ok === false) {
    const otaError = payload?.ok === false ? payload : null;
    const error = new Error(otaError?.message || res.statusText) as OtaError;
    error.code = otaError?.code;
    throw error;
  }

  return payload as T;
}

async function uploadAdminFile(path: string, file: File): Promise<{ url: string; fileId: string }> {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(`/api/admin${path}`, {
    method: "POST",
    headers: {
      "X-Admin-Key": getAdminKey(),
    },
    body: formData,
  });

  if (res.status === 401) {
    localStorage.removeItem("adminKey");
    window.location.reload();
    throw new Error("Admin Key 无效");
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }

  return res.json();
}

async function uploadAdminAsset(
  path: string,
  file: File,
  contentType?: "image/jpeg" | "image/png" | "image/webp" | "video/mjpeg" | "video/x-motion-jpeg",
): Promise<{ url: string; fileId: string }> {
  const formData = new FormData();
  formData.append("file", file);
  if (contentType) {
    formData.append("contentType", contentType);
  }

  const res = await fetch(`/api/admin${path}`, {
    method: "POST",
    headers: {
      "X-Admin-Key": getAdminKey(),
    },
    body: formData,
  });

  if (res.status === 401) {
    localStorage.removeItem("adminKey");
    window.location.reload();
    throw new Error("Admin Key 无效");
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }

  return res.json();
}

async function uploadAvatarActionVideo(avatarId: string, actionId: string, file: File): Promise<{ action: any }> {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(`/api/admin/avatars/${avatarId}/actions/${actionId}/video`, {
    method: "POST",
    headers: {
      "X-Admin-Key": getAdminKey(),
    },
    body: formData,
  });

  if (res.status === 401) {
    localStorage.removeItem("adminKey");
    window.location.reload();
    throw new Error("Admin Key 无效");
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }

  return res.json();
}

export const api = {
  // Stats
  getStats: () => request<Record<string, number>>("/stats"),

  // Users
  getUsers: () => request<{ users: any[] }>("/users"),
  createUser: (data: any) => request<{ user: any }>("/users", { method: "POST", body: JSON.stringify(data) }),
  updateUser: (id: string, data: any) => request<{ user: any }>(`/users/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteUser: (id: string) => request(`/users/${id}`, { method: "DELETE" }),

  // Pets
  getPets: () => request<{ pets: any[] }>("/pets"),
  createPet: (data: any) => request<{ pet: any }>("/pets", { method: "POST", body: JSON.stringify(data) }),
  updatePet: (id: string, data: any) => request<{ pet: any }>(`/pets/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deletePet: (id: string) => request(`/pets/${id}`, { method: "DELETE" }),

  // Collars
  getCollars: () => request<{ collars: any[] }>("/collars"),
  createCollar: (data: any) => request<{ collar: any }>("/collars", { method: "POST", body: JSON.stringify(data) }),
  updateCollar: (id: string, data: any) => request<{ collar: any }>(`/collars/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteCollar: (id: string) => request(`/collars/${id}`, { method: "DELETE" }),

  // Desktops
  getDesktops: () => request<{ desktops: any[] }>("/desktops"),
  createDesktop: (data: any) => request<{ desktop: any }>("/desktops", { method: "POST", body: JSON.stringify(data) }),
  updateDesktop: (id: string, data: any) => request<{ desktop: any }>(`/desktops/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteDesktop: (id: string) => request(`/desktops/${id}`, { method: "DELETE" }),

  // Behaviors
  getBehaviors: (limit?: number) => request<{ behaviors: any[] }>(`/behaviors?limit=${limit ?? 50}`),
  createBehavior: (data: any) => request<{ behavior: any }>("/behaviors", { method: "POST", body: JSON.stringify(data) }),
  autoBehaviors: (data: any) => request<{ behaviors: any[]; count: number }>("/behaviors/auto", { method: "POST", body: JSON.stringify(data) }),

  // Schedules
  getSchedules: () => request<{ schedules: any[] }>("/schedules"),
  createSchedule: (data: any) => request<{ schedule: any }>("/schedules", { method: "POST", body: JSON.stringify(data) }),
  updateSchedule: (id: string, data: any) => request<{ schedule: any }>(`/schedules/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteSchedule: (id: string) => request(`/schedules/${id}`, { method: "DELETE" }),
  activateSchedule: (id: string) => request<{ schedule: any }>(`/schedules/${id}/activate`, { method: "POST" }),

  // Avatars (Review + Customization)
  getAvatars: (status?: string) => request<{ avatars: any[] }>(`/avatars${status ? `?status=${status}` : ""}`),
  getAvatar: (id: string) => request<{ avatar: any }>(`/avatars/${id}`),
  approveAvatar: (id: string) => request<{ avatar: any }>(`/avatars/${id}/approve`, { method: "PUT" }),
  rejectAvatar: (id: string, reason: string, title?: string) =>
    request<{ avatar: any }>(`/avatars/${id}/reject`, { method: "PUT", body: JSON.stringify({ reason, title }) }),
  getAvatarActions: (id: string) => request<{ actions: any[] }>(`/avatars/${id}/actions`),
  createAvatarAction: (id: string, data: { actionType: string; imageUrl: string }) =>
    request<{ action: any }>(`/avatars/${id}/actions`, { method: "POST", body: JSON.stringify(data) }),
  saveAvatarActionCategory: (id: string, category: "basic" | "fun" | "interactive") =>
    request<{ category: string; saved: number; total: number; actions: any[]; avatarStatus: string }>(
      `/avatars/${id}/action-categories/${category}/save`,
      { method: "POST" },
    ),
  deleteAvatarAction: (id: string, actionId: string) => request(`/avatars/${id}/actions/${actionId}`, { method: "DELETE" }),
  uploadAvatarActionVideo,
  updateAvatarMeta: (id: string, data: { petDescription?: string; funFact?: string }) =>
    request<{ avatar: any }>(`/avatars/${id}/meta`, { method: "PUT", body: JSON.stringify(data) }),
  syncAvatar: (id: string) => request<{ avatar: any }>(`/avatars/${id}/sync`, { method: "POST" }),
  uploadAdminImage: (file: File) => uploadAdminFile("/upload", file),

  // Enhanced Stats
  getEnhancedStats: () => request<any>("/stats/enhanced"),

  // Analytics
  getAnalytics: () => request<any>("/analytics"),

  // Enhanced Users
  getEnhancedUsers: () => request<{ users: any[] }>("/users/enhanced"),
  getUserDetail: (id: string) => request<any>(`/users/${id}/detail`),
  getMembership: (id: string) => request<Membership>(`/users/${id}/membership`),
  updateMembership: (
    id: string,
    data: {
      level: Membership["level"];
      status?: Membership["status"];
      expireAt?: string | null;
      benefits?: Membership["benefits"];
      avatarQuotaTotal?: number;
    },
  ) => request<Membership>(`/users/${id}/membership`, { method: "PUT", body: JSON.stringify(data) }),

  // Enhanced Devices (with filters)
  getFilteredCollars: (params?: Record<string, string>) => {
    const qs = params ? "?" + new URLSearchParams(params).toString() : "";
    return request<{ collars: any[] }>(`/collars${qs}`);
  },
  getFilteredDesktops: (params?: Record<string, string>) => {
    const qs = params ? "?" + new URLSearchParams(params).toString() : "";
    return request<{ desktops: any[] }>(`/desktops${qs}`);
  },
  getDevices: (params?: Record<string, string>) => {
    const qs = params ? `?${new URLSearchParams(params).toString()}` : "";
    return request<PageResponse<AdminDeviceListItem>>(`/devices${qs}`);
  },
  getDeviceDetail: (type: DeviceType, id: string) => request<AdminDeviceDetail>(`/devices/${type}/${id}/detail`),

  // Avatar Review
  getAvatarReviewStats: () => request<AvatarReviewStats>("/avatar-review/stats"),

  // Customization
  getCustomizationTasks: (params?: Record<string, string>) => {
    const qs = params ? `?${new URLSearchParams(params).toString()}` : "";
    return request<PageResponse<CustomizationTask>>(`/customization/tasks${qs}`);
  },

  // Uploads
  createUploadPresign: (
    contentType: "image/jpeg" | "image/png" | "image/webp" | "video/mjpeg" | "video/x-motion-jpeg",
  ) =>
    request<PresignResponse>("/uploads/presign", {
      method: "POST",
      body: JSON.stringify({ contentType }),
    }),
  uploadAdminMedia: (
    file: File,
    contentType: "image/jpeg" | "image/png" | "image/webp" | "video/mjpeg" | "video/x-motion-jpeg",
  ) => uploadAdminAsset("/uploads", file, contentType),

  // OTA
  getOtaFirmwareVersions: () => otaRequest<{ items: OtaFirmwareVersion[] }>("/firmware/versions"),
  uploadOtaFirmware: (data: { version: string; releaseNote?: string; firmware: File }) => {
    const formData = new FormData();
    formData.append("version", data.version);
    if (data.releaseNote) {
      formData.append("releaseNote", data.releaseNote);
    }
    formData.append("firmware", data.firmware);
    return otaRequest<{ version: string; sha256: string; size: number; uploadedAt: string; initialState: FirmwareState }>(
      "/firmware/upload",
      { method: "POST", body: formData },
    );
  },
  updateOtaFirmwareState: (id: string, state: FirmwareState, reason?: string) =>
    otaRequest<{ item: OtaFirmwareVersion }>(`/firmware/versions/${id}/state`, {
      method: "POST",
      body: JSON.stringify({ state, reason }),
    }),
  getOtaInternalDevices: () => otaRequest<{ items: OtaInternalDevice[] }>("/ota/internal-devices"),
  createOtaInternalDevice: (data: { chipId: string; note?: string }) =>
    otaRequest<{ item: OtaInternalDevice }>("/ota/internal-devices", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  deleteOtaInternalDevice: (chipId: string) =>
    otaRequest<{ chipId: string }>(`/ota/internal-devices/${encodeURIComponent(chipId)}`, { method: "DELETE" }),
  getOtaRegistry: (params?: Record<string, string>) => {
    const qs = params ? `?${new URLSearchParams(params).toString()}` : "";
    return otaRequest<{ items: OtaRegistryDevice[] }>(`/ota/registry${qs}`);
  },
  getOtaDispatchJobs: (params?: Record<string, string>) => {
    const qs = params ? `?${new URLSearchParams(params).toString()}` : "";
    return otaRequest<{ items: OtaDispatchJob[] }>(`/ota/dispatch-jobs${qs}`);
  },
  dispatchAllOta: (version: string) =>
    otaRequest<{ version: string; dispatched: number; immediate: number; throttled: number }>("/ota/dispatch-all", {
      method: "POST",
      body: JSON.stringify({ version }),
    }),
  getOtaTokens: () => otaRequest<{ items: OtaToken[] }>("/ota/tokens"),
  createOtaToken: (name: string) =>
    otaRequest<{ token: string; item: OtaToken }>("/ota/tokens", {
      method: "POST",
      body: JSON.stringify({ name }),
    }),
  revokeOtaToken: (id: string) => otaRequest<{ id: string }>(`/ota/tokens/${id}`, { method: "DELETE" }),
};
