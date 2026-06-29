import type { DeviceStatus } from "@pet-wechat/shared";

export function getDeviceStatusText(status: DeviceStatus) {
  if (status === "online") return "在线";
  if (status === "pairing") return "连接中";
  return "离线";
}

export function getDeviceDisplayName(options: {
  petName?: string | null;
  deviceName?: string | null;
  fallbackName?: string;
}) {
  const petName = options.petName?.trim() || "";
  const rawName = options.deviceName?.trim() || options.fallbackName?.trim() || "未命名设备";

  if (!petName) return rawName;
  if (rawName.startsWith(`${petName}的`)) return rawName;
  if (rawName.startsWith("我的") && rawName.length > 2) {
    return `${petName}的${rawName.slice(2)}`;
  }

  return `${petName}的${rawName}`;
}

export function formatUsageDuration(value?: number | string | null) {
  if (typeof value === "number") {
    const totalMinutes = Math.max(Math.floor(value), 0);
    if (totalMinutes < 1) return "不足1分钟";
    if (totalMinutes < 60) return `${totalMinutes}分钟`;

    const totalHours = Math.floor(totalMinutes / 60);
    if (totalHours < 24) return `${totalHours}小时`;

    const totalDays = Math.floor(totalHours / 24);
    if (totalDays < 30) return `${totalDays}天`;

    const totalMonths = Math.floor(totalDays / 30);
    if (totalMonths < 12) return `${totalMonths}个月`;

    const years = Math.floor(totalMonths / 12);
    const months = totalMonths % 12;
    if (months === 0) return `${years}年`;
    return `${years}年${months}个月`;
  }

  if (!value) return "时长未知";

  const start = new Date(value);
  if (Number.isNaN(start.getTime())) return "时长未知";

  const diffMs = Math.max(Date.now() - start.getTime(), 0);
  return formatUsageDuration(Math.floor(diffMs / (1000 * 60)));
}

export function getUsageLabel(value?: number | string | null) {
  return `累计使用${formatUsageDuration(value)}`;
}

export function getLastOnlineLabel(value?: string | null) {
  if (!value) return "暂无在线记录";

  const lastOnline = new Date(value);
  if (Number.isNaN(lastOnline.getTime())) return "暂无在线记录";

  const diffMinutes = Math.max(Math.floor((Date.now() - lastOnline.getTime()) / (1000 * 60)), 0);
  if (diffMinutes < 1) return "上次在线刚刚";
  if (diffMinutes < 60) return `上次在线${diffMinutes}分钟前`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `上次在线${diffHours}小时前`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `上次在线${diffDays}天前`;

  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths < 12) return `上次在线${diffMonths}个月前`;

  return `上次在线${Math.floor(diffMonths / 12)}年前`;
}
