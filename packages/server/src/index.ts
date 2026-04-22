import type { Serve } from "bun";
import { Hono } from "hono";
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
import uploadRoute from "./routes/upload";
import invitePublicRoute from "./routes/invite-public";
import schedulesRoute from "./routes/schedules";
import { runPreflight } from "./preflight";
import { wsHandler, type WsConnectionData } from "./ws";

export function createApp() {
  const app = new Hono();

  app.use("*", logger());
  app.use("*", cors());

  app.get("/", (c) => c.json({ name: "YEHEY Pet API", version: "0.1.0" }));
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

  // 公开路由（登录接口 + 邀请预览）
  app.route("/api/auth", authRoute);
  app.route("/api/invite", invitePublicRoute);
  app.route("/api/schedules", schedulesRoute);
  app.route("/api/content", contentRoute);

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
