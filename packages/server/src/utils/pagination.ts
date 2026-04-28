import type { Context } from "hono";

export interface PageParams {
  page: number;
  pageSize: number;
  offset: number;
}

function parsePositiveInt(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  const normalized = Math.trunc(parsed);
  return normalized > 0 ? normalized : fallback;
}

export function parsePagination(c: Context): PageParams {
  const page = parsePositiveInt(c.req.query("page"), 1);
  const requestedPageSize = parsePositiveInt(c.req.query("pageSize"), 20);
  const pageSize = Math.min(100, requestedPageSize);

  return {
    page,
    pageSize,
    offset: (page - 1) * pageSize,
  };
}

export function buildPageResponse<T>(
  items: T[],
  total: number,
  params: Pick<PageParams, "page" | "pageSize">,
) {
  return {
    items,
    total,
    page: params.page,
    pageSize: params.pageSize,
  };
}
