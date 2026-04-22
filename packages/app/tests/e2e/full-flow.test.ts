import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  connect,
  disconnect,
  getDevToken,
  getPageText,
  screenshot,
  waitForPage,
} from "./helpers";

const API_BASE = process.env.API_BASE_URL || "http://localhost:9527";
const PET_NAME = "毛毛";
const WIFI_SSID = "E2E-WIFI";
const WIFI_PASSWORD = "12345678";
const PHONE = `138${Date.now().toString().slice(-8)}`;
const MAC_ADDRESS = `AA55BB${Date.now().toString(16).toUpperCase().slice(-6).padStart(6, "0")}`;

let mp: any;
let token = "";
let petId = "";
let collarId = "";

async function sleep(ms = 2000) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function textOf(page: any, selector: string): Promise<string> {
  const el = await page.$(selector);
  if (!el) return "";
  return (await el.text()) ?? "";
}

async function tap(page: any, selector: string) {
  const el = await page.$(selector);
  expect(el).toBeTruthy();
  await el.tap();
}

async function tapAt(page: any, selector: string, index: number) {
  const elements = await page.$$(selector);
  expect(elements.length).toBeGreaterThan(index);
  await elements[index].tap();
}

async function waitForPath(path: string, timeout = 8000) {
  const start = Date.now();

  while (Date.now() - start < timeout) {
    const page = await waitForPage(mp, 1000);
    if (page?.path === path) {
      return page;
    }
    await sleep(200);
  }

  const currentPage = await mp.currentPage();
  throw new Error(`Timeout waiting for path ${path}, current=${currentPage?.path}`);
}

async function waitForTextContains(
  path: string,
  selector: string,
  expected: string,
  timeout = 10000,
) {
  const start = Date.now();

  while (Date.now() - start < timeout) {
    const page = await waitForPath(path, 1000);
    const text = await textOf(page, selector);
    if (text.includes(expected)) {
      return page;
    }
    await sleep(500);
  }

  const page = await waitForPath(path, 1000);
  const text = await textOf(page, selector);
  throw new Error(
    `Timeout waiting for text "${expected}" in ${selector}, current text="${text}"`,
  );
}

async function fetchJson(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  return await response.json();
}

async function getCurrentRouteInfo() {
  return await mp.evaluate(() => {
    const pages = getCurrentPages();
    const currentPage = pages[pages.length - 1];
    return {
      route: currentPage?.route ?? "",
      options: currentPage?.options ?? {},
    };
  });
}

beforeAll(async () => {
  mp = await connect();
  await mp.evaluate(() => {
    wx.clearStorageSync();
    return true;
  });
  await mp.mockWxMethod("openBluetoothAdapter", {});
  await mp.mockWxMethod("startBluetoothDevicesDiscovery", {});
  await mp.mockWxMethod("getBluetoothDevices", {
    devices: [
      {
        deviceId: MAC_ADDRESS,
        name: "YEHEY-Collar-001",
        RSSI: -48,
      },
    ],
  });
  await mp.mockWxMethod("createBLEConnection", {});
  await mp.mockWxMethod("startWifi", {});
  await mp.mockWxMethod("getConnectedWifi", {
    wifi: {
      SSID: WIFI_SSID,
    },
  });
}, 30000);

afterAll(async () => {
  if (mp) {
    await mp.restoreWxMethod("openBluetoothAdapter");
    await mp.restoreWxMethod("startBluetoothDevicesDiscovery");
    await mp.restoreWxMethod("getBluetoothDevices");
    await mp.restoreWxMethod("createBLEConnection");
    await mp.restoreWxMethod("startWifi");
    await mp.restoreWxMethod("getConnectedWifi");
  }
  await disconnect();
}, 30000);

