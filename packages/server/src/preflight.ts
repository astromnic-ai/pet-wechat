import { readFile } from "node:fs/promises";
import { sql } from "drizzle-orm/sql";

const PRECHECK_TIMEOUT_MS = 10_000;
const REQUIRED_ENV_VARS = [
  "DATABASE_URL",
  "JWT_SECRET",
  "ADMIN_KEY",
  "DEVICE_REPORT_SECRET",
  "WX_APPID",
  "WX_SECRET",
  "S3_ENDPOINT",
  "S3_ACCESS_KEY",
  "S3_SECRET_KEY",
] as const;

type MigrationJournal = {
  entries?: Array<{ tag?: string }>;
};

function getErrorMessage(error: unknown): string {
  if (error instanceof AggregateError) {
    return error.errors.map((e: unknown) => getErrorMessage(e)).join("; ");
  }

  if (error instanceof Error) {
    return error.message || (error.cause ? getErrorMessage(error.cause) : String(error));
  }

  return String(error);
}

export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error(`${label} 检查超时 (${ms}ms)`));
      }, ms);
    }),
  ]).finally(() => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  });
}

export function checkEnvVars(): void {
  if (process.env.NODE_ENV !== "production") {
    return;
  }

  const missing = REQUIRED_ENV_VARS.filter((name) => !process.env[name]?.trim());
  if (missing.length > 0) {
    throw new Error(`❌ 缺少环境变量: ${missing.join(", ")}`);
  }
}

export async function checkPostgres(): Promise<void> {
  try {
    const { db } = await import("./db/index");
    await withTimeout(db.execute(sql`SELECT 1`), PRECHECK_TIMEOUT_MS, "PostgreSQL");
    console.log("✅ PostgreSQL 连接正常");
  } catch (error) {
    throw new Error(`❌ PostgreSQL 连接失败: ${getErrorMessage(error)}`);
  }
}

export async function checkMinio(): Promise<void> {
  if (process.env.ENABLE_DEV_LOGIN === "true") {
    console.log("ℹ️ 开发模式已启用，跳过 MinIO 检查");
    return;
  }

  const { BUCKET, ensureBucket } = await import("./utils/storage");

  try {
    await withTimeout(ensureBucket(), PRECHECK_TIMEOUT_MS, "MinIO");
    console.log(`✅ MinIO 连接正常，bucket "${BUCKET}" 已就绪`);
  } catch (error) {
    throw new Error(`❌ MinIO 连接失败: ${getErrorMessage(error)}`);
  }
}

async function readMigrationJournal(): Promise<MigrationJournal> {
  const raw = await readFile(new URL("../drizzle/meta/_journal.json", import.meta.url), "utf8");
  return JSON.parse(raw) as MigrationJournal;
}

export async function checkMigrations(): Promise<void> {
  try {
    const [{ db }, journal] = await Promise.all([import("./db/index"), readMigrationJournal()]);
    const rows = await db.execute<{ count: number }>(sql`
      SELECT COUNT(*)::int AS count
      FROM drizzle.__drizzle_migrations
    `);
    const appliedCount = Number(rows[0]?.count ?? 0);
    const expectedCount = journal.entries?.length ?? 0;

    if (appliedCount < expectedCount) {
      console.warn(`⚠️ 有 ${expectedCount - appliedCount} 个未应用的数据库迁移`);
      return;
    }

    if (appliedCount > expectedCount) {
      console.warn(
        `⚠️ 数据库迁移记录 (${appliedCount}) 多于本地迁移文件 (${expectedCount})`,
      );
      return;
    }

    console.log(`ℹ️ 已应用 ${appliedCount} 个数据库迁移`);
  } catch (error) {
    console.warn(`⚠️ 数据库迁移检查失败: ${getErrorMessage(error)}`);
  }
}

export async function runPreflight(): Promise<void> {
  console.log("🔍 正在检查服务依赖...");
  checkEnvVars();
  await checkPostgres();
  await checkMinio();
  await checkMigrations();
  console.log("✅ 所有依赖检查通过");
}
