import { Hono } from "hono";
import { createId } from "../utils/id";
import { uploadFile } from "../utils/storage";
import { rewriteLocalAssetUrl } from "../utils/publicUrl";

const uploadRoute = new Hono();

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_FILE_SIZE = 10 * 1024 * 1024;

uploadRoute.post("/", async (c) => {
  try {
    const userId = c.get("userId" as never) as string;
    const body = await c.req.parseBody();
    const file = body["file"];

    if (!file || typeof file === "string" || Array.isArray(file)) {
      return c.json({ error: "未检测到上传文件" }, 400);
    }

    const uploadedFile = file as File;

    if (!ALLOWED_TYPES.has(uploadedFile.type)) {
      return c.json({ error: "不支持的文件格式，请上传 JPG/PNG/WEBP 图片" }, 400);
    }

    if (uploadedFile.size > MAX_FILE_SIZE) {
      return c.json({ error: "文件过大，请上传 10MB 以内的图片" }, 400);
    }

    const fileId = createId();
    const ext =
      uploadedFile.type === "image/png"
        ? "png"
        : uploadedFile.type === "image/webp"
          ? "webp"
          : "jpg";
    const key = `${userId}/${fileId}.${ext}`;
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

    return c.json({ url: rewriteLocalAssetUrl(url, c.req.url), fileId }, 201);
  } catch (e) {
    console.error("Upload failed:", e);
    return c.json({ error: "文件上传失败，请稍后重试" }, 503);
  }
});

export default uploadRoute;
