import Taro from "@tarojs/taro";
import type {
  UserSettings,
  UserSettingLanguage,
  UserSettingTheme,
} from "@pet-wechat/shared";
import { request } from "./request";

const STORAGE_KEY = "settings:server-cache";

export const DEFAULT_USER_SETTINGS: UserSettings = {
  messageEnabled: true,
  soundEnabled: true,
  theme: "light",
  language: "zh-CN",
};

export const THEME_OPTIONS: Array<{
  key: UserSettingTheme;
  label: string;
  color: string;
}> = [
  { key: "light", label: "浅色模式", color: "#fff3cf" },
  { key: "dark", label: "深色模式", color: "#2f2f33" },
  { key: "blue", label: "蓝色模式", color: "#a9adb3" },
];

export const LANGUAGE_OPTIONS: Array<{
  key: UserSettingLanguage;
  label: string;
}> = [
  { key: "zh-CN", label: "简体中文" },
  { key: "zh-TW", label: "繁體中文" },
  { key: "en-US", label: "English" },
];

function mergeWithDefaults(input?: Partial<UserSettings> | null): UserSettings {
  return {
    ...DEFAULT_USER_SETTINGS,
    ...(input || {}),
  };
}

export function readCachedUserSettings(): UserSettings {
  const cached = Taro.getStorageSync(STORAGE_KEY);
  if (!cached || typeof cached !== "object") {
    return DEFAULT_USER_SETTINGS;
  }

  const merged = mergeWithDefaults(cached as Partial<UserSettings>);
  return {
    ...merged,
    theme: merged.theme === "system" ? "light" : merged.theme,
  };
}

export function writeCachedUserSettings(settings: Partial<UserSettings>) {
  const nextSettings = mergeWithDefaults({
    ...readCachedUserSettings(),
    ...settings,
  });
  Taro.setStorageSync(STORAGE_KEY, nextSettings);
  return nextSettings;
}

export async function fetchUserSettings() {
  try {
    const res = await request<{ settings: UserSettings }>({ url: "/api/settings" });
    const settings = writeCachedUserSettings(res.settings);
    return { settings, persisted: true };
  } catch {
    return { settings: readCachedUserSettings(), persisted: false };
  }
}

export async function saveUserSettings(settings: Partial<UserSettings>) {
  const localSettings = writeCachedUserSettings(settings);

  try {
    const res = await request<{ settings: UserSettings }>({
      url: "/api/settings",
      method: "PUT",
      data: settings,
    });
    const savedSettings = writeCachedUserSettings(res.settings);
    return { settings: savedSettings, persisted: true };
  } catch {
    return { settings: localSettings, persisted: false };
  }
}

export function getThemeLabel(theme: UserSettingTheme) {
  return THEME_OPTIONS.find((item) => item.key === theme)?.label ?? "浅色模式";
}

export function getLanguageLabel(language: UserSettingLanguage) {
  return LANGUAGE_OPTIONS.find((item) => item.key === language)?.label ?? "简体中文";
}
