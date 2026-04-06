import { Hono } from "hono";
import { createId } from "../utils/id";
import { uploadFile } from "../utils/storage";

const uploadRoute = new Hono();

const FILE_RULES: Record<
  string,
  { ext: string; maxSize: number; label: "image" | "video" }
> = {
  "image/jpeg": { ext: "jpg", maxSize: 10 * 1024 * 1024, label: "image" },
  "image/png": { ext: "png", maxSize: 10 * 1024 * 1024, label: "image" },
  "image/webp": { ext: "webp", maxSize: 10 * 1024 * 1024, label: "image" },
  "video/mp4": { ext: "mp4", maxSize: 50 * 1024 * 1024, label: "video" },
  "video/quicktime": { ext: "mov", maxSize: 50 * 1024 * 1024, label: "video" },
};

uploadRoute.post("/", async (c) => {
  try {
    const userId = c.get("userId" as never) as string;
    const body = await c.req.parseBody();
    const file = body["file"];

    if (!file || typeof file === "string" || Array.isArray(file)) {
      return c.json({ error: "未检测到上传文件" }, 400);
    }

    const uploadedFile = file as File;
    const fileRule = FILE_RULES[uploadedFile.type];

    if (!fileRule) {
      return c.json(
        { error: "不支持的文件格式，请上传 JPG/PNG/WEBP 图片或 MP4/MOV 视频" },
        400,
      );
    }

    if (uploadedFile.size > fileRule.maxSize) {
      return c.json(
        {
          error:
            fileRule.label === "video"
              ? "文件过大，请上传 50MB 以内的视频"
              : "文件过大，请上传 10MB 以内的图片",
        },
        400,
      );
    }

    const fileId = createId();
    const key = `${userId}/${fileId}.${fileRule.ext}`;
    const buffer = Buffer.from(await uploadedFile.arrayBuffer());

    let url: string;
    try {
      url = await uploadFile(key, buffer, uploadedFile.type);
    } catch (e) {
      console.error("Storage upload failed:", e);
      const msg = e instanceof Error && e.message.includes("bucket")
        ? "存储服务不可用，请稍后重试"
        : "文件上传失败，请稍后重试";
      return c.json({ error: msg }, 503);
    }

    return c.json({ url, fileId }, 201);
  } catch (e) {
    console.error("Upload failed:", e);
    return c.json({ error: "文件上传失败，请稍后重试" }, 503);
  }
});

export default uploadRoute;
