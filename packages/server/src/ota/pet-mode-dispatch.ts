import type { PetModeMqttPayload } from "shared";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "../db";
import { desktopDevices, desktopPetBindings } from "../db/schema";
import { isConnected, publishPetMode } from "./mqtt-client";

export async function dispatchPetModeToBoundDesktops(
  petId: string,
  payload: PetModeMqttPayload,
) {
  if (!isConnected()) {
    console.error("[pet-mode] mqtt client is not connected, skip publish", { petId });
    return;
  }

  const bindings = await db
    .select({
      chipId: desktopDevices.chipId,
    })
    .from(desktopPetBindings)
    .innerJoin(
      desktopDevices,
      eq(desktopDevices.id, desktopPetBindings.desktopDeviceId),
    )
    .where(
      and(
        eq(desktopPetBindings.petId, petId),
        isNull(desktopPetBindings.unboundAt),
      ),
    );

  const chipIds = Array.from(
    new Set(
      bindings
        .map((item) => item.chipId?.trim() ?? "")
        .filter((chipId) => chipId.length > 0),
    ),
  );

  await Promise.all(
    chipIds.map((chipId) => publishPetMode(chipId, payload)),
  );
}
