import Taro from "@tarojs/taro";

declare const API_BASE_URL: string;

export const BASE_URL =
  typeof API_BASE_URL === "string"
    ? API_BASE_URL
    : ((globalThis as { API_BASE_URL?: string }).API_BASE_URL ?? "");

export function getToken(): string | null {
  return Taro.getStorageSync("token") || null;
}

export function setToken(token: string) {
  Taro.setStorageSync("token", token);
}

export function clearToken() {
  Taro.removeStorageSync("token");
}

export interface RequestOptions {
  url: string;
  method?: "GET" | "POST" | "PUT" | "DELETE";
  data?: any;
  needAuth?: boolean;
}

export interface UploadFileOptions {
  url: string;
  filePath: string;
  name: string;
  formData?: Record<string, any>;
  needAuth?: boolean;
}

function resolveUrl(url: string): string {
  if (/^https?:\/\//.test(url)) {
    return url;
  }

  return `${BASE_URL}${url}`;
}

function parseJsonLikeResponse(data: unknown) {
  if (typeof data === "string") {
    try {
      return JSON.parse(data) as Record<string, any>;
    } catch {
      return null;
    }
  }

  if (data && typeof data === "object") {
    return data as Record<string, any>;
  }

  return null;
}

export async function request<T = any>(options: RequestOptions): Promise<T> {
  const { url, method = "GET", data, needAuth = true } = options;

  const header: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (needAuth) {
    const token = getToken();
    if (token) {
      header["Authorization"] = `Bearer ${token}`;
    }
  }

  let res: Taro.request.SuccessCallbackResult;
  try {
    res = await Taro.request({
      url: resolveUrl(url),
      method,
      data,
      header,
    });
  } catch (err: any) {
    throw new Error(`网络异常: ${err.errMsg ?? "无法连接服务器"}`);
  }

  if (res.statusCode === 401 && needAuth) {
    clearToken();
    Taro.reLaunch({ url: "/pages/login/index" });
    throw new Error("登录已过期，请重新登录");
  }

  if (res.statusCode >= 400) {
    const msg = res.data?.error ?? `服务器错误 (${res.statusCode})`;
    throw new Error(msg);
  }

  return res.data as T;
}

export async function uploadFile<T = any>(options: UploadFileOptions): Promise<T> {
  const { url, filePath, name, formData, needAuth = true } = options;

  const header: Record<string, string> = {};

  if (needAuth) {
    const token = getToken();
    if (token) {
      header["Authorization"] = `Bearer ${token}`;
    }
  }

  let res: Taro.uploadFile.SuccessCallbackResult;
  try {
    res = await Taro.uploadFile({
      url: resolveUrl(url),
      filePath,
      name,
      formData,
      header,
    });
  } catch (err: any) {
    throw new Error(`网络异常: ${err.errMsg ?? "无法连接服务器"}`);
  }

  const parsedData = parseJsonLikeResponse(res.data);

  if (res.statusCode === 401 && needAuth) {
    clearToken();
    Taro.reLaunch({ url: "/pages/login/index" });
    throw new Error("登录已过期，请重新登录");
  }

  if (res.statusCode >= 400) {
    const msg = parsedData?.error ?? `服务器错误 (${res.statusCode})`;
    throw new Error(msg);
  }

  if (!parsedData) {
    throw new Error("上传服务响应异常，请稍后重试");
  }

  return parsedData as T;
}
