import { Hono } from "hono";
import { createId } from "../../utils/id";
import { extractFirstJpegFrame } from "../../utils/mjpeg";
import { uploadFile } from "../../utils/storage";

const adminUploadRoute = new Hono();

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "video/mjpeg", "video/x-motion-jpeg"]);
const MAX_FILE_SIZE = 50 * 1024 * 1024;

adminUploadRoute.post("/upload", async (c) => {
  try {
    const body = await c.req.parseBody();
    const file = body["file"];

    if (!file || typeof file === "string" || Array.isArray(file)) {
      return c.json({ error: "未检测到上传文件" }, 400);
    }

    const uploadedFile = file as File;

    if (!ALLOWED_TYPES.has(uploadedFile.type)) {
      return c.json({ error: "不支持的文件格式，请上传 JPG/PNG/WEBP/MJPEG 文件" }, 400);
    }

    if (uploadedFile.size > MAX_FILE_SIZE) {
      return c.json({ error: "文件过大，请上传 50MB 以内的素材" }, 400);
    }

    const fileId = createId();
    const ext =
      uploadedFile.type === "image/png"
        ? "png"
        : uploadedFile.type === "image/webp"
          ? "webp"
          : uploadedFile.type === "video/mjpeg" || uploadedFile.type === "video/x-motion-jpeg"
            ? "mjpeg"
            : "jpg";
    const key = `admin/customization/${fileId}.${ext}`;
    const buffer = Buffer.from(await uploadedFile.arrayBuffer());
    const isMjpeg = uploadedFile.type === "video/mjpeg" || uploadedFile.type === "video/x-motion-jpeg";
    const thumbnailBuffer = isMjpeg ? extractFirstJpegFrame(buffer) : null;

    if (isMjpeg && !thumbnailBuffer) {
      return c.json({ error: "无法从 MJPEG 文件中提取首帧" }, 400);
    }

    let url: string;
    let thumbnailUrl: string | null = null;
    try {
      url = await uploadFile(key, buffer, uploadedFile.type);

      if (thumbnailBuffer) {
        thumbnailUrl = await uploadFile(
          key.replace(/\.[^.]+$/, "-thumb.jpg"),
          thumbnailBuffer,
          "image/jpeg",
        );
      }
    } catch (error) {
      console.error("Admin storage upload failed:", error);
      const msg = error instanceof Error && error.message.includes("bucket")
        ? "存储服务不可用，请稍后重试"
        : "文件上传失败，请稍后重试";
      return c.json({ error: msg }, 503);
    }

    return c.json({ url, thumbnailUrl, fileId }, 201);
  } catch (error) {
    console.error("Admin upload failed:", error);
    return c.json({ error: "文件上传失败，请稍后重试" }, 503);
  }
});

export default adminUploadRoute;
