import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { userSettings } from "../db/schema";
import { updateSettingsSchema } from "../validators/user-end";

const settingsRoute = new Hono();

const DEFAULT_SETTINGS = {
  messageEnabled: true,
  soundEnabled: true,
  theme: "system" as const,
  language: "zh-CN" as const,
};

function serializeSettings(
  settings?: typeof userSettings.$inferSelect | null,
) {
  return {
    messageEnabled: settings?.messageEnabled ?? DEFAULT_SETTINGS.messageEnabled,
    soundEnabled: settings?.soundEnabled ?? DEFAULT_SETTINGS.soundEnabled,
    theme: settings?.theme ?? DEFAULT_SETTINGS.theme,
    language: settings?.language ?? DEFAULT_SETTINGS.language,
  };
}

settingsRoute.get("/", async (c) => {
  const userId = c.get("userId" as never) as string;
  const [settings] = await db
    .select()
    .from(userSettings)
    .where(eq(userSettings.userId, userId));

  return c.json({ settings: serializeSettings(settings) });
});

settingsRoute.put("/", async (c) => {
  const userId = c.get("userId" as never) as string;
  const rawBody = await c.req.json().catch(() => null);
  const parsedBody = updateSettingsSchema.safeParse(rawBody);
  if (!parsedBody.success) {
    return c.json({ error: "Invalid request body" }, 400);
  }

  const [existing] = await db
    .select()
    .from(userSettings)
    .where(eq(userSettings.userId, userId));
  const nextSettings = {
    ...serializeSettings(existing),
    ...parsedBody.data,
  };

  const [saved] = await db
    .insert(userSettings)
    .values({
      userId,
      ...nextSettings,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: userSettings.userId,
      set: {
        ...nextSettings,
        updatedAt: new Date(),
      },
    })
    .returning();

  return c.json({ settings: serializeSettings(saved) });
});

export default settingsRoute;
