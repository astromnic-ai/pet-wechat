import { Hono } from "hono";
import { sql, type SQL } from "drizzle-orm";
import type {
  AvatarStatus,
  CustomizationTask,
  CustomizationTaskCategoryStatus,
  Species,
} from "shared";
import { BASIC_ACTIONS, FUN_ACTIONS } from "shared";
import { db } from "../../db";
import { buildPageResponse, parsePagination } from "../../utils/pagination";

const customizationRoute = new Hono();

const BASE_ACTION_TOTAL = BASIC_ACTIONS.length;
const PERSONALIZED_ACTION_TOTAL = FUN_ACTIONS.length;
const TOTAL_ACTION_TOTAL = BASE_ACTION_TOTAL + PERSONALIZED_ACTION_TOTAL;
const VALID_AVATAR_STATUSES = new Set<AvatarStatus>([
  "pending",
  "processing",
  "done",
  "failed",
  "approved",
  "rejected",
]);
const VALID_CATEGORIES = new Set(["all", "base", "personalized"] as const);

type CustomizationCategory = "all" | "base" | "personalized";

type CustomizationListFilters = {
  keyword: string;
  statuses: AvatarStatus[];
  category: CustomizationCategory;
};

type RawCustomizationTaskRow = {
  avatar_id: string;
  pet_id: string;
  pet_name: string;
  pet_species: Species;
  user_id: string;
  user_nickname: string;
  status: AvatarStatus;
  default_preview_url: string | null;
  base_action_count: number | string | null;
  personalized_action_count: number | string | null;
  total_action_count: number | string | null;
  category_status: CustomizationTaskCategoryStatus;
  is_new_today: boolean | string | number | null;
  created_at: Date | string;
  reviewed_at: Date | string | null;
};

type RawCountRow = {
  total: number | string;
};

function toInt(value: number | string | null | undefined, fallback = 0): number {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "string" && value.length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  return fallback;
}

function toBoolean(value: boolean | string | number | null | undefined): boolean {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return value !== 0;
  }

  if (typeof value === "string") {
    const normalized = value.toLowerCase();
    return normalized === "true" || normalized === "t" || normalized === "1";
  }

  return false;
}

function toIsoString(value: Date | string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  return value instanceof Date ? value.toISOString() : value;
}

function toRequiredIsoString(value: Date | string): string {
  return toIsoString(value) ?? new Date(0).toISOString();
}

async function executeRows<T extends Record<string, unknown>>(query: SQL): Promise<T[]> {
  return await db.execute(query) as unknown as T[];
}

function parseStatuses(rawStatus: string | undefined): AvatarStatus[] | null {
  if (!rawStatus) {
    return [];
  }

  const statuses = rawStatus
    .split(",")
    .map((value) => value.trim())
    .filter((value): value is AvatarStatus => value.length > 0);

  if (statuses.some((value) => !VALID_AVATAR_STATUSES.has(value))) {
    return null;
  }

  return Array.from(new Set(statuses));
}

function getCustomizationTaskCtes() {
  return sql`
    WITH action_stats_by_avatar AS (
      SELECT
        paa.pet_avatar_id,
        COUNT(*) FILTER (
          WHERE paa.action_type = ANY(${BASIC_ACTIONS}::text[])
        )::int AS base_action_count,
        COUNT(*) FILTER (
          WHERE paa.action_type = ANY(${FUN_ACTIONS}::text[])
        )::int AS personalized_action_count
      FROM pet_avatar_actions paa
      GROUP BY paa.pet_avatar_id
    ),
    first_action_preview AS (
      SELECT DISTINCT ON (paa.pet_avatar_id)
        paa.pet_avatar_id,
        NULLIF(paa.image_url, '') AS first_action_image_url
      FROM pet_avatar_actions paa
      WHERE NULLIF(paa.image_url, '') IS NOT NULL
      ORDER BY paa.pet_avatar_id, paa.sort_order ASC, paa.id ASC
    ),
    task_rows AS (
      SELECT
        pa.id AS avatar_id,
        pa.pet_id,
        p.name AS pet_name,
        p.species AS pet_species,
        u.id AS user_id,
        u.nickname AS user_nickname,
        pa.status,
        COALESCE(
          NULLIF(pa.source_image_url, ''),
          fap.first_action_image_url
        ) AS default_preview_url,
        COALESCE(asa.base_action_count, 0)::int AS base_action_count,
        COALESCE(asa.personalized_action_count, 0)::int AS personalized_action_count,
        (
          COALESCE(asa.base_action_count, 0) +
          COALESCE(asa.personalized_action_count, 0)
        )::int AS total_action_count,
        CASE
          WHEN COALESCE(asa.base_action_count, 0) = 0
            AND COALESCE(asa.personalized_action_count, 0) = 0
            THEN 'empty'
          WHEN COALESCE(asa.base_action_count, 0) >= ${BASE_ACTION_TOTAL}
            AND COALESCE(asa.personalized_action_count, 0) >= ${PERSONALIZED_ACTION_TOTAL}
            THEN 'all_done'
          WHEN COALESCE(asa.base_action_count, 0) >= ${BASE_ACTION_TOTAL}
            THEN 'base_done'
          ELSE 'partial'
        END::text AS category_status,
        (pa.created_at >= date_trunc('day', now())) AS is_new_today,
        pa.created_at,
        pa.reviewed_at
      FROM pet_avatars pa
      INNER JOIN pets p ON p.id = pa.pet_id
      INNER JOIN users u ON u.id = p.user_id
      LEFT JOIN action_stats_by_avatar asa ON asa.pet_avatar_id = pa.id
      LEFT JOIN first_action_preview fap ON fap.pet_avatar_id = pa.id
    )
  `;
}

