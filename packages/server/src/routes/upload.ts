import { Hono } from "hono";
import { UploadError, parseUploadFile, saveUploadedFile } from "../utils/uploads";

const uploadRoute = new Hono();

uploadRoute.post("/", async (c) => {
  try {
    const userId = c.get("userId" as never) as string;
    const body = await c.req.parseBody();
    const uploadedFile = parseUploadFile(body["file"]);
    const result = await saveUploadedFile(userId, uploadedFile);
    return c.json(result, 201);
  } catch (e) {
    if (e instanceof UploadError) {
      return c.json({ error: e.message }, e.status);
    }

    console.error("Upload failed:", e);
    return c.json({ error: "文件上传失败，请稍后重试" }, 503);
  }
});

export default uploadRoute;
