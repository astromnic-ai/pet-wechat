import type { Serve } from "bun";
import { Hono } from "hono";
import type { Context } from "hono";
import { serveStatic } from "hono/bun";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { logger } from "hono/logger";
import path from "node:path";
import { authMiddleware } from "./middleware/auth";
import { adminMiddleware } from "./middleware/admin";
import { otaAdminMiddleware } from "./middleware/ota-admin";
import { verifyToken } from "./middleware/auth";
import authRoute from "./routes/auth";
import adminRoute from "./routes/admin/index";
import petsRoute from "./routes/pets";
import avatarsRoute from "./routes/avatars";
import devicesRoute from "./routes/devices";
import behaviorsRoute from "./routes/behaviors";
import statsRoute from "./routes/stats";
import messagesRoute from "./routes/messages";
import meRoute from "./routes/me";
import settingsRoute from "./routes/settings";
import accountRoute from "./routes/account";
import contentRoute from "./routes/content";
import debugRoute from "./routes/debug";
import deviceReportRoute from "./routes/device-report";
import uploadRoute from "./routes/upload";
import invitePublicRoute from "./routes/invite-public";
import otaPublicRoute from "./routes/ota-public";
import firmwareAdminRoute from "./routes/admin/firmware";
import otaAdminRoute from "./routes/admin/ota";
import otaTokensRoute from "./routes/admin/ota-tokens";
import schedulesRoute from "./routes/schedules";
import { runPreflight } from "./preflight";
import { closeOtaMqtt, initOtaMqtt } from "./ota/mqtt-client";
import { clearScheduledDispatches } from "./ota/dispatch";
import { startPetModeScheduler, stopPetModeScheduler } from "./pet-mode/scheduler";
import { saveLocalDevUpload } from "./utils/storage";
import { wsHandler, type WsConnectionData } from "./ws";

const adminDistRoot = path.resolve(process.env.ADMIN_DIST_DIR ?? "../../admin-dist");
const adminIndexPath = path.join(adminDistRoot, "index.html");

function parseRangeHeader(rangeHeader: string | undefined, fileSize: number) {
  if (!rangeHeader?.startsWith("bytes=")) return null;

  const [startText, endText] = rangeHeader.replace("bytes=", "").split("-");
  const hasStart = startText !== "";
  const hasEnd = endText !== "";

  if (!hasStart && !hasEnd) return null;

  let start = hasStart ? Number(startText) : NaN;
  let end = hasEnd ? Number(endText) : NaN;

  if (Number.isNaN(start) && Number.isNaN(end)) return null;

  if (Number.isNaN(start)) {
    const suffixLength = end;
    if (!Number.isFinite(suffixLength) || suffixLength <= 0) return null;
    start = Math.max(fileSize - suffixLength, 0);
    end = fileSize - 1;
  } else {
    if (!Number.isFinite(start) || start < 0) return null;
    if (Number.isNaN(end) || !Number.isFinite(end)) {
      end = fileSize - 1;
    }
  }

  if (start >= fileSize) return { invalid: true as const };

  end = Math.min(end, fileSize - 1);
  if (end < start) return { invalid: true as const };

  return { invalid: false as const, start, end };
}

function createFileHeaders(contentType: string, contentLength: number) {
  return {
    "Content-Type": contentType,
    "Content-Length": String(contentLength),
    "Accept-Ranges": "bytes",
  };
}

async function serveLocalFile(c: Context, rootDir: string, urlPrefix: string) {
  const relativePath = c.req.path.replace(new RegExp(`^/${urlPrefix}/`), "");
  const filePath = path.resolve(process.cwd(), rootDir, relativePath);
  const file = Bun.file(filePath);

  if (!(await file.exists())) {
    return c.json({ error: "文件不存在" }, 404);
  }

  const contentType = file.type || "application/octet-stream";
  const range = parseRangeHeader(c.req.header("range"), file.size);

  if (range?.invalid) {
    return new Response(null, {
      status: 416,
      headers: {
        "Content-Range": `bytes */${file.size}`,
        "Accept-Ranges": "bytes",
      },
    });
  }

  if (range) {
    const fileBuffer = await file.arrayBuffer();
    const chunk = fileBuffer.slice(range.start, range.end + 1);
    const chunkSize = range.end - range.start + 1;
    return new Response(chunk, {
      status: 206,
      headers: {
        ...createFileHeaders(contentType, chunkSize),
        "Content-Range": `bytes ${range.start}-${range.end}/${file.size}`,
      },
    });
  }

  return new Response(file, {
    headers: createFileHeaders(contentType, file.size),
  });
}

