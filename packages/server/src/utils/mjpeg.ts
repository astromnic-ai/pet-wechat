export function extractFirstJpegFrame(buffer: Buffer): Buffer | null {
  let start = -1;

  for (let index = 0; index < buffer.length - 1; index += 1) {
    if (buffer[index] === 0xff && buffer[index + 1] === 0xd8) {
      start = index;
      break;
    }
  }

  if (start === -1) {
    return null;
  }

  for (let index = start + 2; index < buffer.length - 1; index += 1) {
    if (buffer[index] === 0xff && buffer[index + 1] === 0xd9) {
      return buffer.subarray(start, index + 2);
    }
  }

  return null;
}
