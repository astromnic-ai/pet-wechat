import { describe, it, expect, beforeEach } from "bun:test";
import { mockDb } from "./setup";
import { createApp, authHeader } from "./helpers";

const app = createApp();

describe("Upload Routes", () => {
  beforeEach(() => {
    mockDb._reset();
  });

  describe("POST /api/upload", () => {
    it("returns 401 without token", async () => {
      const res = await app.request(
        new Request("http://localhost/api/upload", { method: "POST" })
      );
      expect(res.status).toBe(401);
    });

    it("returns 400 when no file is provided", async () => {
      const headers = await authHeader("user-1");
      const formData = new FormData();

      const res = await app.request(
        new Request("http://localhost/api/upload", {
          method: "POST",
          headers,
          body: formData,
        })
      );
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain("未检测到上传文件");
    });

    it("returns 400 when file field is a string", async () => {
      const headers = await authHeader("user-1");
      const formData = new FormData();
      formData.append("file", "not-a-file");

      const res = await app.request(
        new Request("http://localhost/api/upload", {
          method: "POST",
          headers,
          body: formData,
        })
      );
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain("未检测到上传文件");
    });

    it("returns uploaded file URL when file is uploaded", async () => {
      const headers = await authHeader("user-1");
      const formData = new FormData();
      const file = new File(["test content"], "photo.jpg", {
        type: "image/jpeg",
      });
      formData.append("file", file);

      const res = await app.request(
        new Request("http://localhost/api/upload", {
          method: "POST",
          headers,
          body: formData,
        })
      );
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.url).toContain("test-storage.local");
      expect(json.url).toContain("user-1");
      expect(json.url).toEndWith(".jpg");
      expect(json.fileId).toBeDefined();
    });

    it("uploads mp4 video up to the 50MB limit", async () => {
      const headers = await authHeader("user-1");
      const formData = new FormData();
      const file = new File([new Uint8Array(11 * 1024 * 1024)], "clip.mp4", {
        type: "video/mp4",
      });
      formData.append("file", file);

      const res = await app.request(
        new Request("http://localhost/api/upload", {
          method: "POST",
          headers,
          body: formData,
        })
      );
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.url).toContain("test-storage.local");
      expect(json.url).toEndWith(".mp4");
    });

    it("uploads quicktime video", async () => {
      const headers = await authHeader("user-1");
      const formData = new FormData();
      const file = new File(["quicktime"], "clip.mov", {
        type: "video/quicktime",
      });
      formData.append("file", file);

      const res = await app.request(
        new Request("http://localhost/api/upload", {
          method: "POST",
          headers,
          body: formData,
        })
      );
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.url).toEndWith(".mov");
    });
  });
});
