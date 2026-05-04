/**
 * Bun test preload: mock the db module before any test file imports.
 *
 * This file is loaded via bunfig.toml [test].preload before
 * any test modules are resolved.
 */
import { mock } from "bun:test";
import { createMockDb } from "./mock-db";

const mockDb = createMockDb();

// Store on globalThis so test files can access & configure it
(globalThis as any).__mockDb = mockDb;

// Mock the db module. The path here is resolved relative to THIS file.
// Since this file is in src/__tests__/, "../db" resolves to src/db/index.ts
mock.module("../db", () => ({ db: mockDb }));
mock.module("../db/index", () => ({ db: mockDb }));
mock.module("../db/index.ts", () => ({ db: mockDb }));

// Also mock with absolute-like path
const dbPath = new URL("../db", import.meta.url).pathname;
mock.module(dbPath, () => ({ db: mockDb }));

const ALLOWED_IMAGE_CONTENT_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "video/mjpeg": "mjpeg",
  "video/x-motion-jpeg": "mjpeg",
} as const;

const uploadFile = async (key: string) => `https://test-storage.local/${key}`;
const createPresignedPutUrl = async (opts: {
  contentType: keyof typeof ALLOWED_IMAGE_CONTENT_TYPES;
  scope?: string;
}) => {
  const ext = ALLOWED_IMAGE_CONTENT_TYPES[opts.contentType];
  const key = `uploads/${opts.scope ?? "admin"}/mock.${ext}`;

  return {
    uploadUrl: `http://localhost:9527/storage/${key}`,
    publicUrl: `http://localhost:9527/storage/${key}`,
    key,
    expiresAt: new Date("2026-01-01T00:00:00.000Z").toISOString(),
  };
};

const saveLocalDevUpload = async (key: string) => `http://localhost:9527/storage/${key}`;
const normalizePublicFileUrl = (url: string | null | undefined) => url ?? null;
const isManagedStorageUrl = (url: string | null | undefined) =>
  typeof url === "string" && (url.includes("/storage/") || url.includes("/pet-uploads/"));
mock.module("../utils/storage", () => ({
  uploadFile,
  createPresignedPutUrl,
  saveLocalDevUpload,
  normalizePublicFileUrl,
  isManagedStorageUrl,
  ALLOWED_IMAGE_CONTENT_TYPES,
}));
mock.module("../utils/storage.ts", () => ({
  uploadFile,
  createPresignedPutUrl,
  saveLocalDevUpload,
  normalizePublicFileUrl,
  isManagedStorageUrl,
  ALLOWED_IMAGE_CONTENT_TYPES,
}));

const storagePath = new URL("../utils/storage.ts", import.meta.url).pathname;
mock.module(storagePath, () => ({
  uploadFile,
  createPresignedPutUrl,
  saveLocalDevUpload,
  normalizePublicFileUrl,
  isManagedStorageUrl,
  ALLOWED_IMAGE_CONTENT_TYPES,
}));
