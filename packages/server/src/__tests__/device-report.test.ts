import { afterAll, beforeEach, describe, expect, it } from "bun:test";
import { mockDb } from "./setup";
import {
  createApp,
  fakeAvatar,
  fakeAvatarAction,
  fakeBehavior,
  fakeBinding,
  fakeCollar,
  fakeDesktop,
  fakeInteractionEvent,
  jsonReq,
} from "./helpers";

const app = createApp();
const originalDeviceReportSecret = process.env.DEVICE_REPORT_SECRET;

function deviceSecretHeaders(secret = "device-secret") {
  return { "X-Device-Secret": secret };
}

describe("Device Report Routes", () => {
  beforeEach(() => {
    mockDb._reset();
    process.env.DEVICE_REPORT_SECRET = "device-secret";
  });

  afterAll(() => {
    if (originalDeviceReportSecret === undefined) {
      delete process.env.DEVICE_REPORT_SECRET;
      return;
    }

    process.env.DEVICE_REPORT_SECRET = originalDeviceReportSecret;
  });

  describe("GET /api/device-report/tabletop/manifest", () => {
    it("auto creates an unclaimed desktop for unknown chipId", async () => {
      mockDb._results.select = [[], []];
      mockDb._results.insert = [[fakeDesktop({ id: "desktop-new", chipId: "8c4718feff49fd8c" })]];

      const res = await app.request(
        jsonReq("GET", "/api/device-report/tabletop/manifest?chipId=8c4718feff49fd8c"),
      );

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ collarChipId: null, files: [] });
      expect((mockDb._calls.insert[0] as any).values).toMatchObject({
        name: "摆台-49fd8c",
        chipId: "8c4718feff49fd8c",
        macAddress: "8c4718feff49fd8c",
        claimStatus: "unclaimed",
      });
    });

    it("returns empty files for an existing desktop without pet binding", async () => {
      mockDb._results.select = [
        [fakeDesktop({ chipId: "desktop-chip-1" })],
        [],
      ];

      const res = await app.request(
        jsonReq("GET", "/api/device-report/tabletop/manifest?chipId=desktop-chip-1"),
      );

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ collarChipId: null, files: [] });
      expect(mockDb._calls.insert).toHaveLength(0);
    });

    it("returns collar chipId and avatar video files for bound pet", async () => {
      mockDb._results.select = [
        [fakeDesktop({ id: "desktop-1", chipId: "desktop-chip-1" })],
        [fakeBinding({ desktopDeviceId: "desktop-1", petId: "pet-1" })],
        [fakeCollar({ petId: "pet-1", chipId: "collar-chip-1" })],
        [fakeAvatar({ id: "avatar-1", petId: "pet-1", status: "approved" })],
        [
          fakeAvatarAction({
            petAvatarId: "avatar-1",
            actionType: "lay",
            videoUrl: "https://pet-wechat.yangl.com.cn/storage/avatars/avatar-1/lay.mjpeg",
            videoHash: "sha256-lay",
          }),
        ],
      ];

      const res = await app.request(
        jsonReq("GET", "/api/device-report/tabletop/manifest?chipId=desktop-chip-1"),
      );

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        collarChipId: "collar-chip-1",
        files: [
          {
            actionType: "lay",
            hash: "sha256-lay",
            url: "https://pet-wechat.yangl.com.cn/storage/avatars/avatar-1/lay.mjpeg",
          },
        ],
      });
    });

    it("returns null collarChipId when no collar is bound to the pet", async () => {
      mockDb._results.select = [
        [fakeDesktop({ id: "desktop-1", chipId: "desktop-chip-1" })],
        [fakeBinding({ desktopDeviceId: "desktop-1", petId: "pet-1" })],
        [],
        [fakeAvatar({ id: "avatar-1", petId: "pet-1", status: "approved" })],
        [
          fakeAvatarAction({
            petAvatarId: "avatar-1",
            videoUrl: "https://pet-wechat.yangl.com.cn/storage/avatars/avatar-1/lay.mjpeg",
            videoHash: "sha256-lay",
          }),
        ],
      ];

      const res = await app.request(
        jsonReq("GET", "/api/device-report/tabletop/manifest?chipId=desktop-chip-1"),
      );

      expect(res.status).toBe(200);
      expect((await res.json()).collarChipId).toBeNull();
    });

    it("ignores avatar actions without video", async () => {
      mockDb._results.select = [
        [fakeDesktop({ id: "desktop-1", chipId: "desktop-chip-1" })],
        [fakeBinding({ desktopDeviceId: "desktop-1", petId: "pet-1" })],
        [fakeCollar({ petId: "pet-1", chipId: "collar-chip-1" })],
        [fakeAvatar({ id: "avatar-1", petId: "pet-1", status: "approved" })],
        [fakeAvatarAction({ petAvatarId: "avatar-1", videoUrl: null, videoHash: null })],
      ];

      const res = await app.request(
        jsonReq("GET", "/api/device-report/tabletop/manifest?chipId=desktop-chip-1"),
      );

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ collarChipId: "collar-chip-1", files: [] });
    });

    it("returns 400 when chipId is missing or blank", async () => {
      const missing = await app.request(jsonReq("GET", "/api/device-report/tabletop/manifest"));
      const blank = await app.request(jsonReq("GET", "/api/device-report/tabletop/manifest?chipId=%20"));

      expect(missing.status).toBe(400);
      expect(blank.status).toBe(400);
    });
  });

  describe("POST /api/device-report/heartbeat", () => {
    it("returns 503 when the device secret is not configured", async () => {
      delete process.env.DEVICE_REPORT_SECRET;

      const res = await app.request(
        jsonReq("POST", "/api/device-report/heartbeat", {
          body: { macAddress: "AA:BB:CC:DD:EE:FF", type: "collar" },
        }),
      );

      expect(res.status).toBe(503);
    });

    it("returns 401 when the device secret header is missing", async () => {
      const res = await app.request(
        jsonReq("POST", "/api/device-report/heartbeat", {
          body: { macAddress: "AA:BB:CC:DD:EE:FF", type: "collar" },
        }),
      );

      expect(res.status).toBe(401);
    });

    it("returns 401 when the device secret header is wrong", async () => {
      const res = await app.request(
        jsonReq("POST", "/api/device-report/heartbeat", {
          headers: deviceSecretHeaders("wrong-secret"),
          body: { macAddress: "AA:BB:CC:DD:EE:FF", type: "collar" },
        }),
      );

      expect(res.status).toBe(401);
    });

    it("updates collar status and lastOnlineAt", async () => {
      const updatedCollar = fakeCollar({
        macAddress: "AABBCCDDEEFF",
        status: "online",
        battery: 88,
        signal: -54,
        firmwareVersion: "1.2.3",
        lastOnlineAt: new Date("2026-04-18T05:00:00.000Z"),
      });
      mockDb._results.select = [[fakeCollar({ macAddress: "AABBCCDDEEFF" })]];
      mockDb._results.update = [[updatedCollar]];

      const res = await app.request(
        jsonReq("POST", "/api/device-report/heartbeat", {
          headers: deviceSecretHeaders(),
          body: {
            macAddress: "AA:BB:CC:DD:EE:FF",
            type: "collar",
            status: "online",
            battery: 88,
            signal: -54,
            firmwareVersion: "1.2.3",
          },
        }),
      );

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        success: true,
        deviceId: "collar-1",
        type: "collar",
        lastOnlineAt: "2026-04-18T05:00:00.000Z",
      });

      expect((mockDb._calls.update[0] as any).set).toMatchObject({
        status: "online",
        battery: 88,
        signal: -54,
        firmwareVersion: "1.2.3",
      });
      expect((mockDb._calls.update[0] as any).set.lastOnlineAt).toBeInstanceOf(Date);
      expect((mockDb._calls.update[0] as any).set.updatedAt).toBeInstanceOf(Date);
    });

    it("updates desktop status and ignores battery/signal", async () => {
      const updatedDesktop = fakeDesktop({
        macAddress: "112233445566",
        status: "pairing",
        firmwareVersion: "2.0.0",
        lastOnlineAt: new Date("2026-04-18T06:00:00.000Z"),
      });
      mockDb._results.select = [[fakeDesktop({ macAddress: "112233445566" })]];
      mockDb._results.update = [[updatedDesktop]];

      const res = await app.request(
        jsonReq("POST", "/api/device-report/heartbeat", {
          headers: deviceSecretHeaders(),
          body: {
            macAddress: "11:22:33:44:55:66",
            type: "desktop",
            status: "pairing",
            firmwareVersion: "2.0.0",
            battery: 77,
            signal: -40,
          },
        }),
      );

      expect(res.status).toBe(200);
      const updateSet = (mockDb._calls.update[0] as any).set;
      expect(updateSet).toMatchObject({
        status: "pairing",
        firmwareVersion: "2.0.0",
      });
      expect(updateSet.battery).toBeUndefined();
      expect(updateSet.signal).toBeUndefined();
    });

    it("returns 404 for an unregistered mac address", async () => {
      mockDb._results.select = [[]];

      const res = await app.request(
        jsonReq("POST", "/api/device-report/heartbeat", {
          headers: deviceSecretHeaders(),
          body: { macAddress: "AA:BB:CC:DD:EE:FF", type: "collar" },
        }),
      );

      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "Device not registered" });
    });

    it("returns 400 for an invalid mac address", async () => {
      const res = await app.request(
        jsonReq("POST", "/api/device-report/heartbeat", {
          headers: deviceSecretHeaders(),
          body: { macAddress: "not-a-mac", type: "collar" },
        }),
      );

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe("Invalid request body");
      expect(json.details).toContainEqual({
        path: "macAddress",
        message: "macAddress must be a 12-digit hexadecimal MAC address",
      });
    });
  });

  describe("POST /api/device-report/event", () => {
    it("writes a collar pet behavior event", async () => {
      const behavior = fakeBehavior({
        id: "behavior-2",
        actionType: "eat",
        timestamp: new Date("2026-04-18T05:00:00.000Z"),
      });
      mockDb._results.select = [[fakeCollar({ macAddress: "AABBCCDDEEFF", petId: "pet-1" })]];
      mockDb._results.insert = [[behavior]];

      const res = await app.request(
        jsonReq("POST", "/api/device-report/event", {
          headers: deviceSecretHeaders(),
          body: {
            macAddress: "AABBCCDDEEFF",
            type: "collar",
            actionType: "eat",
            occurredAt: "2026-04-18T05:00:00Z",
          },
        }),
      );

      expect(res.status).toBe(201);
      expect(await res.json()).toEqual({
        success: true,
        eventId: "behavior-2",
        occurredAt: "2026-04-18T05:00:00.000Z",
      });
      expect((mockDb._calls.insert[0] as any).values).toMatchObject({
        petId: "pet-1",
        collarDeviceId: "collar-1",
        actionType: "eat",
      });
      expect((mockDb._calls.insert[0] as any).values.timestamp).toBeInstanceOf(Date);
    });

    it("returns 400 when the collar has no bound pet", async () => {
      mockDb._results.select = [[fakeCollar({ macAddress: "AABBCCDDEEFF", petId: null })]];

      const res = await app.request(
        jsonReq("POST", "/api/device-report/event", {
          headers: deviceSecretHeaders(),
          body: {
            macAddress: "AA:BB:CC:DD:EE:FF",
            type: "collar",
            actionType: "eat",
          },
        }),
      );

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "Collar has no bound pet" });
    });

    it("writes a desktop interaction event", async () => {
      const event = fakeInteractionEvent({
        id: "interaction-2",
        actionType: "eat",
        occurredAt: new Date("2026-04-18T07:00:00.000Z"),
      });
      mockDb._results.select = [
        [fakeDesktop({ macAddress: "112233445566", userId: "user-1" })],
        [fakeBinding({ desktopDeviceId: "desktop-1", petId: "pet-1" })],
      ];
      mockDb._results.insert = [[event]];

      const res = await app.request(
        jsonReq("POST", "/api/device-report/event", {
          headers: deviceSecretHeaders(),
          body: {
            macAddress: "11:22:33:44:55:66",
            type: "desktop",
            actionType: "eat",
            occurredAt: "2026-04-18T07:00:00Z",
          },
        }),
      );

      expect(res.status).toBe(201);
      expect(await res.json()).toEqual({
        success: true,
        eventId: "interaction-2",
        occurredAt: "2026-04-18T07:00:00.000Z",
      });
      expect((mockDb._calls.insert[0] as any).values).toMatchObject({
        userId: "user-1",
        petId: "pet-1",
        deviceId: "desktop-1",
        actionType: "eat",
      });
      expect((mockDb._calls.insert[0] as any).values.occurredAt).toBeInstanceOf(Date);
    });

    it("returns 400 when the desktop has no active pet binding", async () => {
      mockDb._results.select = [
        [fakeDesktop({ macAddress: "112233445566", userId: "user-1" })],
        [],
      ];

      const res = await app.request(
        jsonReq("POST", "/api/device-report/event", {
          headers: deviceSecretHeaders(),
          body: {
            macAddress: "11:22:33:44:55:66",
            type: "desktop",
            actionType: "eat",
          },
        }),
      );

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "Desktop not bound to user or pet" });
    });

    it("returns 400 when the desktop has no bound user", async () => {
      mockDb._results.select = [[fakeDesktop({ macAddress: "112233445566", userId: null })]];

      const res = await app.request(
        jsonReq("POST", "/api/device-report/event", {
          headers: deviceSecretHeaders(),
          body: {
            macAddress: "11:22:33:44:55:66",
            type: "desktop",
            actionType: "eat",
          },
        }),
      );

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "Desktop not bound to user or pet" });
    });
  });
});
