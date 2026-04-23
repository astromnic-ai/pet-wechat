import {
  S3Client,
  PutObjectCommand,
  HeadBucketCommand,
  CreateBucketCommand,
} from "@aws-sdk/client-s3";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

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

function joinPublicUrl(baseUrl: string, relativePath: string) {
  return `${baseUrl.replace(/\/+$/, "")}/${relativePath.replace(/^\/+/, "")}`;
}

function getStorageRelativePath(pathname: string) {
  if (pathname.startsWith("/storage/")) {
    return pathname.slice("/storage/".length);
  }

  const bucketPrefix = `/${BUCKET}/`;
  if (pathname.startsWith(bucketPrefix)) {
    return pathname.slice(bucketPrefix.length);
  }

  return null;
}

export function normalizePublicFileUrl(rawUrl: string | null | undefined) {
  if (!rawUrl) {
    return rawUrl ?? null;
  }

  const publicBaseUrl =
    process.env.S3_PUBLIC_URL?.trim() || process.env.APP_PUBLIC_URL?.trim() || "";

  if (!publicBaseUrl) {
    return rawUrl;
  }

  try {
    const parsed = new URL(rawUrl);
    const relativePath = getStorageRelativePath(parsed.pathname);

    if (!relativePath) {
      return rawUrl;
    }

    return joinPublicUrl(publicBaseUrl, `${relativePath}${parsed.search}`);
  } catch {
    const relativePath = getStorageRelativePath(rawUrl);
    return relativePath ? joinPublicUrl(publicBaseUrl, relativePath) : rawUrl;
  }
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
    const targetPath = path.join(LOCAL_STORAGE_ROOT, key);
    await mkdir(path.dirname(targetPath), { recursive: true });
    await writeFile(targetPath, body);
    const baseUrl = process.env.APP_PUBLIC_URL ?? `http://localhost:${process.env.PORT ?? 9527}`;
    return `${baseUrl}/storage/${key}`;
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
