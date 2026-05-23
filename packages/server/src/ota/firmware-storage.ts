import { S3Client, PutObjectCommand, HeadBucketCommand, CreateBucketCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { saveLocalDevUpload } from "../utils/storage";

const FIRMWARE_BUCKET = process.env.S3_FIRMWARE_BUCKET ?? "firmware";
const REGION = "us-east-1";
const DEFAULT_FIRMWARE_URL_EXPIRES_IN = 3600;
const MAX_FIRMWARE_URL_EXPIRES_IN = 604800;

function getFirmwareUrlExpiresIn() {
  const raw = process.env.FIRMWARE_URL_EXPIRES_IN;
  if (!raw) return DEFAULT_FIRMWARE_URL_EXPIRES_IN;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_FIRMWARE_URL_EXPIRES_IN;
  return Math.min(parsed, MAX_FIRMWARE_URL_EXPIRES_IN);
}

const firmwareS3 = new S3Client({
  endpoint: process.env.S3_ENDPOINT ?? "http://localhost:9000",
  region: REGION,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY ?? "minioadmin",
    secretAccessKey: process.env.S3_SECRET_KEY ?? "minioadmin",
  },
  forcePathStyle: true,
});

let ensureFirmwareBucketPromise: Promise<void> | null = null;

async function ensureFirmwareBucket() {
  if (!ensureFirmwareBucketPromise) {
    ensureFirmwareBucketPromise = (async () => {
      try {
        await firmwareS3.send(new HeadBucketCommand({ Bucket: FIRMWARE_BUCKET }));
      } catch (error) {
        const name = error instanceof Error ? error.name : "";
        if (name !== "NotFound" && name !== "NoSuchBucket") throw error;
        try {
          await firmwareS3.send(new CreateBucketCommand({ Bucket: FIRMWARE_BUCKET }));
        } catch (createError) {
          const createName = createError instanceof Error ? createError.name : "";
          if (createName !== "BucketAlreadyOwnedByYou" && createName !== "BucketAlreadyExists") {
            throw createError;
          }
        }
      }
    })().catch((error) => {
      ensureFirmwareBucketPromise = null;
      throw error;
    });
  }

  await ensureFirmwareBucketPromise;
}

export async function putFirmware(body: Buffer | Uint8Array, key: string, contentType = "application/octet-stream") {
  if (process.env.ENABLE_DEV_LOGIN === "true") {
    await saveLocalDevUpload(`${FIRMWARE_BUCKET}/${key}`, body);
    return;
  }

  await ensureFirmwareBucket();
  await firmwareS3.send(
    new PutObjectCommand({
      Bucket: FIRMWARE_BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
}

// Caddy 把 `/storage/*` 剥前缀转发到 MinIO，并默认透传 Host。
// 因此用「公网域名 + 不带 /storage 的 path」签名，MinIO 校验通过；
// 给设备的 URL 再补回 /storage 前缀，让 Caddy 能正确路由。
function splitPublicBase(publicBaseUrl: string) {
  const url = new URL(publicBaseUrl);
  const prefix = url.pathname.replace(/\/+$/, "");
  return {
    origin: url.origin,
    prefix,
  };
}

export async function createFirmwareDownloadUrl(key: string) {
  if (process.env.ENABLE_DEV_LOGIN === "true") {
    const baseUrl = process.env.APP_PUBLIC_URL ?? `http://localhost:${process.env.PORT ?? 9527}`;
    return `${baseUrl.replace(/\/+$/, "")}/storage/${FIRMWARE_BUCKET}/${key}`;
  }

  const publicBaseUrl = process.env.S3_PUBLIC_URL ?? "http://localhost:9000";
  const { origin, prefix } = splitPublicBase(publicBaseUrl);

  const signerClient = new S3Client({
    endpoint: origin,
    region: REGION,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY ?? "minioadmin",
      secretAccessKey: process.env.S3_SECRET_KEY ?? "minioadmin",
    },
    forcePathStyle: true,
  });

  const signed = await getSignedUrl(
    signerClient,
    new GetObjectCommand({ Bucket: FIRMWARE_BUCKET, Key: key }),
    { expiresIn: getFirmwareUrlExpiresIn() },
  );

  if (!prefix) return signed;

  // 在签名 URL 的 path 前补回公网前缀（如 /storage）
  const signedUrl = new URL(signed);
  signedUrl.pathname = `${prefix}${signedUrl.pathname}`;
  return signedUrl.toString();
}
