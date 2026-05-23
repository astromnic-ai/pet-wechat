import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { createFirmwareDownloadUrl } from "../ota/firmware-storage";

const originalEnv = {
  APP_PUBLIC_URL: process.env.APP_PUBLIC_URL,
  ENABLE_DEV_LOGIN: process.env.ENABLE_DEV_LOGIN,
  S3_PUBLIC_URL: process.env.S3_PUBLIC_URL,
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

  it("returns a public S3 URL in prod", async () => {
    process.env.S3_PUBLIC_URL = "https://pet-wechat.yangl.com.cn/storage";
    delete process.env.ENABLE_DEV_LOGIN;

    const url = await createFirmwareDownloadUrl("releases/v1.2.3.bin");

    expect(url).toStartWith("https://pet-wechat.yangl.com.cn/storage/firmware/");
    expect(url).not.toContain("minio:9000");
  });

  it("returns local storage path in dev login mode", async () => {
    process.env.ENABLE_DEV_LOGIN = "true";

    const url = await createFirmwareDownloadUrl("releases/v1.2.3.bin");

    expect(url).toContain("/storage/firmware/releases/v1.2.3.bin");
  });
});
