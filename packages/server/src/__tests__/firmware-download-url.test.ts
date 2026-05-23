import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { createFirmwareDownloadUrl } from "../ota/firmware-storage";

const originalEnv = {
  APP_PUBLIC_URL: process.env.APP_PUBLIC_URL,
  ENABLE_DEV_LOGIN: process.env.ENABLE_DEV_LOGIN,
  S3_PUBLIC_URL: process.env.S3_PUBLIC_URL,
  S3_ACCESS_KEY: process.env.S3_ACCESS_KEY,
  S3_SECRET_KEY: process.env.S3_SECRET_KEY,
  FIRMWARE_URL_EXPIRES_IN: process.env.FIRMWARE_URL_EXPIRES_IN,
};

function restoreEnv() {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

describe("createFirmwareDownloadUrl", () => {
  beforeEach(() => {
    restoreEnv();
  });

  afterEach(() => {
    restoreEnv();
  });

  it("returns a presigned URL with the public /storage prefix in prod", async () => {
    process.env.S3_PUBLIC_URL = "https://pet-wechat.yangl.com.cn/storage";
    process.env.S3_ACCESS_KEY = "test-access";
    process.env.S3_SECRET_KEY = "test-secret";
    delete process.env.ENABLE_DEV_LOGIN;

    const url = await createFirmwareDownloadUrl("releases/v1.2.3.bin");

    const parsed = new URL(url);
    expect(parsed.origin).toBe("https://pet-wechat.yangl.com.cn");
    expect(parsed.pathname).toBe("/storage/firmware/releases/v1.2.3.bin");
    expect(parsed.searchParams.get("X-Amz-Algorithm")).toBe("AWS4-HMAC-SHA256");
    expect(parsed.searchParams.get("X-Amz-Signature")).toBeTruthy();
    expect(url).not.toContain("minio:9000");
  });

  it("honors FIRMWARE_URL_EXPIRES_IN", async () => {
    process.env.S3_PUBLIC_URL = "https://pet-wechat.yangl.com.cn/storage";
    process.env.S3_ACCESS_KEY = "test-access";
    process.env.S3_SECRET_KEY = "test-secret";
    process.env.FIRMWARE_URL_EXPIRES_IN = "120";
    delete process.env.ENABLE_DEV_LOGIN;

    const url = await createFirmwareDownloadUrl("releases/v1.2.3.bin");

    expect(new URL(url).searchParams.get("X-Amz-Expires")).toBe("120");
  });

  it("returns local storage path in dev login mode", async () => {
    process.env.ENABLE_DEV_LOGIN = "true";

    const url = await createFirmwareDownloadUrl("releases/v1.2.3.bin");

    expect(url).toContain("/storage/firmware/releases/v1.2.3.bin");
  });
});
