import type { Serve } from "bun";
import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import path from "node:path";
import { authMiddleware } from "./middleware/auth";
import { adminMiddleware } from "./middleware/admin";
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
import schedulesRoute from "./routes/schedules";
import { runPreflight } from "./preflight";
import { saveLocalDevUpload } from "./utils/storage";
import { wsHandler, type WsConnectionData } from "./ws";

const adminDistRoot = path.resolve(process.env.ADMIN_DIST_DIR ?? "../../admin-dist");
const adminIndexPath = path.join(adminDistRoot, "index.html");

export function createApp() {
  const app = new Hono();

  app.use("*", logger());
  app.use("*", cors());

  app.get("/health", (c) => c.json({ status: "ok" }));
  app.get("/storage/*", async (c) => {
    const relativePath = c.req.path.replace(/^\/storage\//, "");
    const filePath = path.resolve(process.cwd(), "storage", relativePath);
    const file = Bun.file(filePath);

    if (!(await file.exists())) {
      return c.json({ error: "文件不存在" }, 404);
    }

    return new Response(file);
  });
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
  app.get("/api", (c) => c.json({ name: "YEHEY Pet API", version: "0.1.0" }));

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
    console.log(`Server running on http://localhost:${port}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    console.error("启动预检失败，服务退出");
    process.exit(1);
  }
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
