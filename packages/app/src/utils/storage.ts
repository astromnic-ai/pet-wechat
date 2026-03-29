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
  return !Taro.getStorageSync(`hasCompletedGuide_${userId}`) && !Taro.getStorageSync("hasCompletedGuide");
}

export function markGuideCompleted() {
  const userId = Taro.getStorageSync("userId");
  if (userId) Taro.setStorageSync(`hasCompletedGuide_${userId}`, "1");
}
