import { S3Client, PutObjectCommand, HeadBucketCommand, CreateBucketCommand } from "@aws-sdk/client-s3";
import { Hash } from "@smithy/hash-node";
import { HttpRequest } from "@smithy/protocol-http";
import { SignatureV4 } from "@smithy/signature-v4";
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
    }),
  );
}

export async function createFirmwarePresignedGetUrl(key: string, expiresIn = 3600) {
  if (process.env.ENABLE_DEV_LOGIN === "true") {
    const baseUrl = process.env.APP_PUBLIC_URL ?? `http://localhost:${process.env.PORT ?? 9527}`;
    return `${baseUrl.replace(/\/+$/, "")}/storage/${FIRMWARE_BUCKET}/${key}`;
  }

  const boundedExpires = Math.max(60, Math.min(expiresIn, 86400));
  const endpoint = new URL(process.env.S3_ENDPOINT ?? "http://localhost:9000");
  const basePath = endpoint.pathname === "/" ? "" : endpoint.pathname.replace(/\/$/, "");
  const signer = new SignatureV4({
    service: "s3",
    region: REGION,
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
    method: "GET",
    path: `${basePath}/${FIRMWARE_BUCKET}/${key}`,
    headers: {
      host: endpoint.host,
      "x-amz-content-sha256": "UNSIGNED-PAYLOAD",
    },
  });

  const presigned = await signer.presign(request, { expiresIn: boundedExpires });
  const url = new URL(
    `${presigned.protocol}//${presigned.hostname}${presigned.port ? `:${presigned.port}` : ""}${presigned.path}`,
  );
  for (const [name, value] of Object.entries(presigned.query ?? {})) {
    if (Array.isArray(value)) {
      for (const item of value) url.searchParams.append(name, item);
    } else {
      url.searchParams.set(name, String(value));
    }
  }
  return url.toString();
}
