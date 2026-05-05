import { describe, expect, it } from "bun:test";
import { extractFirstJpegFrame } from "../utils/mjpeg";

describe("extractFirstJpegFrame", () => {
  it("extracts the first jpeg frame from an mjpeg buffer", () => {
    const jpegFrame = Buffer.from([0xff, 0xd8, 0x01, 0x02, 0x03, 0xff, 0xd9]);
    const secondFrame = Buffer.from([0xff, 0xd8, 0x09, 0x08, 0xff, 0xd9]);
    const buffer = Buffer.concat([Buffer.from("header"), jpegFrame, Buffer.from("middle"), secondFrame]);

    const result = extractFirstJpegFrame(buffer);

    expect(result).not.toBeNull();
    expect(Buffer.compare(result!, jpegFrame)).toBe(0);
  });

  it("returns null when no jpeg markers exist", () => {
    const result = extractFirstJpegFrame(Buffer.from("not-a-jpeg-stream"));
    expect(result).toBeNull();
  });
});
