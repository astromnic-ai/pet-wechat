import { Hono } from "hono";
import { contentSlugSchema } from "../validators/user-end";
import { readContentPage } from "../utils/content";

const contentRoute = new Hono();

contentRoute.get("/:slug", async (c) => {
  const parsedSlug = contentSlugSchema.safeParse(c.req.param("slug"));
  if (!parsedSlug.success) {
    return c.json({ error: "Content not found" }, 404);
  }

  const page = await readContentPage(parsedSlug.data);
  if (!page) {
    return c.json({ error: "Content not found" }, 404);
  }

  return c.json(page);
});

export default contentRoute;
