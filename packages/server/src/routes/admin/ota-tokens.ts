import { Hono } from "hono";
import { ok, fail } from "../../ota/errors";
import { createOtaToken, listOtaTokens, revokeOtaToken } from "../../ota/tokens";

const otaTokensRoute = new Hono();

otaTokensRoute.get("/", async (c) => {
  return ok(c, { items: await listOtaTokens() });
});

otaTokensRoute.post("/", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    return fail(c, 400, "bad_request", "name 不能为空");
  }

  const { token, row } = await createOtaToken({
    name,
    createdBy: c.get("otaAuth")?.actor ?? "system",
  });

  return ok(c, {
    token,
    item: {
      id: row.id,
      name: row.name,
      tokenPrefix: row.tokenPrefix,
      createdAt: row.createdAt,
      createdBy: row.createdBy,
      revokedAt: row.revokedAt,
      lastUsedAt: row.lastUsedAt,
    },
  });
});

otaTokensRoute.delete("/:id", async (c) => {
  const row = await revokeOtaToken(c.req.param("id"));
  if (!row) {
    return fail(c, 404, "not_found", "token 不存在");
  }
  return ok(c, { id: row.id });
});

export default otaTokensRoute;
