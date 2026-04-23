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

const uploadFile = async (key: string) => `https://test-storage.local/${key}`;
const normalizePublicFileUrl = (url: string | null | undefined) => url ?? null;
mock.module("../utils/storage", () => ({ uploadFile, normalizePublicFileUrl }));
mock.module("../utils/storage.ts", () => ({ uploadFile, normalizePublicFileUrl }));

const storagePath = new URL("../utils/storage.ts", import.meta.url).pathname;
mock.module(storagePath, () => ({ uploadFile, normalizePublicFileUrl }));
