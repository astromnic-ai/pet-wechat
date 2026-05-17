const VERSION_RE = /^v(\d+)\.(\d+)\.(\d+)$/;

type ParsedVersion = [number, number, number];

function parse(version: string): ParsedVersion | null {
  const match = VERSION_RE.exec(version);
  if (!match) {
    return null;
  }

  const parts = match.slice(1).map((part) => Number(part));
  if (parts.some((part) => !Number.isSafeInteger(part) || part < 0)) {
    return null;
  }

  return parts as ParsedVersion;
}

export function isValid(version: string): boolean {
  return parse(version) !== null;
}

export function compare(a: string, b: string): number {
  const parsedA = parse(a);
  const parsedB = parse(b);

  if (!parsedA || !parsedB) {
    throw new Error(`Invalid semantic version: ${!parsedA ? a : b}`);
  }

  for (let i = 0; i < parsedA.length; i += 1) {
    const delta = parsedA[i] - parsedB[i];
    if (delta !== 0) {
      return delta > 0 ? 1 : -1;
    }
  }

  return 0;
}
