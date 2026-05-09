const automator = require("miniprogram-automator");

const wsEndpoint = process.env.WEAPP_WS_ENDPOINT || "ws://127.0.0.1:9420";
const apiBase = process.env.API_BASE_URL || "http://localhost:9527";
const timeoutMs = Number(process.env.E2E_PRECHECK_TIMEOUT_MS || 5000);

function withTimeout(promise, label) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
    }),
  ]).finally(() => clearTimeout(timer));
}

async function fetchJson(path, init) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${apiBase}${path}`, {
      ...init,
      signal: controller.signal,
    });
    const text = await response.text();
    let data = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {}
    return { response, data };
  } finally {
    clearTimeout(timer);
  }
}

async function checkApi() {
  let health;
  try {
    health = await fetchJson("/health");
  } catch (error) {
    throw new Error(
      `API health check failed: cannot connect to ${apiBase}. Start backend with \`pnpm dev:server\`.`,
    );
  }

  const { response, data } = health;
  if (!response.ok || data.status !== "ok") {
    throw new Error(`API health check failed: HTTP ${response.status}`);
  }

  let devLogin;
  try {
    devLogin = await fetchJson("/api/auth/dev-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "13800000001" }),
    });
  } catch (error) {
    throw new Error(`dev-login check failed: cannot reach ${apiBase}/api/auth/dev-login.`);
  }

  if (!devLogin.response.ok || !devLogin.data.token) {
    throw new Error(
      `dev-login check failed: HTTP ${devLogin.response.status}. Start server with ENABLE_DEV_LOGIN=true for e2e.`,
    );
  }
}

async function checkWechatAutomator() {
  let mp;
  try {
    mp = await withTimeout(automator.connect({ wsEndpoint }), `WeChat automator ${wsEndpoint}`);
    const page = await withTimeout(mp.currentPage(), "WeChat currentPage");
    if (!page) {
      throw new Error("WeChat automator connected, but no current mini program page is open");
    }
  } finally {
    if (mp) {
      mp.disconnect();
    }
  }
}

(async () => {
  console.log(`[e2e-precheck] API: ${apiBase}`);
  await checkApi();
  console.log("[e2e-precheck] API and dev-login OK");

  console.log(`[e2e-precheck] WeChat automator: ${wsEndpoint}`);
  await checkWechatAutomator();
  console.log("[e2e-precheck] WeChat automator OK");
})().catch((error) => {
  console.error("[e2e-precheck] failed");
  console.error(error instanceof Error ? error.message : error);
  console.error("");
  console.error("Before running e2e, make sure:");
  console.error("- Backend is running on API_BASE_URL, usually `pnpm dev:server`.");
  console.error("- PostgreSQL and MinIO/S3 are available to the backend.");
  console.error("- WeChat DevTools opened packages/app/dist with service port enabled.");
  console.error("- Automator is started, for example:");
  console.error("  /Applications/wechatwebdevtools.app/Contents/MacOS/cli auto --project /Users/yangmei/codebase/pet-wechat/packages/app/dist --auto-port 9420 --lang zh --trust-project");
  process.exit(1);
});