function buildCustomizationWhereClause(filters: CustomizationListFilters) {
  const conditions: SQL[] = [];

  if (filters.keyword) {
    const keyword = `%${filters.keyword}%`;
    conditions.push(sql`(
      task_rows.pet_name ILIKE ${keyword}
      OR task_rows.user_nickname ILIKE ${keyword}
    )`);
  }

  if (filters.statuses.length > 0) {
    conditions.push(
      sql`task_rows.status IN (${sql.join(filters.statuses.map((status) => sql`${status}`), sql`, `)})`,
    );
  }

  if (filters.category === "base") {
    conditions.push(sql`task_rows.base_action_count > 0`);
  } else if (filters.category === "personalized") {
    conditions.push(sql`task_rows.personalized_action_count > 0`);
  }

  if (conditions.length === 0) {
    return sql``;
  }

  return sql`WHERE ${sql.join(conditions, sql` AND `)}`;
}

function toCustomizationTask(row: RawCustomizationTaskRow): CustomizationTask {
  return {
    avatarId: row.avatar_id,
    petId: row.pet_id,
    petName: row.pet_name,
    petSpecies: row.pet_species,
    userId: row.user_id,
    userNickname: row.user_nickname,
    status: row.status,
    defaultPreviewUrl: row.default_preview_url,
    baseActionCount: toInt(row.base_action_count),
    personalizedActionCount: toInt(row.personalized_action_count),
    totalActionCount: toInt(row.total_action_count),
    baseActionTotal: BASE_ACTION_TOTAL,
    personalizedActionTotal: PERSONALIZED_ACTION_TOTAL,
    totalActionTotal: TOTAL_ACTION_TOTAL,
    categoryStatus: row.category_status,
    isNewToday: toBoolean(row.is_new_today),
    createdAt: toRequiredIsoString(row.created_at),
    reviewedAt: toIsoString(row.reviewed_at),
  };
}

customizationRoute.get("/customization/tasks", async (c) => {
  const pagination = parsePagination(c);
  const keyword = c.req.query("keyword")?.trim() ?? "";
  const statuses = parseStatuses(c.req.query("status"));
  const category = (c.req.query("category")?.trim() ?? "all") as CustomizationCategory;

  if (!statuses) {
    return c.json({ error: "Invalid status" }, 400);
  }

  if (!VALID_CATEGORIES.has(category)) {
    return c.json({ error: "Invalid category" }, 400);
  }

  const filters: CustomizationListFilters = {
    keyword,
    statuses,
    category,
  };
  const whereClause = buildCustomizationWhereClause(filters);
  const baseCtes = getCustomizationTaskCtes();

  const [itemsRows, countRows] = await Promise.all([
    executeRows<RawCustomizationTaskRow>(sql`
      ${baseCtes}
      SELECT *
      FROM task_rows
      ${whereClause}
      ORDER BY task_rows.created_at DESC, task_rows.avatar_id DESC
      LIMIT ${pagination.pageSize} OFFSET ${pagination.offset}
    `),
    executeRows<RawCountRow>(sql`
      ${baseCtes}
      SELECT COUNT(*)::int AS total
      FROM task_rows
      ${whereClause}
    `),
  ]);

  const items = itemsRows.map(toCustomizationTask);
  const total = toInt(countRows[0]?.total);

  return c.json({
    ...buildPageResponse(items, total, pagination),
    baseActionTotal: BASE_ACTION_TOTAL,
    personalizedActionTotal: PERSONALIZED_ACTION_TOTAL,
    totalActionTotal: TOTAL_ACTION_TOTAL,
  });
});

export default customizationRoute;
