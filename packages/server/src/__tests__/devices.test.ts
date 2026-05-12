import { describe, it, expect, beforeEach } from "bun:test";
import { mockDb } from "./setup";
import {
  createApp,
  authHeader,
  jsonReq,
  fakeCollar,
  fakeDesktop,
  fakePet,
  fakeBinding,
} from "./helpers";

const app = createApp();

describe("Device Routes", () => {
  beforeEach(() => {
    mockDb._reset();
  });

  it("returns 401 without token", async () => {
    const res = await app.request(jsonReq("GET", "/api/devices/collars"));
    expect(res.status).toBe(401);
  });

  // ===== Collar devices =====

  describe("GET /api/devices/collars", () => {
    it("returns user's collars", async () => {
      mockDb._results.select = [[fakeCollar()]];

      const headers = await authHeader("user-1");
      const res = await app.request(
        jsonReq("GET", "/api/devices/collars", { headers })
      );
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.collars).toHaveLength(1);
    });
  });

  describe("POST /api/devices/collars/register", () => {
    it("creates a collar with normalized mac address", async () => {
      const collar = fakeCollar({ macAddress: "AABBCCDDEEFF" });
      mockDb._results.select = [[]];
      mockDb._results.insert = [[collar]];

      const headers = await authHeader("user-1");
      const res = await app.request(
        jsonReq("POST", "/api/devices/collars/register", {
          headers,
          body: { macAddress: "aa:bb:cc:dd:ee:ff" },
        })
      );

      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.collar.macAddress).toBe("AABBCCDDEEFF");
    });

    it("returns the existing collar when insert races with another request from the same user", async () => {
      const collar = fakeCollar({ macAddress: "AABBCCDDEEFF", userId: "user-1" });
      mockDb._results.select = [[], [collar]];
      mockDb._results.insert = [[]];

      const headers = await authHeader("user-1");
      const res = await app.request(
        jsonReq("POST", "/api/devices/collars/register", {
          headers,
          body: { macAddress: "AA-BB-CC-DD-EE-FF" },
        })
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.collar.id).toBe("collar-1");
    });

    it("finds an existing collar by chipId when BLE device id changes", async () => {
      const collar = fakeCollar({
        chipId: "chip-001",
        macAddress: "AABBCCDDEEFF",
        userId: "user-1",
      });
      mockDb._results.select = [[collar]];
      mockDb._results.update = [[collar]];

      const headers = await authHeader("user-1");
      const res = await app.request(
        jsonReq("POST", "/api/devices/collars/register", {
          headers,
          body: { chipId: "chip-001", macAddress: "volatile-ble-id" },
        })
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.collar.id).toBe("collar-1");
      expect((mockDb._calls.update[0] as any).set).toMatchObject({
        chipId: "chip-001",
      });
    });
  });

  describe("POST /api/devices/collars", () => {
    it("creates a collar", async () => {
      const collar = fakeCollar();
      mockDb._results.insert = [[collar]];

      const headers = await authHeader("user-1");
      const res = await app.request(
        jsonReq("POST", "/api/devices/collars", {
          headers,
          body: { macAddress: "AA:BB:CC:DD:EE:FF" },
        })
      );
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.collar.macAddress).toBe("AA:BB:CC:DD:EE:FF");
    });
  });

  describe("PUT /api/devices/collars/:id", () => {
    it("updates own collar", async () => {
      const existing = fakeCollar();
      const updated = fakeCollar({ name: "Updated Collar" });
      mockDb._results.select = [[existing]];
      mockDb._results.update = [[updated]];

      const headers = await authHeader("user-1");
      const res = await app.request(
        jsonReq("PUT", "/api/devices/collars/collar-1", {
          headers,
          body: { name: "Updated Collar" },
        })
      );
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.collar.name).toBe("Updated Collar");
    });

    it("returns 404 for another user's collar", async () => {
      mockDb._results.select = [[]];

      const headers = await authHeader("user-2");
      const res = await app.request(
        jsonReq("PUT", "/api/devices/collars/collar-1", {
          headers,
          body: { name: "Hack" },
        })
      );
      expect(res.status).toBe(404);
    });

    it("requires explicit replace when binding a collar to another pet", async () => {
      mockDb._results.select = [
        [fakeCollar({ petId: "pet-1" })],
        [fakePet({ id: "pet-2" })],
      ];

      const headers = await authHeader("user-1");
      const res = await app.request(
        jsonReq("PUT", "/api/devices/collars/collar-1", {
          headers,
          body: { petId: "pet-2" },
        })
      );

      expect(res.status).toBe(409);
      expect(mockDb._calls.update).toHaveLength(0);
      const json = await res.json();
      expect(json.requiresReplace).toBe(true);
    });

    it("allows replacing a collar pet when explicitly confirmed", async () => {
      const updated = fakeCollar({ petId: "pet-2" });
      mockDb._results.select = [
        [fakeCollar({ petId: "pet-1" })],
        [fakePet({ id: "pet-2" })],
      ];
      mockDb._results.update = [[updated]];

      const headers = await authHeader("user-1");
      const res = await app.request(
        jsonReq("PUT", "/api/devices/collars/collar-1", {
          headers,
          body: { petId: "pet-2", replace: true },
        })
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.collar.petId).toBe("pet-2");
    });
  });

  describe("DELETE /api/devices/collars/:id", () => {
    it("deletes own collar", async () => {
      mockDb._results.select = [[fakeCollar()]];
      mockDb._results.update = [[fakeCollar({ userId: null, petId: null, claimStatus: "available" })]];

      const headers = await authHeader("user-1");
      const res = await app.request(
        jsonReq("DELETE", "/api/devices/collars/collar-1", { headers })
      );
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
    });

    it("returns 404 for another user's collar", async () => {
      mockDb._results.select = [[]];

      const headers = await authHeader("user-2");
      const res = await app.request(
        jsonReq("DELETE", "/api/devices/collars/collar-1", { headers })
      );
      expect(res.status).toBe(404);
    });
  });

  // ===== Desktop devices =====

  describe("GET /api/devices/desktops", () => {
    it("returns user's desktops with active bindings", async () => {
      mockDb._results.select = [[
        {
          desktop: fakeDesktop(),
          bindingId: "binding-1",
          bindingPetId: "pet-1",
          bindingType: "owner",
        },
        {
          desktop: fakeDesktop(),
          bindingId: "binding-2",
          bindingPetId: "pet-2",
          bindingType: "authorized",
        },
      ]];

      const headers = await authHeader("user-1");
      const res = await app.request(
        jsonReq("GET", "/api/devices/desktops", { headers })
      );
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.desktops).toHaveLength(1);
      expect(json.desktops[0].bindings).toEqual([
        {
          id: "binding-1",
          petId: "pet-1",
          bindingType: "owner",
        },
        {
          id: "binding-2",
          petId: "pet-2",
          bindingType: "authorized",
        },
      ]);
    });

    it("returns stale online desktops as offline after 10 minutes without heartbeat", async () => {
      mockDb._results.select = [[
        {
          desktop: fakeDesktop({
            status: "online",
            lastOnlineAt: new Date(Date.now() - 11 * 60 * 1000),
          }),
          bindingId: null,
          bindingPetId: null,
          bindingType: null,
        },
      ]];

      const headers = await authHeader("user-1");
      const res = await app.request(
        jsonReq("GET", "/api/devices/desktops", { headers })
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.desktops[0].status).toBe("offline");
    });
  });

  describe("POST /api/devices/desktops", () => {
    it("creates a desktop", async () => {
      mockDb._results.insert = [[fakeDesktop()]];

      const headers = await authHeader("user-1");
      const res = await app.request(
        jsonReq("POST", "/api/devices/desktops", {
          headers,
          body: { macAddress: "11:22:33:44:55:66" },
        })
      );
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.desktop.macAddress).toBe("11:22:33:44:55:66");
    });
  });

  describe("POST /api/devices/desktops/register", () => {
    it("creates a desktop with normalized mac address", async () => {
      const desktop = fakeDesktop({ macAddress: "112233445566" });
      mockDb._results.select = [[]];
      mockDb._results.insert = [[desktop]];

      const headers = await authHeader("user-1");
      const res = await app.request(
        jsonReq("POST", "/api/devices/desktops/register", {
          headers,
          body: { macAddress: "11:22:33:44:55:66" },
        })
      );

      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.desktop.macAddress).toBe("112233445566");
    });
  });

  describe("DELETE /api/devices/desktops/:id", () => {
    it("deletes own desktop", async () => {
      mockDb._results.select = [[fakeDesktop()]];
      mockDb._results.update = [[], [fakeDesktop({ userId: null, claimStatus: "available" })]];

      const headers = await authHeader("user-1");
      const res = await app.request(
        jsonReq("DELETE", "/api/devices/desktops/desktop-1", { headers })
      );
      expect(res.status).toBe(200);
    });

    it("returns 404 for another user's desktop", async () => {
      mockDb._results.select = [[]];

      const headers = await authHeader("user-2");
      const res = await app.request(
        jsonReq("DELETE", "/api/devices/desktops/desktop-1", { headers })
      );
      expect(res.status).toBe(404);
    });
  });

  describe("GET /api/devices", () => {
    it("returns enhanced device summaries", async () => {
      mockDb._results.select = [
        [fakeCollar({ usageDurationMinutes: 180, lastOnlineAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000) })],
        [],
      ];

      const headers = await authHeader("user-1");
      const res = await app.request(jsonReq("GET", "/api/devices", { headers }));

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.devices).toHaveLength(1);
      expect(json.devices[0].usageDurationMinutes).toBe(180);
      expect(json.devices[0].isInactive).toBe(true);
      expect(json.devices[0].claimStatus).toBe("occupied");
    });

    it("derives desktop offline state from a 10 minute heartbeat timeout", async () => {
      mockDb._results.select = [
        [],
        [
          {
            desktop: fakeDesktop({
              status: "online",
              lastOnlineAt: new Date(Date.now() - 11 * 60 * 1000),
            }),
            bindingId: null,
            bindingPetId: null,
            bindingType: null,
          },
        ],
      ];

      const headers = await authHeader("user-1");
      const res = await app.request(jsonReq("GET", "/api/devices", { headers }));

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.devices[0].deviceType).toBe("desktop");
      expect(json.devices[0].status).toBe("offline");
    });

    it("keeps recently heartbeating desktops online", async () => {
      mockDb._results.select = [
        [],
        [
          {
            desktop: fakeDesktop({
              status: "online",
              lastOnlineAt: new Date(Date.now() - 9 * 60 * 1000),
            }),
            bindingId: null,
            bindingPetId: null,
            bindingType: null,
          },
        ],
      ];

      const headers = await authHeader("user-1");
      const res = await app.request(jsonReq("GET", "/api/devices", { headers }));

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.devices[0].status).toBe("online");
    });
  });

  describe("GET /api/devices/firmware/status", () => {
    it("returns firmware comparison status", async () => {
      mockDb._results.select = [
        [fakeCollar({ firmwareVersion: "1.0.0" })],
        [],
        [
          {
            id: "release-1",
            deviceType: "collar",
            version: "1.1.0",
            releaseNotes: "Bug fixes",
            releasedAt: new Date(),
          },
        ],
      ];

      const headers = await authHeader("user-1");
      const res = await app.request(
        jsonReq("GET", "/api/devices/firmware/status", { headers })
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.devices[0]).toMatchObject({
        deviceId: "collar-1",
        latestVersion: "1.1.0",
        hasUpdate: true,
        upgradeStatus: "idle",
      });
    });
  });

  describe("POST /api/devices/:deviceType/:deviceId/firmware/upgrade", () => {
    it("marks collar upgrade status as pending", async () => {
      mockDb._results.select = [[fakeCollar()]];
      mockDb._results.update = [[]];

      const headers = await authHeader("user-1");
      const res = await app.request(
        jsonReq("POST", "/api/devices/collar/collar-1/firmware/upgrade", {
          headers,
        })
      );

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        accepted: true,
        upgradeStatus: "pending",
      });
    });
  });

  describe("DELETE /api/devices/:type/:id", () => {
    it("returns 400 for invalid device type", async () => {
      const headers = await authHeader("user-1");
      const res = await app.request(
        jsonReq("DELETE", "/api/devices/unknown/device-1", { headers })
      );

      expect(res.status).toBe(400);
    });
  });

  // ===== Desktop-pet binding =====

  describe("POST /api/devices/desktops/:id/bind", () => {
    it("binds a pet to a desktop", async () => {
      // select 1: desktop check, select 2: pet ownership check, select 3: no existing binding
      mockDb._results.select = [[fakeDesktop()], [fakePet()], []];
      mockDb._results.insert = [[fakeBinding()]];

      const headers = await authHeader("user-1");
      const res = await app.request(
        jsonReq("POST", "/api/devices/desktops/desktop-1/bind", {
          headers,
          body: { petId: "pet-1", bindingType: "owner" },
        })
      );
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.binding.petId).toBe("pet-1");
    });

    it("returns the existing active binding instead of creating duplicates", async () => {
      const binding = fakeBinding();
      mockDb._results.select = [[fakeDesktop()], [fakePet()], [binding]];

      const headers = await authHeader("user-1");
      const res = await app.request(
        jsonReq("POST", "/api/devices/desktops/desktop-1/bind", {
          headers,
          body: { petId: "pet-1", bindingType: "owner" },
        })
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.binding.id).toBe("binding-1");
    });

    it("returns 404 when desktop not owned by user", async () => {
      mockDb._results.select = [[]]; // desktop not found

      const headers = await authHeader("user-2");
      const res = await app.request(
        jsonReq("POST", "/api/devices/desktops/desktop-1/bind", {
          headers,
          body: { petId: "pet-1", bindingType: "owner" },
        })
      );
      expect(res.status).toBe(404);
    });

    it("returns 404 when pet not owned by user", async () => {
      // desktop found, pet not found
      mockDb._results.select = [[fakeDesktop({ userId: "user-2" })], []];

      const headers = await authHeader("user-2");
      const res = await app.request(
        jsonReq("POST", "/api/devices/desktops/desktop-1/bind", {
          headers,
          body: { petId: "pet-1", bindingType: "owner" },
        })
      );
      expect(res.status).toBe(404);
    });
  });

  describe("DELETE /api/devices/desktops/:id/bind/:bindingId", () => {
    it("soft-deletes when desktop is owned by user", async () => {
      mockDb._results.select = [[fakeDesktop()]];
      mockDb._results.update = [[fakeBinding({ unboundAt: new Date() })]];

      const headers = await authHeader("user-1");
      const res = await app.request(
        jsonReq("DELETE", "/api/devices/desktops/desktop-1/bind/binding-1", {
          headers,
        })
      );
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
    });

    it("returns 404 when desktop not owned by user", async () => {
      mockDb._results.select = [[]];

      const headers = await authHeader("user-2");
      const res = await app.request(
        jsonReq("DELETE", "/api/devices/desktops/desktop-1/bind/binding-1", {
          headers,
        })
      );
      expect(res.status).toBe(404);
    });
  });
});
