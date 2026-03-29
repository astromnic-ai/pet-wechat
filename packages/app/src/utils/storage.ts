import Taro from "@tarojs/taro";

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
