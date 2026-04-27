import { Hono } from "hono";
import { ALLOWED_IMAGE_CONTENT_TYPES, createPresignedPutUrl } from "../../utils/storage";

const uploadsRoute = new Hono();

type AllowedContentType = keyof typeof ALLOWED_IMAGE_CONTENT_TYPES;

function isAllowedContentType(value: unknown): value is AllowedContentType {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(ALLOWED_IMAGE_CONTENT_TYPES, value)
  );
}

uploadsRoute.post("/uploads/presign", async (c) => {
  const body = await c.req.json<{ contentType?: unknown }>();

  if (!isAllowedContentType(body.contentType)) {
    return c.json({ error: "Unsupported contentType" }, 400);
  }

  const presign = await createPresignedPutUrl({
    contentType: body.contentType,
    scope: "admin",
  });

  return c.json(presign);
});

export default uploadsRoute;