export function createApp() {
  const app = new Hono();

  app.use("*", logger());
  app.use("*", cors());
  app.onError((error, c) => {
    const errorWithStatus = error as unknown as { status?: unknown };
    const status =
      error instanceof HTTPException
        ? error.status
        : typeof errorWithStatus.status === "number"
          ? errorWithStatus.status
          : null;
    const isOtaRoute =
      c.req.path.startsWith("/api/admin/firmware") ||
      c.req.path.startsWith("/api/admin/ota") ||
      c.req.path.startsWith("/firmware");

    if (status !== null && status >= 400 && status < 500) {
      if (isOtaRoute) {
        return c.json(
          { ok: false, code: "bad_request", message: error.message },
          status as never,
        );
      }
      return new Response(JSON.stringify({ error: error.message }), {
        status,
        headers: {
          "Content-Type": "application/json",
        },
      });
    }

    console.error(`[${c.req.method}] ${c.req.path} failed:`, error);
    if (isOtaRoute) {
      return c.json(
        { ok: false, code: "internal_error", message: "服务器内部错误" },
        500,
      );
    }
    return c.json({ error: "服务器内部错误" }, 500);
  });

  app.get("/health", (c) => c.json({ status: "ok" }));
  app.get("/static/*", (c) => serveLocalFile(c, "public", "static"));
  app.get("/storage/*", (c) => serveLocalFile(c, "storage", "storage"));
  app.put("/storage/*", async (c) => {
    if (process.env.ENABLE_DEV_LOGIN !== "true") {
      return c.json({ error: "Upload endpoint unavailable" }, 404);
    }

    const relativePath = c.req.path.replace(/^\/storage\//, "");
    const body = new Uint8Array(await c.req.arrayBuffer());

    try {
      await saveLocalDevUpload(relativePath, body);
    } catch (error) {
      if (error instanceof Error && error.message === "INVALID_STORAGE_KEY") {
        return c.json({ error: "Invalid storage path" }, 400);
      }
      throw error;
    }

    return new Response(null, { status: 200 });
  });

  // 公开路由（登录接口 + 邀请预览）
  app.route("/api/auth", authRoute);
  app.route("/api/invite", invitePublicRoute);
  app.route("/api/schedules", schedulesRoute);
  app.route("/api/device-report", deviceReportRoute);
  app.route("/api/content", contentRoute);
  app.route("/firmware", otaPublicRoute);
  app.get("/api", (c) => c.json({ name: "YEHEY Pet API", version: "0.1.0" }));

  // OTA admin routes must be registered before the global /api/admin/* middleware.
  app.use("/api/admin/firmware/*", otaAdminMiddleware);
  app.use("/api/admin/ota/*", otaAdminMiddleware);
  app.route("/api/admin/firmware", firmwareAdminRoute);
  app.route("/api/admin/ota/tokens", otaTokensRoute);
  app.route("/api/admin/ota", otaAdminRoute);

  // 管理后台路由（Admin Key 认证）
  app.use("/api/admin/*", adminMiddleware);
  app.route("/api/admin", adminRoute);

  // 需要鉴权的路由
  app.use("/api/*", authMiddleware);
  app.route("/api/me", meRoute);
  app.route("/api/pets", petsRoute);
  app.route("/api/avatars", avatarsRoute);
  app.route("/api/devices", devicesRoute);
  app.route("/api/behaviors", behaviorsRoute);
  app.route("/api/stats", statsRoute);
  app.route("/api/messages", messagesRoute);
  app.route("/api/upload", uploadRoute);
  app.route("/api/debug", debugRoute);
  app.route("/api/settings", settingsRoute);
  app.route("/api/account", accountRoute);

  app.use("*", serveStatic({ root: adminDistRoot }));
  app.get("*", async (c) => {
    if (
      c.req.path.startsWith("/api") ||
      c.req.path.startsWith("/storage") ||
      c.req.path === "/health"
    ) {
      return c.notFound();
    }

    const file = Bun.file(adminIndexPath);

    if (!(await file.exists())) {
      return c.notFound();
    }

    return new Response(file, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
      },
    });
  });

  return app;
}

const app = createApp();
const port = Number(process.env.PORT ?? 9527);

if (import.meta.main) {
  try {
    await runPreflight();
    if (process.env.OTA_MQTT_DISABLED !== "1") {
      await initOtaMqtt();
      startPetModeScheduler();
    }
    console.log(`Server running on http://localhost:${port}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    console.error("启动预检失败，服务退出");
    process.exit(1);
  }
}

let isShuttingDown = false;
async function shutdown(signal: string) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  try {
    clearScheduledDispatches();
    stopPetModeScheduler();
    await closeOtaMqtt();
  } catch (error) {
    console.error("[ota:mqtt] close failed:", error);
  } finally {
    console.log(`Received ${signal}, exiting`);
    process.exit(0);
  }
}

if (import.meta.main) {
  process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
  process.on("SIGINT", () => {
    void shutdown("SIGINT");
  });
}

export default {
  port,
  idleTimeout: 65,
  async fetch(req, server) {
    const url = new URL(req.url);

    if (url.pathname === "/ws") {
      const token = url.searchParams.get("token");
      if (!token) {
        return new Response("Missing token", { status: 401 });
      }

      try {
        const payload = await verifyToken(token);
        const upgraded = server.upgrade(req, {
          data: {
            userId: payload.userId,
            lastHeartbeatAt: Date.now(),
          } satisfies WsConnectionData,
        });

        if (upgraded) {
          return;
        }

        return new Response("WebSocket upgrade failed", { status: 500 });
      } catch {
        return new Response("Invalid token", { status: 401 });
      }
    }

    return app.fetch(req);
  },
  websocket: wsHandler,
} satisfies Serve.Options<WsConnectionData>;
