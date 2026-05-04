import { Hono } from "hono";
import { createId } from "../../utils/id";
import { ALLOWED_IMAGE_CONTENT_TYPES, createPresignedPutUrl, uploadFile } from "../../utils/storage";

const uploadsRoute = new Hono();
const MAX_FILE_SIZE = 50 * 1024 * 1024;

type AllowedContentType = keyof typeof ALLOWED_IMAGE_CONTENT_TYPES;

function isAllowedContentType(value: unknown): value is AllowedContentType {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(ALLOWED_IMAGE_CONTENT_TYPES, value)
  );
}

function isAllowedAdminUploadType(fileType: string, fallbackContentType?: AllowedContentType) {
  if (isAllowedContentType(fileType)) {
    return fileType;
  }

  return fallbackContentType;
}

uploadsRoute.post("/uploads/presign", async (c) => {
  const body = await c.req.json<{ contentType?: unknown }>();

  if (!isAllowedContentType(body.contentType)) {
    return c.json({ error: "Unsupported contentType" }, 400);
  }

  const presign = await createPresignedPutUrl({
    contentType: body.contentType,
    scope: "admin",
  });

  return c.json(presign);
});

uploadsRoute.post("/uploads", async (c) => {
  try {
    const body = await c.req.parseBody();
    const file = body.file;
    const fallbackContentType = isAllowedContentType(body.contentType) ? body.contentType : undefined;

    if (!file || typeof file === "string" || Array.isArray(file)) {
      return c.json({ error: "未检测到上传文件" }, 400);
    }

    const uploadedFile = file as File;
    const resolvedContentType = isAllowedAdminUploadType(uploadedFile.type, fallbackContentType);

    if (!resolvedContentType) {
      return c.json({ error: "不支持的文件格式，请上传 JPG/PNG/WEBP/MJPEG 文件" }, 400);
    }

    if (uploadedFile.size > MAX_FILE_SIZE) {
      return c.json({ error: "文件过大，请上传 50MB 以内的素材" }, 400);
    }

    const fileId = createId();
    const ext = ALLOWED_IMAGE_CONTENT_TYPES[resolvedContentType];
    const key = `uploads/admin/${new Date().getUTCFullYear()}/${String(new Date().getUTCMonth() + 1).padStart(2, "0")}/${fileId}.${ext}`;
    const buffer = Buffer.from(await uploadedFile.arrayBuffer());

    try {
      const url = await uploadFile(key, buffer, resolvedContentType);
      return c.json({ url, fileId }, 201);
    } catch (error) {
      console.error("Admin media upload failed:", error);
      const msg = error instanceof Error && error.message.includes("bucket")
        ? "存储服务不可用，请稍后重试"
        : "文件上传失败，请稍后重试";
      return c.json({ error: msg }, 503);
    }
  } catch (error) {
    console.error("Admin uploads route failed:", error);
    return c.json({ error: "文件上传失败，请稍后重试" }, 503);
  }
});

export default uploadsRoute;
