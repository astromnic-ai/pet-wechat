/**
 * E2E 测试辅助工具
 * 基于 miniprogram-automator 连接微信开发者工具
 */
import automator from "miniprogram-automator";

const WS_ENDPOINT = process.env.WEAPP_WS_ENDPOINT || "ws://localhost:9420";
const API_BASE = process.env.API_BASE_URL || "http://localhost:9527";

let miniProgram: any = null;

/** 连接到微信开发者工具 */
export async function connect() {
  if (miniProgram) return miniProgram;
  miniProgram = await automator.connect({ wsEndpoint: WS_ENDPOINT });
  return miniProgram;
}

/** 断开连接 */
export async function disconnect() {
  if (miniProgram) {
    miniProgram.disconnect();
    miniProgram = null;
  }
}

/** 获取当前 MiniProgram 实例 */
export function getMiniProgram() {
  if (!miniProgram) throw new Error("Not connected. Call connect() first.");
  return miniProgram;
}

/** 通过后端 API 获取开发登录 token */
export async function getDevToken(phone = "13800000001"): Promise<string> {
  const res = await fetch(`${API_BASE}/api/auth/dev-login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone }),
  });
  const data = await res.json();
  if (!data.token) throw new Error(`dev-login failed: ${JSON.stringify(data)}`);
  return data.token;
}

/** 通过后端 API 创建测试宠物 */
export async function createTestPet(token: string, name = "测试猫咪") {
  const res = await fetch(`${API_BASE}/api/pets`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      name,
      species: "cat",
      breed: "英短蓝猫",
      gender: "male",
      birthday: "2023-06-15",
      weight: 4.5,
    }),
  });
  const data = await res.json();
  return data.pet;
}

/** 通过后端 API 注册测试项圈 */
export async function registerTestCollar(
  token: string,
  macAddress = "AABBCCDDEEFF"
) {
  const res = await fetch(`${API_BASE}/api/devices/collars/register`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ macAddress, name: "测试项圈" }),
  });
  return await res.json();
}

/** 等待页面加载完成并返回 page 实例 */
export async function waitForPage(mp: any, timeout = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const page = await mp.currentPage();
    if (page) return page;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("Timeout waiting for page");
}

/** 截图并保存 */
export async function screenshot(mp: any, name: string) {
  const dir = "tests/e2e/screenshots";
  await Bun.write(`${dir}/.gitkeep`, "");
  await mp.screenshot({ path: `${dir}/${name}.png` });
  console.log(`  📸 Screenshot saved: ${dir}/${name}.png`);
}

/** 获取页面 React state（Taro React 的 data 嵌套在 root 下） */
export async function getPageState(page: any): Promise<Record<string, any>> {
  const data = await page.data();
  // Taro React 页面的 state 在 root 属性下
  return data?.root ?? data ?? {};
}

/** 获取整个页面的可见文本内容（Taro React 兼容） */
export async function getPageText(page: any): Promise<string> {
  const root = await page.$("page");
  if (!root) return "";
  return (await root.text()) ?? "";
}
