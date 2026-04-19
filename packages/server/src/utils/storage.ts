import {
  S3Client,
  PutObjectCommand,
  HeadBucketCommand,
  CreateBucketCommand,
} from "@aws-sdk/client-s3";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { PresignResponse } from "shared";
import { Hash } from "@smithy/hash-node";
import { HttpRequest } from "@smithy/protocol-http";
import { SignatureV4 } from "@smithy/signature-v4";
import { createId } from "./id";

const s3 = new S3Client({
  endpoint: process.env.S3_ENDPOINT ?? "http://localhost:9000",
  region: "us-east-1",
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY ?? "minioadmin",
    secretAccessKey: process.env.S3_SECRET_KEY ?? "minioadmin",
  },
  forcePathStyle: true,
});

export const BUCKET = process.env.S3_BUCKET ?? "pet-uploads";
const LOCAL_STORAGE_ROOT = path.resolve(process.cwd(), "storage");
let ensureBucketPromise: Promise<void> | null = null;
export const ALLOWED_IMAGE_CONTENT_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;

function getLocalStorageBaseUrl(): string {
  return process.env.APP_PUBLIC_URL ?? `http://localhost:${process.env.PORT ?? 9527}`;
}

function normalizeLocalStorageKey(key: string): string {
  return key.replace(/^\/+/, "");
}

function resolveLocalStoragePath(key: string): string {
  const normalizedKey = normalizeLocalStorageKey(key);
  const targetPath = path.resolve(LOCAL_STORAGE_ROOT, normalizedKey);

  if (targetPath !== LOCAL_STORAGE_ROOT && !targetPath.startsWith(`${LOCAL_STORAGE_ROOT}${path.sep}`)) {
    throw new Error("INVALID_STORAGE_KEY");
  }

  return targetPath;
}

async function writeLocalStorageFile(key: string, body: Buffer | Uint8Array): Promise<string> {
  const normalizedKey = normalizeLocalStorageKey(key);
  const targetPath = resolveLocalStoragePath(normalizedKey);
  await mkdir(path.dirname(targetPath), { recursive: true });
  await writeFile(targetPath, body);
  return `${getLocalStorageBaseUrl()}/storage/${normalizedKey}`;
}

function buildStorageKey(contentType: keyof typeof ALLOWED_IMAGE_CONTENT_TYPES, scope = "admin", date = new Date()): string {
  const ext = ALLOWED_IMAGE_CONTENT_TYPES[contentType];
  return `uploads/${scope}/${date.getUTCFullYear()}/${String(date.getUTCMonth() + 1).padStart(2, "0")}/${createId()}.${ext}`;
}

function createLocalDevPresignedPutUrl(opts: {
  contentType: keyof typeof ALLOWED_IMAGE_CONTENT_TYPES;
  scope?: string;
}): PresignResponse {
  const signingDate = new Date();
  const expiresIn = 900;
  const key = buildStorageKey(opts.contentType, opts.scope ?? "admin", signingDate);
  const publicUrl = `${getLocalStorageBaseUrl()}/storage/${key}`;

  return {
    uploadUrl: publicUrl,
    publicUrl,
    key,
    expiresAt: new Date(signingDate.getTime() + expiresIn * 1000).toISOString(),
  };
}

export async function saveLocalDevUpload(
  key: string,
  body: Buffer | Uint8Array,
): Promise<string> {
  return await writeLocalStorageFile(key, body);
}

export async function ensureBucket(): Promise<void> {
  if (!ensureBucketPromise) {
    ensureBucketPromise = (async () => {
      try {
        await s3.send(new HeadBucketCommand({ Bucket: BUCKET }));
      } catch (error) {
        const name = error instanceof Error ? error.name : "";
        if (name !== "NotFound" && name !== "NoSuchBucket") {
          throw error;
        }
        try {
          await s3.send(new CreateBucketCommand({ Bucket: BUCKET }));
        } catch (createError) {
          const createName = createError instanceof Error ? createError.name : "";
          if (createName !== "BucketAlreadyOwnedByYou" && createName !== "BucketAlreadyExists") {
            throw createError;
          }
        }
      }
    })().catch((error) => {
      ensureBucketPromise = null;
      throw error;
    });
  }

  await ensureBucketPromise;
}

export async function uploadFile(
  key: string,
  body: Buffer | Uint8Array,
  contentType: string,
): Promise<string> {
  if (process.env.ENABLE_DEV_LOGIN === "true") {
    return await writeLocalStorageFile(key, body);
  }

  await ensureBucket();
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
      ACL: "public-read",
    }),
  );
  const endpoint = process.env.S3_PUBLIC_URL ?? "http://localhost:9000";
  return `${endpoint}/${BUCKET}/${key}`;
}

export async function createPresignedPutUrl(opts: {
  contentType: keyof typeof ALLOWED_IMAGE_CONTENT_TYPES;
  scope?: string;
}): Promise<PresignResponse> {
  if (process.env.ENABLE_DEV_LOGIN === "true") {
    return createLocalDevPresignedPutUrl(opts);
  }

  await ensureBucket();

  const signingDate = new Date();
  const key = buildStorageKey(opts.contentType, opts.scope ?? "admin", signingDate);
  const expiresIn = 900;
  const endpoint = new URL(process.env.S3_ENDPOINT ?? "http://localhost:9000");
  const basePath = endpoint.pathname === "/" ? "" : endpoint.pathname.replace(/\/$/, "");
  const signer = new SignatureV4({
    service: "s3",
    region: "us-east-1",
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY ?? "minioadmin",
      secretAccessKey: process.env.S3_SECRET_KEY ?? "minioadmin",
    },
    sha256: Hash.bind(null, "sha256"),
    uriEscapePath: false,
  });
  const request = new HttpRequest({
    protocol: endpoint.protocol,
    hostname: endpoint.hostname,
    port: endpoint.port ? Number(endpoint.port) : undefined,
    method: "PUT",
    path: `${basePath}/${BUCKET}/${key}`,
    headers: {
      host: endpoint.host,
      "content-type": opts.contentType,
      "x-amz-acl": "public-read",
      "x-amz-content-sha256": "UNSIGNED-PAYLOAD",
    },
  });
  const presigned = await signer.presign(request, {
    expiresIn,
    signingDate,
    unhoistableHeaders: new Set(["content-type"]),
  });
  const uploadUrl = new URL(
    `${presigned.protocol}//${presigned.hostname}${presigned.port ? `:${presigned.port}` : ""}${presigned.path}`,
  );
  for (const [name, value] of Object.entries(presigned.query ?? {})) {
    if (Array.isArray(value)) {
      for (const item of value) {
        uploadUrl.searchParams.append(name, item);
      }
      continue;
    }

    uploadUrl.searchParams.set(name, String(value));
  }
  const publicEndpoint = process.env.S3_PUBLIC_URL ?? "http://localhost:9000";

  return {
    uploadUrl: uploadUrl.toString(),
    publicUrl: `${publicEndpoint}/${BUCKET}/${key}`,
    key,
    expiresAt: new Date(signingDate.getTime() + expiresIn * 1000).toISOString(),
  };
}
