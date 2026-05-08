import { describe, expect, it } from "bun:test";
import { extractFirstJpegFrame } from "../utils/mjpeg";

describe("extractFirstJpegFrame", () => {
  it("extracts the first complete JPEG frame from multipart-like MJPEG bytes", () => {
    const frame = Buffer.from([0xff, 0xd8, 1, 2, 3, 0xff, 0xd9]);
    const buffer = Buffer.concat([
      Buffer.from("--frame\r\nContent-Type: image/jpeg\r\n\r\n"),
      frame,
      Buffer.from("\r\n--frame\r\n"),
      Buffer.from([0xff, 0xd8, 4, 5, 0xff, 0xd9]),
    ]);

    expect(extractFirstJpegFrame(buffer)?.equals(frame)).toBe(true);
  });

  it("returns null when no complete JPEG frame exists", () => {
    expect(extractFirstJpegFrame(Buffer.from([0xff, 0xd8, 1, 2, 3]))).toBeNull();
  });
});