describe("完整端到端用户旅程", () => {
  test("第一阶段：开发鉴权注入后，从首页进入设备搜索", async () => {
    await mp.reLaunch("/pages/login/index");
    await sleep(2000);

    let page = await waitForPath("pages/login/index");
    const loginText = await getPageText(page);
    expect(loginText).toContain("微信账号登录");

    token = await getDevToken(PHONE);
    await mp.evaluate((value: string) => {
      wx.setStorageSync("token", value);
      return true;
    }, token);

    await mp.reLaunch("/pages/index/index");
    await sleep(2000);

    page = await waitForPath("pages/index/index");
    expect(await getPageText(page)).toContain("设备管理");
    await screenshot(mp, "full-flow-01-home-empty");

    await tap(page, ".device-plus-box");
    await sleep(2000);

    page = await waitForPath("pages/collar-bind/index");
    const collarBindText = await getPageText(page);
    expect(collarBindText).toContain("搜索设备");
    expect(collarBindText).toContain("Step 1");
    expect(collarBindText).toContain("Step 2");
    expect(collarBindText).toContain("YEHEY-Collar-001");
    await screenshot(mp, "full-flow-02-device-search");

    await tap(page, ".nearby-device-action");
    await sleep(2000);

    page = await waitForPath("pages/wifi-config/index");
    expect(await getPageText(page)).toContain("WiFi 配置");
  }, 20000);

  test("第一阶段：WiFi 配置后进入绑定宠物，并创建新宠物", async () => {
    let page = await waitForPath("pages/wifi-config/index");
    const wifiText = await getPageText(page);
    expect(wifiText).toContain(WIFI_SSID);

    const inputs = await page.$$(".wifi-input-value");
    expect(inputs.length).toBeGreaterThanOrEqual(2);
    await inputs[1].input(WIFI_PASSWORD);
    await sleep(500);

    await tap(page, ".wifi-submit-btn");
    await sleep(2000);

    page = await waitForPath("pages/bind-pet/index");
    expect(await getPageText(page)).toContain("绑定宠物");
    expect(await getPageText(page)).toContain("创建新宠物");

    await tap(page, ".create-pet-card");
    await sleep(2000);

    page = await waitForPath("pages/pet-info/index");
    expect(await textOf(page, ".page-title")).toContain("添加宠物");
  }, 20000);

  test("第二阶段：信息录入、绑定宠物与头像入口", async () => {
    let page = await waitForPath("pages/pet-info/index");
    expect(await textOf(page, ".page-title")).toContain("添加宠物");

    const inputs = await page.$$(".single-input");
    expect(inputs.length).toBeGreaterThanOrEqual(1);
    await inputs[0].input(PET_NAME);
    await sleep(500);

    await tap(page, ".submit-btn");
    await sleep(2000);

    page = await waitForPath("pages/bind-pet/index");
    expect(await getPageText(page)).toContain(PET_NAME);

    await tap(page, ".bind-confirm-btn");
    await sleep(2000);

    page = await waitForPath("pages/index/index");
    const homeText = await getPageText(page);
    expect(homeText).toContain(PET_NAME);
    expect(homeText).toContain("设备管理");
    await screenshot(mp, "full-flow-03-home");

    await tap(page, ".pet-slide");
    await sleep(2000);

    page = await waitForPath("pages/pet-avatar/index");
    const avatarText = await getPageText(page);
    expect(avatarText).toContain("上传您的宠物照片");
    expect(avatarText).toContain("跳过，稍后再完成");
    await screenshot(mp, "full-flow-04-pet-avatar");

    await tap(page, ".secondary-action");
    await sleep(2000);

    page = await waitForPath("pages/index/index");
    expect(await getPageText(page)).toContain(PET_NAME);
  }, 20000);

  test("第三阶段：首页与行为气泡验证", async () => {
    const page = await waitForPath("pages/index/index");
    const homeText = await getPageText(page);
    expect(homeText).toContain(PET_NAME);
    expect(homeText).toContain("设备管理");

    const petsData = await fetchJson(`${API_BASE}/api/pets`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const collarsData = await fetchJson(`${API_BASE}/api/devices/collars`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    const pet = (petsData.pets || []).find((item: any) => item.name === PET_NAME);
    const collar = (collarsData.collars || []).find(
      (item: any) => item.macAddress === MAC_ADDRESS,
    );

    expect(pet).toBeTruthy();
    expect(collar).toBeTruthy();
    petId = pet.id;
    collarId = collar.id;

    const behaviorData = await fetchJson(`${API_BASE}/api/behaviors`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        petId,
        collarDeviceId: collarId,
        actionType: "running",
      }),
    });

    expect(behaviorData.behavior).toBeTruthy();
    const refreshedHomePage = await waitForTextContains(
      "pages/index/index",
      ".speech-text",
      "奔跑",
    );
    expect(await textOf(refreshedHomePage, ".speech-text")).toContain("奔跑");
    await screenshot(mp, "full-flow-05-running-bubble");
  }, 20000);

  test("第三阶段：首页功能页验证一：消息中心与数据统计", async () => {
    let page = await waitForPath("pages/index/index");

    await tap(page, ".activity-bell-wrap");
    await sleep(2000);

    page = await waitForPath("pages/messages/index");
    expect(await textOf(page, ".header-title")).toContain("消息中心");
    expect(await getPageText(page)).toContain("全部");

    await tap(page, ".page-back");
    await sleep(2000);

    page = await waitForPath("pages/index/index");
    await tapAt(page, ".quick-nav-item", 1);
    await sleep(2000);

    page = await waitForPath("pages/data/index");
    const dataText = await getPageText(page);
    expect(dataText).toContain("日");
    expect(dataText).toContain("周");

    await tap(page, ".page-back");
    await sleep(2000);

    page = await waitForPath("pages/index/index");
    expect(await getPageText(page)).toContain(PET_NAME);
  }, 20000);

  test("第三阶段：首页功能页验证二：个人中心与设备管理", async () => {
    let page = await waitForPath("pages/index/index");

    await tapAt(page, ".quick-nav-item", 0);
    await sleep(2000);

    page = await waitForPath("pages/profile/index");
    const profileText = await getPageText(page);
    expect(profileText).toContain("用户信息");
    expect(profileText).toContain("我的宠物");

    await tap(page, ".page-back");
    await sleep(2000);

    page = await waitForPath("pages/index/index");
    await tap(page, ".device-manage");
    await sleep(2000);

    page = await waitForPath("pages/devices/index");
    const devicesText = await getPageText(page);
    expect(devicesText).toContain(PET_NAME);
    expect(devicesText).toContain("YEHEY-Collar-001");

    await tap(page, ".page-back");
    await sleep(2000);

    page = await waitForPath("pages/index/index");
    expect(await getPageText(page)).toContain(PET_NAME);
  }, 20000);

  test("第四阶段：主页导航跳转验证（#40, #41）", async () => {
    let page = await waitForPath("pages/index/index", 20000);

    await tap(page, ".top-card");
    await sleep(2000);

    page = await waitForPath("pages/pet-info/index", 20000);
    let routeInfo = await getCurrentRouteInfo();
    expect(routeInfo.route).toBe("pages/pet-info/index");
    expect(String(routeInfo.options?.petId ?? "")).toContain(petId);

    await tap(page, ".page-back");
    await sleep(2000);

    page = await waitForPath("pages/index/index", 20000);
    await tap(page, ".pet-slide");
    await sleep(2000);

    page = await waitForPath("pages/pet-avatar/index", 20000);
    routeInfo = await getCurrentRouteInfo();
    expect(routeInfo.route).toBe("pages/pet-avatar/index");
    expect(String(routeInfo.options?.petId ?? "")).toContain(petId);

    await tap(page, ".page-back");
    await sleep(2000);

    page = await waitForPath("pages/index/index", 20000);
    expect(await getPageText(page)).toContain(PET_NAME);
  }, 20000);

  test("第四阶段：设置页交互验证（#46）", async () => {
    let page = await waitForPath("pages/index/index", 20000);

    await tapAt(page, ".quick-nav-item", 2);
    await sleep(2000);

    page = await waitForPath("pages/settings/index", 20000);
    await tapAt(page, ".setting-item", 0);
    await sleep(1500);

    page = await waitForPath("pages/settings/index", 20000);
    expect(await getPageText(page)).toContain("退出登录");

    await tap(page, ".page-back");
    await sleep(2000);

    page = await waitForPath("pages/index/index", 20000);
    expect(await getPageText(page)).toContain(PET_NAME);
  }, 20000);

  test("第四阶段：消息中心返回按钮验证（#45）", async () => {
    let page = await waitForPath("pages/index/index", 20000);

    await tap(page, ".activity-bell-wrap");
    await sleep(2000);

    page = await waitForPath("pages/messages/index", 20000);
    const backButton = await page.$(".page-back");
    expect(backButton).toBeTruthy();
    await backButton.tap();
    await sleep(2000);

    page = await waitForPath("pages/index/index", 20000);
    expect(await getPageText(page)).toContain(PET_NAME);
  }, 20000);

  test("第四阶段：数据中心月视图切换验证（#44）", async () => {
    let page = await waitForPath("pages/index/index", 20000);

    await tapAt(page, ".quick-nav-item", 1);
    await sleep(2000);

    page = await waitForPath("pages/data/index", 20000);
    await tapAt(page, ".mode-tab", 2);
    await sleep(2000);

    page = await waitForTextContains("pages/data/index", "page", "本月", 20000);
    expect(await getPageText(page)).toContain("本月");

    await tapAt(page, ".mode-tab", 0);
    await sleep(2000);

    page = await waitForTextContains("pages/data/index", "page", "今日", 20000);
    expect(await getPageText(page)).toContain("今日");

    await tap(page, ".page-back");
    await sleep(2000);

    page = await waitForPath("pages/index/index", 20000);
    expect(await getPageText(page)).toContain(PET_NAME);
  }, 20000);

  test("最后：设置页退出登录", async () => {
    let page = await waitForPath("pages/index/index");

    await tapAt(page, ".quick-nav-item", 2);
    await sleep(2000);

    page = await waitForPath("pages/settings/index");
    const settingsText = await getPageText(page);
    expect(settingsText).toContain("退出登录");

    const settingItems = await page.$$(".setting-item");
    expect(settingItems.length).toBeGreaterThan(0);
    await settingItems[settingItems.length - 1].tap();
    await sleep(2000);

    page = await waitForPath("pages/login/index");
    const loginText = await getPageText(page);
    expect(loginText).toContain("微信账号登录");
  }, 20000);
});
