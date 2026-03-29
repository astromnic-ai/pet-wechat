import {
  S3Client,
  PutObjectCommand,
  HeadBucketCommand,
  CreateBucketCommand,
} from "@aws-sdk/client-s3";

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
let ensureBucketPromise: Promise<void> | null = null;

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
