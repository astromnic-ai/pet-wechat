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

export interface PetModeScheduleInput {
  startTime: string;
  endTime: string;
  actionType: string;
}

export type CustomActionStatus = "pending" | "processing" | "done" | "failed";
export type InteractionType = "touch" | "shake" | "gesture";

export interface PetModeSchedule extends PetModeScheduleInput {
  id: string;
  petId: string;
  source: "system" | "custom";
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

export interface UpdateCustomActionInput {
  status: CustomActionStatus;
  resultImageUrl?: string;
}

export interface AutoInteractionsInput {
  petId: string;
  desktopDeviceId: string;
  count?: number;
  intervalMinutes?: number;
}

export async function fetchPetModeSchedules(petId: string): Promise<{ schedules: PetModeSchedule[] }> {
  return request<{ schedules: PetModeSchedule[] }>(`/pets/${petId}/mode/schedules`);
}

export async function updatePetModeSchedules(
  petId: string,
  schedules: PetModeScheduleInput[],
): Promise<{ schedules: PetModeSchedule[] }> {
  return request<{ schedules: PetModeSchedule[] }>(`/pets/${petId}/mode/schedules`, {
    method: "PUT",
    body: JSON.stringify({ schedules }),
  });
}

export async function batchUpdateSchedules(
  petIds: string[],
  schedules: PetModeScheduleInput[],
): Promise<{ updatedCount: number }> {
  return request<{ updatedCount: number }>("/pets/batch-schedules", {
    method: "POST",
    body: JSON.stringify({ petIds, schedules }),
  });
}

export async function fetchCustomActions(
  status?: CustomActionStatus,
): Promise<{ customActions: CustomAction[] }> {
  const query = status ? `?status=${status}` : "";
  return request<{ customActions: CustomAction[] }>(`/custom-actions${query}`);
}

export async function updateCustomAction(
  id: string,
  data: UpdateCustomActionInput,
): Promise<{ customAction: CustomAction }> {
  return request<{ customAction: CustomAction }>(`/custom-actions/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function fetchInteractions(limit?: number): Promise<{ interactions: DeviceInteraction[] }> {
  return request<{ interactions: DeviceInteraction[] }>(`/interactions?limit=${limit ?? 50}`);
}

export async function autoGenerateInteractions(
  data: AutoInteractionsInput,
): Promise<{ interactions: DeviceInteraction[]; count: number }> {
  return request<{ interactions: DeviceInteraction[]; count: number }>("/interactions/auto", {
    method: "POST",
    body: JSON.stringify(data),
  });
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
  getCustomActions: (status?: CustomActionStatus) => fetchCustomActions(status),
  updateCustomAction,
  getInteractions: (limit?: number) => fetchInteractions(limit),
  autoGenerateInteractions,
  fetchPetModeSchedules,
  updatePetModeSchedules,
  batchUpdateSchedules,
};
