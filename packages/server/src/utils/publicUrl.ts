export function getRequestOrigin(requestUrl: string) {
  try {
    return new URL(requestUrl).origin;
  } catch {
    return "";
  }
}

export function rewriteLocalAssetUrl(url: string | null | undefined, requestUrl: string) {
  if (!url) return url ?? null;

  try {
    const parsed = new URL(url);
    const isLocalHost =
      parsed.hostname === "localhost" ||
      parsed.hostname === "127.0.0.1" ||
      parsed.hostname === "::1";

    if (!isLocalHost) {
      return url;
    }

    if (!parsed.pathname.startsWith("/storage/") && !parsed.pathname.startsWith("/static/")) {
      return url;
    }

    const origin = getRequestOrigin(requestUrl);
    return origin ? `${origin}${parsed.pathname}` : url;
  } catch {
    return url;
  }
}
