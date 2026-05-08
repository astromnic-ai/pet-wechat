/**
 * End-to-end flow tests: simulate multi-step user journeys.
 * Uses the same mock db, but exercises sequential API calls
 * that form complete business flows.
 */
import { describe, it, expect, beforeEach } from "bun:test";
import { mockDb } from "./setup";
import {
  createApp,
  authHeader,
  jsonReq,
  fakeUser,
  fakePet,
  fakeCollar,
  fakeDesktop,
  fakeAvatar,
  fakeBinding,
  fakeAuthorization,
  fakeMessage,
} from "./helpers";

const app = createApp();

describe("E2E Flows", () => {
  beforeEach(() => {
    mockDb._reset();
  });

  // ===== Flow 1: 注册 → 添加宠物 → 上传头像 =====

  describe("Registration → Add Pet → Upload Avatar", () => {
    it("completes the full new user onboarding flow", async () => {
      const user = fakeUser({ id: "new-user" });
      const pet = fakePet({ id: "new-pet", userId: "new-user", name: "小花" });
      const avatar = fakeAvatar({ id: "new-avatar", petId: "new-pet" });

      // Step 1: Register via phone
      mockDb._results.select = [[]]; // no existing user
      mockDb._results.insert = [[user]];

      const authRes = await app.request(
        jsonReq("POST", "/api/auth/phone", {
          body: { phone: "13900139000", code: "123456" },
        })
      );
      expect(authRes.status).toBe(200);
      const { token } = await authRes.json();
      expect(token).toBeDefined();

      // Step 2: Add pet
      const headers = await authHeader("new-user");
      mockDb._reset();
      mockDb._results.insert = [[pet]];

      const petRes = await app.request(
        jsonReq("POST", "/api/pets", {
          headers,
          body: { name: "小花", species: "cat" },
        })
      );
      expect(petRes.status).toBe(201);
      const petJson = await petRes.json();
      expect(petJson.pet.name).toBe("小花");

      // Step 3: Upload avatar
      mockDb._reset();
      // select 1: pet ownership, 2: user, 3: desktop quota count, 4: used quota count
      mockDb._results.select = [[pet], [user], [{ count: 1 }], [{ count: 0 }]];
      // insert 1: create avatar
      mockDb._results.insert = [[avatar]];

      const avatarRes = await app.request(
        jsonReq("POST", "/api/avatars", {
          headers,
          body: { petId: "new-pet", sourceImageUrl: "http://localhost:9527/storage/uploads/test/cat.jpg" },
        })
      );
      // Accept 201 (created) or 200 (ok)
      expect([200, 201]).toContain(avatarRes.status);
    });
  });

  // ===== Flow 2: 项圈绑定 → 关联宠物 =====

  describe("Collar Bind → Associate Pet", () => {
    it("creates a collar and binds it to a pet", async () => {
      const headers = await authHeader("user-1");
      const collar = fakeCollar({ id: "new-collar" });
      const pet = fakePet();

      // Step 1: Create collar
      mockDb._results.insert = [[collar]];

      const collarRes = await app.request(
        jsonReq("POST", "/api/devices/collars", {
          headers,
          body: { macAddress: "AA:BB:CC:DD:EE:FF" },
        })
      );
      expect(collarRes.status).toBe(201);

      // Step 2: Update collar to associate with pet
      mockDb._reset();
      const updatedCollar = fakeCollar({ id: "new-collar", petId: "pet-1" });
      // 1st select: collar ownership check, 2nd select: pet ownership check
      mockDb._results.select = [[collar], [pet]];
      mockDb._results.update = [[updatedCollar]];

      const bindRes = await app.request(
        jsonReq("PUT", "/api/devices/collars/new-collar", {
          headers,
          body: { petId: "pet-1" },
        })
      );
      expect(bindRes.status).toBe(200);
      const bindJson = await bindRes.json();
      expect(bindJson.collar.petId).toBe("pet-1");
    });
  });

  // ===== Flow 3: 邀请码 → 接受邀请 =====

  describe("Invite → Accept Invite", () => {
    it("creates an invite and another user accepts it", async () => {
      const headersOwner = await authHeader("user-1");
      const headersOther = await authHeader("user-2");
      const pet = fakePet();
      const owner = fakeUser();
      const desktop = fakeDesktop({ userId: "user-2", id: "desk-2" });
      const authorization = fakeAuthorization({ toUserId: "user-2" });
      const binding = fakeBinding({
        desktopDeviceId: desktop.id,
        petId: pet.id,
        bindingType: "authorized",
      });

      // Step 1: user-1 creates an invite for their pet
      mockDb._results.select = [[pet], [owner]];

      const createRes = await app.request(
        jsonReq("POST", "/api/devices/invite", {
          headers: headersOwner,
          body: { petId: "pet-1" },
        })
      );
      expect(createRes.status).toBe(200);
      const createJson = await createRes.json();
      expect(createJson.inviteCode).toBeDefined();

      // Step 2: user-2 accepts the invite
      mockDb._reset();
      mockDb._results.select = [
        [pet],
        [],
        [],
        [desktop],
      ];
      mockDb._results.insert = [
        [authorization],
        [binding],
      ];

      const useRes = await app.request(
        jsonReq("POST", `/api/devices/invite/${createJson.inviteCode}/accept`, {
          headers: headersOther,
        })
      );
      expect(useRes.status).toBe(201);
      const useJson = await useRes.json();
      expect(useJson.authorization).toBeDefined();
    });

    it("prevents owner from accepting their own invite", async () => {
      const headersOwner = await authHeader("user-1");
      const pet = fakePet();
      const owner = fakeUser();

      mockDb._results.select = [[pet], [owner]];

      const createRes = await app.request(
        jsonReq("POST", "/api/devices/invite", {
          headers: headersOwner,
          body: { petId: "pet-1" },
        })
      );
      const { inviteCode } = await createRes.json();

      const res = await app.request(
        jsonReq("POST", `/api/devices/invite/${inviteCode}/accept`, {
          headers: headersOwner,
        })
      );
      expect(res.status).toBe(400);
    });
  });

  // ===== Flow 4: 消息已读流程 =====

  describe("Message Read Flow", () => {
    it("fetches messages, reads one, then reads all", async () => {
      const headers = await authHeader("user-1");
      const msg1 = fakeMessage({ id: "m1", isRead: false });
      const msg2 = fakeMessage({ id: "m2", isRead: false });

      // Step 1: Get unread count (route uses result.length, not aggregation)
      mockDb._results.select = [[msg1, msg2]];

      const countRes = await app.request(
        jsonReq("GET", "/api/messages/unread-count", { headers })
      );
      expect(countRes.status).toBe(200);
      const countJson = await countRes.json();
      expect(countJson.count).toBe(2);

      // Step 2: List messages
      mockDb._reset();
      mockDb._results.select = [[msg1, msg2]];

      const listRes = await app.request(
        jsonReq("GET", "/api/messages", { headers })
      );
      expect(listRes.status).toBe(200);
      const listJson = await listRes.json();
      expect(listJson).toHaveLength(2);

      // Step 3: Read single message
      mockDb._reset();

      const readRes = await app.request(
        jsonReq("PUT", "/api/messages/m1/read", { headers })
      );
      expect(readRes.status).toBe(200);

      // Step 4: Read all
      mockDb._reset();

      const readAllRes = await app.request(
        jsonReq("PUT", "/api/messages/read-all", { headers })
      );
      expect(readAllRes.status).toBe(200);
    });
  });

  // ===== Flow 5: 桌面设备绑定宠物 =====

  describe("Desktop Device → Bind Pet", () => {
    it("creates desktop, then binds a pet to it", async () => {
      const headers = await authHeader("user-1");
      const desktop = fakeDesktop({ id: "desk-new" });
      const pet = fakePet();
      const binding = fakeBinding({ desktopDeviceId: "desk-new", petId: "pet-1" });

      // Step 1: Create desktop device
      mockDb._results.insert = [[desktop]];

      const deskRes = await app.request(
        jsonReq("POST", "/api/devices/desktops", {
          headers,
          body: { macAddress: "AA:11:BB:22:CC:33" },
        })
      );
      expect(deskRes.status).toBe(201);

      // Step 2: Bind pet to desktop
      mockDb._reset();
      mockDb._results.select = [[desktop], [pet], []]; // desktop check, pet ownership check, no active binding
      mockDb._results.insert = [[binding]];

      const bindRes = await app.request(
        jsonReq("POST", "/api/devices/desktops/desk-new/bind", {
          headers,
          body: { petId: "pet-1", bindingType: "owner" },
        })
      );
      expect(bindRes.status).toBe(201);
      const bindJson = await bindRes.json();
      expect(bindJson.binding.petId).toBe("pet-1");
    });
  });

  // ===== Flow 6: Cross-user security checks =====

  describe("Cross-user access prevention", () => {
    it("user-2 cannot access user-1's pet", async () => {
      mockDb._results.select = [[]]; // ownership fails

      const headers = await authHeader("user-2");
      const res = await app.request(
        jsonReq("GET", "/api/pets/pet-1", { headers })
      );
      expect(res.status).toBe(404);
    });

    it("user-2 cannot modify user-1's collar", async () => {
      mockDb._results.select = [[]]; // ownership fails

      const headers = await authHeader("user-2");
      const res = await app.request(
        jsonReq("PUT", "/api/devices/collars/collar-1", {
          headers,
          body: { name: "hacked" },
        })
      );
      expect(res.status).toBe(404);
    });

    it("user-2 cannot delete user-1's desktop", async () => {
      mockDb._results.select = [[]];

      const headers = await authHeader("user-2");
      const res = await app.request(
        jsonReq("DELETE", "/api/devices/desktops/desktop-1", { headers })
      );
      expect(res.status).toBe(404);
    });
  });
});
