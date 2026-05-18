import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "../db";
import { firmwareVersions, internalDevices } from "../db/schema";
import { compare } from "./version-cmp";

export async function resolveFirmwareVersion(opts: {
  chipId: string;
  currentFw: string;
}) {
  const rows = await db
    .select()
    .from(firmwareVersions)
    .where(
      and(
        inArray(firmwareVersions.state, ["released", "internal"]),
        isNull(firmwareVersions.quarantinedAt),
      ),
    );

  const internalRows = rows.filter((row) => row.state === "internal");
  let isInternalDevice = false;
  if (internalRows.length > 0) {
    const [device] = await db
      .select({ chipId: internalDevices.chipId })
      .from(internalDevices)
      .where(eq(internalDevices.chipId, opts.chipId))
      .limit(1);
    isInternalDevice = Boolean(device);
  }

  const candidates = rows
    .filter((row) => row.state !== "internal" || isInternalDevice)
    .filter((row) => compare(row.version, opts.currentFw) > 0)
    .sort((a, b) => compare(b.version, a.version));

  return candidates[0] ?? null;
}
