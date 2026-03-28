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
  fakeMessage,
} from "./helpers";

const app = createApp();

describe("Debug Routes", () => {
  beforeEach(() => {
    mockDb._reset();
  });

  describe("GET /api/debug/collect-data", () => {
    it("returns 401 without token", async () => {
      const res = await app.request(jsonReq("GET", "/api/debug/collect-data"));
      expect(res.status).toBe(401);
    });

    it("returns aggregated user data with summary", async () => {
      const user = fakeUser();
      const pet = fakePet();
      const collar = fakeCollar();
      const desktop = fakeDesktop();
      const msg = fakeMessage();

      // select sequence: user, pets, collars, desktops, bindings, avatars, behaviors,
      // then sentAuth, recvAuth, messages
      mockDb._results.select = [
        [user],       // user
        [pet],        // pets
        [collar],     // collars
        [desktop],    // desktops
        [],           // bindings
        [],           // avatars
        [],           // behaviors
        [],           // sentAuth
        [],           // recvAuth
        [msg],        // messages
      ];

      const headers = await authHeader("user-1");
      const res = await app.request(
        jsonReq("GET", "/api/debug/collect-data", { headers })
      );
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.user).toBeDefined();
      expect(json.pets).toHaveLength(1);
      expect(json.collars).toHaveLength(1);
      expect(json.desktops).toHaveLength(1);
      expect(json.messages).toHaveLength(1);
      expect(json.summary.petCount).toBe(1);
      expect(json.summary.collarCount).toBe(1);
      expect(json.summary.messageCount).toBe(1);
    });

    it("aggregates data across multiple pets", async () => {
      const user = fakeUser();
      const pet1 = fakePet({ id: "pet-1" });
      const pet2 = fakePet({ id: "pet-2", name: "Lucky" });
      const collar = fakeCollar();
      const desktop = fakeDesktop();

      // select sequence: user, pets(2), collars, desktops, bindings, avatars, behaviors,
      // sentAuth, recvAuth, messages
      mockDb._results.select = [
        [user],           // user
        [pet1, pet2],     // pets
        [collar],         // collars
        [desktop],        // desktops
        [{ id: "b1" }],   // bindings
        [{ id: "av1" }],  // avatars
        [{ id: "bh1" }],  // behaviors
        [],               // sentAuth
        [],               // recvAuth
        [],               // messages
      ];

      const headers = await authHeader("user-1");
      const res = await app.request(
        jsonReq("GET", "/api/debug/collect-data", { headers })
      );
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.summary.petCount).toBe(2);
      expect(json.summary.bindingCount).toBe(1);
      expect(json.summary.avatarCount).toBe(1);
      expect(json.summary.behaviorCount).toBe(1);
    });

    it("returns empty data for user with nothing", async () => {
      const user = fakeUser();
      // user, empty pets, empty collars, empty desktops,
      // sentAuth, recvAuth, messages
      mockDb._results.select = [
        [user], [], [], [],
        [], [], [],
      ];

      const headers = await authHeader("user-1");
      const res = await app.request(
        jsonReq("GET", "/api/debug/collect-data", { headers })
      );
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.summary.petCount).toBe(0);
    });
  });
});
