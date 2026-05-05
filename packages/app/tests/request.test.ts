import { beforeEach, describe, expect, it, mock } from "bun:test";

const taroState = {
  storage: {} as Record<string, string>,
  redirectedTo: "",
  uploadResponse: {
    statusCode: 200,
    data: JSON.stringify({ url: "https://example.com/file.jpg" }),
    errMsg: "uploadFile:ok",
  },
};

mock.module("@tarojs/taro", () => ({
  default: {
    getStorageSync(key: string) {
      return taroState.storage[key] ?? "";
    },
    setStorageSync(key: string, value: string) {
      taroState.storage[key] = value;
    },
    removeStorageSync(key: string) {
      delete taroState.storage[key];
    },
    reLaunch({ url }: { url: string }) {
      taroState.redirectedTo = url;
      return Promise.resolve();
    },
    uploadFile() {
      return Promise.resolve(taroState.uploadResponse);
    },
  },
}));

(globalThis as { API_BASE_URL?: string }).API_BASE_URL = "https://api.example.com";

const { uploadFile, setToken } = await import("../src/utils/request");

describe("uploadFile", () => {
  beforeEach(() => {
    taroState.storage = {};
    taroState.redirectedTo = "";
    taroState.uploadResponse = {
      statusCode: 200,
      data: JSON.stringify({ url: "https://example.com/file.jpg" }),
      errMsg: "uploadFile:ok",
    };
  });

  it("throws when a 2xx upload response is not valid JSON", async () => {
    setToken("test-token");
    taroState.uploadResponse = {
      statusCode: 200,
      data: "<html>bad gateway</html>",
      errMsg: "uploadFile:ok",
    };

    await expect(
      uploadFile({
        url: "/api/upload",
        filePath: "/tmp/photo.jpg",
        name: "file",
      }),
    ).rejects.toThrow("上传服务响应异常，请稍后重试");
  });

  it("clears token and redirects on 401 responses", async () => {
    setToken("expired-token");
    taroState.uploadResponse = {
      statusCode: 401,
      data: JSON.stringify({ error: "Unauthorized" }),
      errMsg: "uploadFile:fail unauthorized",
    };

    await expect(
      uploadFile({
        url: "/api/upload",
        filePath: "/tmp/photo.jpg",
        name: "file",
      }),
    ).rejects.toThrow("登录已过期，请重新登录");

    expect(taroState.storage.token).toBeUndefined();
    expect(taroState.redirectedTo).toBe("/pages/login/index");
  });
});
