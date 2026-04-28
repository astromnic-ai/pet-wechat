import { Hono } from "hono";
import { createId } from "../../utils/id";
import { uploadFile } from "../../utils/storage";

const adminUploadRoute = new Hono();

const ALLOWED_MJPEG_TYPES = new Set([
  "video/mjpeg",
  "video/x-motion-jpeg",
  "application/octet-stream",
  "",
]);
const ALLOWED_MJPEG_EXTENSIONS = new Set(["mjpeg", "mjpg"]);
const MAX_FILE_SIZE = 50 * 1024 * 1024;

function getFileExtension(filename?: string | null) {
  const normalized = filename?.trim().toLowerCase() ?? "";
  const segments = normalized.split(".");
  return segments.length > 1 ? segments[segments.length - 1] ?? "" : "";
}

function isAllowedMjpegFile(file: File) {
  const ext = getFileExtension(file.name);
  return ALLOWED_MJPEG_EXTENSIONS.has(ext) && ALLOWED_MJPEG_TYPES.has(file.type);
}

function resolveMjpegContentType(file: File) {
  if (file.type === "video/mjpeg" || file.type === "video/x-motion-jpeg") {
    return file.type;
  }

  return "video/x-motion-jpeg";
}

adminUploadRoute.post("/upload", async (c) => {
  try {
    const body = await c.req.parseBody();
    const file = body["file"];

    if (!file || typeof file === "string" || Array.isArray(file)) {
      return c.json({ error: "未检测到上传文件" }, 400);
    }

    const uploadedFile = file as File;

    if (!isAllowedMjpegFile(uploadedFile)) {
      return c.json({ error: "仅支持上传 MJPEG 视频文件（.mjpeg / .mjpg）" }, 400);
    }

    if (uploadedFile.size > MAX_FILE_SIZE) {
      return c.json({ error: "文件过大，请上传 50MB 以内的 MJPEG 视频" }, 400);
    }

    const fileId = createId();
    const ext = getFileExtension(uploadedFile.name) || "mjpeg";
    const key = `admin/customization/${fileId}.${ext}`;
    const buffer = Buffer.from(await uploadedFile.arrayBuffer());
    const contentType = resolveMjpegContentType(uploadedFile);

    let url: string;
    try {
      url = await uploadFile(key, buffer, contentType);
    } catch (error) {
      console.error("Admin storage upload failed:", error);
      const msg = error instanceof Error && error.message.includes("bucket")
        ? "存储服务不可用，请稍后重试"
        : "文件上传失败，请稍后重试";
      return c.json({ error: msg }, 503);
    }

    return c.json({ url, fileId }, 201);
  } catch (error) {
    console.error("Admin upload failed:", error);
    return c.json({ error: "文件上传失败，请稍后重试" }, 503);
  }
});

export default adminUploadRoute;
