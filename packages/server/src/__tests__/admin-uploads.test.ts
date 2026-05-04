import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { Hono } from "hono";
import uploadsRoute from "../routes/admin/uploads";
import { jsonReq } from "./helpers";

const app = new Hono();
app.route("/api/admin", uploadsRoute);

describe("Admin Upload Routes", () => {
  const originalEnableDevLogin = process.env.ENABLE_DEV_LOGIN;

  beforeEach(() => {
    process.env.ENABLE_DEV_LOGIN = "true";
  });

  afterEach(() => {
    if (originalEnableDevLogin === undefined) {
      delete process.env.ENABLE_DEV_LOGIN;
      return;
    }

    process.env.ENABLE_DEV_LOGIN = originalEnableDevLogin;
  });

  it("returns a local dev upload target in dev mode", async () => {
    const res = await app.request(
      jsonReq("POST", "/api/admin/uploads/presign", {
        body: { contentType: "image/png" },
      }),
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.uploadUrl).toContain("/storage/uploads/admin/");
    expect(json.publicUrl).toContain("/storage/uploads/admin/");
    expect(json.key).toContain("uploads/admin/");
  });

  it("rejects unsupported content types", async () => {
    const res = await app.request(
      jsonReq("POST", "/api/admin/uploads/presign", {
        body: { contentType: "image/gif" },
      }),
    );

    expect(res.status).toBe(400);
  });

  it("uploads mjpeg media through the admin uploads endpoint", async () => {
    const formData = new FormData();
    formData.append("contentType", "video/x-motion-jpeg");
    formData.append(
      "file",
      new File([new Uint8Array([1, 2, 3])], "base-sit-6.mjpeg", { type: "video/x-motion-jpeg" }),
    );

    const res = await app.request(
      new Request("http://localhost/api/admin/uploads", {
        method: "POST",
        body: formData,
      }),
    );

    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.url).toContain(".mjpeg");
    expect(json.url).toContain("uploads/admin/");
  });
});
