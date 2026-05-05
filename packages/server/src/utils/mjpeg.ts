function findMarker(buffer: Buffer, first: number, second: number, startIndex: number) {
  for (let index = startIndex; index < buffer.length - 1; index += 1) {
    if (buffer[index] === first && buffer[index + 1] === second) {
      return index;
    }
  }

  return -1;
}

export function extractFirstJpegFrame(buffer: Buffer) {
  const start = findMarker(buffer, 0xff, 0xd8, 0);
  if (start < 0) {
    return null;
  }

  const end = findMarker(buffer, 0xff, 0xd9, start + 2);
  if (end < 0) {
    return null;
  }

  return buffer.subarray(start, end + 2);
}
