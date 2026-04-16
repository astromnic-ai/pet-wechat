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
  rejectAvatar: (id: string, reason: string) => request<{ avatar: any }>(`/avatars/${id}/reject`, { method: "PUT", body: JSON.stringify({ reason }) }),
  getAvatarActions: (id: string) => request<{ actions: any[] }>(`/avatars/${id}/actions`),
  createAvatarAction: (id: string, data: { actionType: string; imageUrl: string }) =>
    request<{ action: any }>(`/avatars/${id}/actions`, { method: "POST", body: JSON.stringify(data) }),
  deleteAvatarAction: (id: string, actionId: string) => request(`/avatars/${id}/actions/${actionId}`, { method: "DELETE" }),
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

  // Enhanced Devices (with filters)
  getFilteredCollars: (params?: Record<string, string>) => {
    const qs = params ? "?" + new URLSearchParams(params).toString() : "";
    return request<{ collars: any[] }>(`/collars${qs}`);
  },
  getFilteredDesktops: (params?: Record<string, string>) => {
    const qs = params ? "?" + new URLSearchParams(params).toString() : "";
    return request<{ desktops: any[] }>(`/desktops${qs}`);
  },
};
