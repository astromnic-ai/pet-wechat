import { createId } from "./id";
import { uploadFile } from "./storage";

type UploadRule = {
  ext: string;
  maxSize: number;
  label: "image" | "video";
};

const FILE_RULES: Record<string, UploadRule> = {
  "image/jpeg": { ext: "jpg", maxSize: 10 * 1024 * 1024, label: "image" },
  "image/png": { ext: "png", maxSize: 10 * 1024 * 1024, label: "image" },
  "image/webp": { ext: "webp", maxSize: 10 * 1024 * 1024, label: "image" },
  "image/gif": { ext: "gif", maxSize: 10 * 1024 * 1024, label: "image" },
  "video/mp4": { ext: "mp4", maxSize: 50 * 1024 * 1024, label: "video" },
  "video/quicktime": { ext: "mov", maxSize: 50 * 1024 * 1024, label: "video" },
};

export class UploadError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "UploadError";
    this.status = status;
  }
}

export function parseUploadFile(file: unknown) {
  if (!file || typeof file === "string" || Array.isArray(file)) {
    throw new UploadError("未检测到上传文件", 400);
  }

  return file as File;
}

export async function saveUploadedFile(ownerSegment: string, uploadedFile: File) {
  const fileRule = FILE_RULES[uploadedFile.type];

  if (!fileRule) {
    throw new UploadError(
      "不支持的文件格式，请上传 JPG/PNG/WEBP/GIF 图片或 MP4/MOV 视频",
      400,
    );
  }

  if (uploadedFile.size > fileRule.maxSize) {
    throw new UploadError(
      fileRule.label === "video"
        ? "文件过大，请上传 50MB 以内的视频"
        : "文件过大，请上传 10MB 以内的图片",
      400,
    );
  }

  const fileId = createId();
  const key = `${ownerSegment}/${fileId}.${fileRule.ext}`;
  const buffer = Buffer.from(await uploadedFile.arrayBuffer());

  try {
    const url = await uploadFile(key, buffer, uploadedFile.type);
    return { url, fileId };
  } catch (error) {
    const message =
      error instanceof Error && error.message.includes("bucket")
        ? "存储服务不可用，请稍后重试"
        : "文件上传失败，请稍后重试";
    throw new UploadError(message, 503);
  }
}
