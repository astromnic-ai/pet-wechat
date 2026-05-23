import { S3Client, PutObjectCommand, HeadBucketCommand, CreateBucketCommand } from "@aws-sdk/client-s3";
import { saveLocalDevUpload } from "../utils/storage";

const FIRMWARE_BUCKET = process.env.S3_FIRMWARE_BUCKET ?? "firmware";
const REGION = "us-east-1";

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
      ACL: "public-read",
    }),
  );
}

export async function createFirmwareDownloadUrl(key: string) {
  if (process.env.ENABLE_DEV_LOGIN === "true") {
    const baseUrl = process.env.APP_PUBLIC_URL ?? `http://localhost:${process.env.PORT ?? 9527}`;
    return `${baseUrl.replace(/\/+$/, "")}/storage/${FIRMWARE_BUCKET}/${key}`;
  }

  const publicEndpoint = (process.env.S3_PUBLIC_URL ?? "http://localhost:9000").replace(/\/+$/, "");
  return `${publicEndpoint}/${FIRMWARE_BUCKET}/${key}`;
}
