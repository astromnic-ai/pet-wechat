#!/usr/bin/env bun

import { inArray, like, or } from "drizzle-orm";
import {
  ALL_ACTIONS,
  DEFAULT_FREE_BENEFITS,
  type MembershipBenefit,
  type MembershipLevel,
  type MembershipStatus,
} from "shared";
import { db } from "../src/db";
import {
  memberships,
  petAvatarActions,
  petAvatars,
  petBehaviors,
  pets,
  users,
  desktopPetBindings,
  deviceAuthorizations,
  collarDevices,
  desktopDevices,
} from "../src/db/schema";

const SEED_OPENID_PREFIX = "seed-demo:";
const SEED_USER_COUNT = 20;
const SEED_PET_COUNT = 30;
const SEED_COLLAR_COUNT = 25;
const SEED_DESKTOP_COUNT = 15;
const SEED_AVATAR_COUNT = 40;
const SEED_MEMBERSHIP_COUNT = 15;

type DeviceStatus = "online" | "offline" | "pairing";
type ClaimStatus = "occupied" | "available" | "reset_required";
type UpgradeStatus = "idle" | "pending" | "success" | "failed";
type Species = "cat" | "dog";
type Gender = "male" | "female" | "unknown";
type AvatarStatus =
  | "pending"
  | "processing"
  | "done"
  | "failed"
  | "approved"
  | "rejected";
type BindingType = "owner" | "authorized";

type MembershipSeed = {
  userIndex: number;
  level: MembershipLevel;
  status: MembershipStatus;
  expireAt: Date | null;
  avatarQuota: number;
  benefits: MembershipBenefit[];
};

type BindingSeed = {
  desktopIndex: number;
  petIndex: number;
  bindingType: BindingType;
  createdAt: Date;
  unboundAt: Date | null;
};

const DEVICE_STATUSES: readonly DeviceStatus[] = ["online", "offline", "pairing"];
const CLAIM_STATUSES: readonly ClaimStatus[] = [
  "occupied",
  "available",
  "reset_required",
];
const UPGRADE_STATUSES: readonly UpgradeStatus[] = [
  "idle",
  "pending",
  "success",
  "failed",
];
const PET_SPECIES: readonly Species[] = ["cat", "dog"];
const PET_GENDERS: readonly Gender[] = ["male", "female", "unknown"];
const AVATAR_STATUSES: readonly AvatarStatus[] = [
  "pending",
  "pending",
  "pending",
  "pending",
  "pending",
  "pending",
  "processing",
  "processing",
  "processing",
  "processing",
  "processing",
  "processing",
  "processing",
  "done",
  "done",
  "done",
  "done",
  "done",
  "done",
  "done",
  "failed",
  "failed",
  "failed",
  "failed",
  "failed",
  "failed",
  "approved",
  "approved",
  "approved",
  "approved",
  "approved",
  "approved",
  "rejected",
  "rejected",
  "rejected",
  "rejected",
  "rejected",
  "rejected",
  "rejected",
  "rejected",
];
const ACTION_COUNTS_FOR_COMPLETABLE_AVATARS = [
  ...Array.from({ length: 15 }, (_, index) => index),
  0,
  4,
  7,
  10,
  14,
] as const;

function pad(value: number, width = 2): string {
  return String(value).padStart(width, "0");
}

function daysAgo(days: number, hour = 9): Date {
  const now = new Date();
  return new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() - days,
      hour,
      0,
      0,
      0,
    ),
  );
}

function daysFromNow(days: number, hour = 9): Date {
  const now = new Date();
  return new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() + days,
      hour,
      0,
      0,
      0,
    ),
  );
}

function cloneBenefits(
  benefits: readonly MembershipBenefit[],
): MembershipBenefit[] {
  return benefits.map((benefit) => ({ ...benefit }));
}

function buildMembershipBenefits(
  level: MembershipLevel,
  avatarQuota: number,
): MembershipBenefit[] {
  if (level === "free") {
    return cloneBenefits(DEFAULT_FREE_BENEFITS);
  }

  return [
    {
      key: "avatar_generation",
      label: "AI 形象生成",
      value: `${avatarQuota} 次`,
      enabled: true,
    },
    {
      key: "basic_actions",
      label: "基础动作库",
      value: "全部开放",
      enabled: true,
    },
    {
      key: "personalized_actions",
      label: "个性化动作库",
      value: "全部开放",
      enabled: true,
    },
    {
      key: "priority_review",
      label: "优先审核",
      value:
        level === "basic"
          ? "加速队列"
          : level === "pro"
            ? "高优先级"
            : "最高优先级",
      enabled: true,
    },
  ];
}

function buildMembershipSeeds(): MembershipSeed[] {
  const specs: Array<
    Pick<MembershipSeed, "level" | "status" | "avatarQuota"> & {
      expireInDays: number | null;
    }
  > = [
    { level: "free", status: "active", expireInDays: null, avatarQuota: 2 },
    { level: "basic", status: "active", expireInDays: 45, avatarQuota: 6 },
    { level: "pro", status: "active", expireInDays: 60, avatarQuota: 12 },
    { level: "premium", status: "active", expireInDays: 90, avatarQuota: 30 },
    { level: "basic", status: "expired", expireInDays: -5, avatarQuota: 6 },
    { level: "pro", status: "expired", expireInDays: -7, avatarQuota: 12 },
    { level: "premium", status: "expired", expireInDays: -10, avatarQuota: 30 },
    { level: "free", status: "expired", expireInDays: -3, avatarQuota: 2 },
    { level: "basic", status: "expired", expireInDays: -1, avatarQuota: 6 },
    { level: "premium", status: "active", expireInDays: 120, avatarQuota: 30 },
    { level: "pro", status: "active", expireInDays: 75, avatarQuota: 12 },
    { level: "basic", status: "active", expireInDays: 30, avatarQuota: 6 },
    { level: "premium", status: "suspended", expireInDays: 20, avatarQuota: 30 },
    { level: "free", status: "active", expireInDays: null, avatarQuota: 2 },
    { level: "pro", status: "active", expireInDays: 50, avatarQuota: 12 },
  ];

  return specs.slice(0, SEED_MEMBERSHIP_COUNT).map((spec, index) => {
    const expireAt =
      spec.expireInDays === null ? null : daysFromNow(spec.expireInDays, 8);
    return {
      userIndex: index + 1,
      level: spec.level,
      status: spec.status,
      expireAt,
      avatarQuota: spec.avatarQuota,
      benefits: buildMembershipBenefits(spec.level, spec.avatarQuota),
    };
  });
}

function buildDesktopBindingSeeds(): BindingSeed[] {
  return [
    ...Array.from({ length: 8 }, (_, index) => ({
      desktopIndex: index + 1,
      petIndex: index + 1,
      bindingType: "owner" as const,
      createdAt: daysAgo(20 - index, 10),
      unboundAt: null,
    })),
    {
      desktopIndex: 9,
      petIndex: 9,
      bindingType: "owner",
      createdAt: daysAgo(12, 10),
      unboundAt: null,
    },
    {
      desktopIndex: 9,
      petIndex: 10,
      bindingType: "authorized",
      createdAt: daysAgo(9, 11),
      unboundAt: null,
    },
    {
      desktopIndex: 10,
      petIndex: 11,
      bindingType: "owner",
      createdAt: daysAgo(10, 10),
      unboundAt: null,
    },
    {
      desktopIndex: 10,
      petIndex: 12,
      bindingType: "authorized",
      createdAt: daysAgo(7, 11),
      unboundAt: null,
    },
    {
      desktopIndex: 11,
      petIndex: 13,
      bindingType: "owner",
      createdAt: daysAgo(11, 10),
      unboundAt: null,
    },
    {
      desktopIndex: 11,
      petIndex: 14,
      bindingType: "authorized",
      createdAt: daysAgo(6, 11),
      unboundAt: null,
    },
    {
      desktopIndex: 12,
      petIndex: 15,
      bindingType: "owner",
      createdAt: daysAgo(8, 10),
      unboundAt: null,
    },
    {
      desktopIndex: 13,
      petIndex: 16,
      bindingType: "owner",
      createdAt: daysAgo(5, 10),
      unboundAt: null,
    },
    {
      desktopIndex: 9,
      petIndex: 18,
      bindingType: "owner",
      createdAt: daysAgo(28, 9),
      unboundAt: daysAgo(14, 18),
    },
    {
      desktopIndex: 14,
      petIndex: 19,
      bindingType: "owner",
      createdAt: daysAgo(25, 9),
      unboundAt: daysAgo(10, 18),
    },
    {
      desktopIndex: 15,
      petIndex: 20,
      bindingType: "authorized",
      createdAt: daysAgo(22, 9),
      unboundAt: daysAgo(8, 18),
    },
  ];
}

function getMembershipSeedForUser(
  membershipSeeds: readonly MembershipSeed[],
  userIndex: number,
): MembershipSeed | undefined {
  return membershipSeeds.find((seed) => seed.userIndex === userIndex);
}

async function main() {
  const membershipSeeds = buildMembershipSeeds();
  const desktopBindingSeeds = buildDesktopBindingSeeds();

  const summary = await db.transaction(async (tx) => {
    const seedUsers = await tx
      .select({ id: users.id })
      .from(users)
      .where(like(users.wechatOpenid, `${SEED_OPENID_PREFIX}%`));
    const seedUserIds = seedUsers.map((user) => user.id);

    let seedPetIds: string[] = [];
    let seedAvatarIds: string[] = [];
    let seedDesktopIds: string[] = [];

    if (seedUserIds.length > 0) {
      const existingPets = await tx
        .select({ id: pets.id })
        .from(pets)
        .where(inArray(pets.userId, seedUserIds));
      seedPetIds = existingPets.map((pet) => pet.id);

      if (seedPetIds.length > 0) {
        const existingAvatars = await tx
          .select({ id: petAvatars.id })
          .from(petAvatars)
          .where(inArray(petAvatars.petId, seedPetIds));
        seedAvatarIds = existingAvatars.map((avatar) => avatar.id);
      }

      const existingDesktops = await tx
        .select({ id: desktopDevices.id })
        .from(desktopDevices)
        .where(inArray(desktopDevices.userId, seedUserIds));
      seedDesktopIds = existingDesktops.map((desktop) => desktop.id);
    }

    // design §6.2 cleanup order
    if (seedAvatarIds.length > 0) {
      await tx
        .delete(petAvatarActions)
        .where(inArray(petAvatarActions.petAvatarId, seedAvatarIds));
    }

    if (seedPetIds.length > 0) {
      await tx.delete(petAvatars).where(inArray(petAvatars.petId, seedPetIds));
    }

    if (seedPetIds.length > 0) {
      await tx
        .delete(petBehaviors)
        .where(inArray(petBehaviors.petId, seedPetIds));
    }

    const bindingCleanupConditions = [];
    if (seedPetIds.length > 0) {
      bindingCleanupConditions.push(
        inArray(desktopPetBindings.petId, seedPetIds),
      );
    }
    if (seedDesktopIds.length > 0) {
      bindingCleanupConditions.push(
        inArray(desktopPetBindings.desktopDeviceId, seedDesktopIds),
      );
    }
    if (bindingCleanupConditions.length > 0) {
      await tx
        .update(desktopPetBindings)
        .set({ unboundAt: new Date() })
        .where(or(...bindingCleanupConditions));
    }

    if (seedUserIds.length > 0) {
      await tx.delete(memberships).where(inArray(memberships.userId, seedUserIds));
    }

    const authorizationCleanupConditions = [];
    if (seedUserIds.length > 0) {
      authorizationCleanupConditions.push(
        inArray(deviceAuthorizations.fromUserId, seedUserIds),
        inArray(deviceAuthorizations.toUserId, seedUserIds),
      );
    }
    if (seedPetIds.length > 0) {
      authorizationCleanupConditions.push(
        inArray(deviceAuthorizations.petId, seedPetIds),
      );
    }
    if (authorizationCleanupConditions.length > 0) {
      await tx
        .delete(deviceAuthorizations)
        .where(or(...authorizationCleanupConditions));
    }

    if (seedUserIds.length > 0) {
      await tx.delete(collarDevices).where(inArray(collarDevices.userId, seedUserIds));
      await tx
        .delete(desktopDevices)
        .where(inArray(desktopDevices.userId, seedUserIds));
      await tx.delete(pets).where(inArray(pets.userId, seedUserIds));
      await tx.delete(users).where(inArray(users.id, seedUserIds));
    }

    const insertedUsers = await tx
      .insert(users)
      .values(
        Array.from({ length: SEED_USER_COUNT }, (_, index) => {
          const userIndex = index + 1;
          const membershipSeed = getMembershipSeedForUser(
            membershipSeeds,
            userIndex,
          );
          const createdAt = daysAgo(90 - userIndex, 9);

          return {
            wechatOpenid: `${SEED_OPENID_PREFIX}${userIndex}`,
            phone: `1390000${pad(userIndex, 4)}`,
            email: `seed-demo+${userIndex}@example.local`,
            nickname: `@seed-demo-user-${userIndex}`,
            avatarUrl: `https://seed.example.local/users/${userIndex}.png`,
            avatarQuota: membershipSeed?.avatarQuota ?? 2,
            createdAt,
            updatedAt: daysAgo(20 - (userIndex % 10), 18),
          };
        }),
      )
      .returning({ id: users.id, wechatOpenid: users.wechatOpenid });

    const userIdByIndex = new Map<number, string>();
    for (const user of insertedUsers) {
      const suffix = user.wechatOpenid?.slice(SEED_OPENID_PREFIX.length);
      const userIndex = Number(suffix);
      if (Number.isInteger(userIndex) && userIndex > 0) {
        userIdByIndex.set(userIndex, user.id);
      }
    }

    const insertedPets = await tx
      .insert(pets)
      .values(
        Array.from({ length: SEED_PET_COUNT }, (_, index) => {
          const petIndex = index + 1;
          const userIndex = petIndex <= SEED_USER_COUNT ? petIndex : petIndex - 20;
          const species = PET_SPECIES[index % PET_SPECIES.length];
          const createdAt = daysAgo(55 - petIndex, 10);

          return {
            userId: userIdByIndex.get(userIndex) ?? "",
            name: `SeedPet-${pad(petIndex)}`,
            species,
            breed: species === "cat" ? "british-shorthair" : "corgi",
            gender: PET_GENDERS[index % PET_GENDERS.length],
            birthday: `202${index % 4}-0${(index % 9) + 1}-15`,
            weight: Number((3.2 + (index % 7) * 0.8).toFixed(1)),
            activityScore: 40 + ((petIndex * 7) % 60),
            createdAt,
            updatedAt: daysAgo(15 - (petIndex % 6), 17),
          };
        }),
      )
      .returning({ id: pets.id, name: pets.name });

    const petIdByIndex = new Map<number, string>();
    for (const pet of insertedPets) {
      const petIndex = Number(pet.name.split("-").at(-1));
      if (Number.isInteger(petIndex) && petIndex > 0) {
        petIdByIndex.set(petIndex, pet.id);
      }
    }

    const insertedCollars = await tx
      .insert(collarDevices)
      .values(
        Array.from({ length: SEED_COLLAR_COUNT }, (_, index) => {
          const collarIndex = index + 1;
          const userIndex = ((collarIndex - 1) % SEED_USER_COUNT) + 1;
          const boundPetIndex = collarIndex <= 18 ? collarIndex : null;
          const status = DEVICE_STATUSES[index % DEVICE_STATUSES.length];
          const createdAt = daysAgo(50 - collarIndex, 11);

          return {
            userId: userIdByIndex.get(userIndex) ?? null,
            petId:
              boundPetIndex === null
                ? null
                : (petIdByIndex.get(boundPetIndex) ?? null),
            name: `Seed Collar ${pad(collarIndex)}`,
            macAddress: `AA:CC:${pad(collarIndex)}:10:${pad(
              (collarIndex * 3) % 100,
            )}:${pad((collarIndex * 7) % 100)}`,
            status,
            battery: 35 + ((collarIndex * 9) % 65),
            signal: 45 + ((collarIndex * 5) % 55),
            firmwareVersion: `1.${(collarIndex % 4) + 1}.${collarIndex % 10}`,
            claimStatus: CLAIM_STATUSES[index % CLAIM_STATUSES.length],
            usageDurationMinutes: 120 + collarIndex * 23,
            upgradeStatus: UPGRADE_STATUSES[index % UPGRADE_STATUSES.length],
            lastOnlineAt: status === "offline" ? null : daysAgo(collarIndex % 5, 20),
            createdAt,
            updatedAt: daysAgo(collarIndex % 6, 21),
          };
        }),
      )
      .returning({ id: collarDevices.id, petId: collarDevices.petId });

    const collarIdByPetId = new Map<string, string>();
    for (const collar of insertedCollars) {
      if (collar.petId) {
        collarIdByPetId.set(collar.petId, collar.id);
      }
    }

    const insertedDesktops = await tx
      .insert(desktopDevices)
      .values(
        Array.from({ length: SEED_DESKTOP_COUNT }, (_, index) => {
          const desktopIndex = index + 1;
          const status = DEVICE_STATUSES[(index + 1) % DEVICE_STATUSES.length];
          const createdAt = daysAgo(45 - desktopIndex, 12);

          return {
            userId: userIdByIndex.get(desktopIndex) ?? null,
            name: `Seed Desktop ${pad(desktopIndex)}`,
            macAddress: `BB:DT:${pad(desktopIndex)}:20:${pad(
              (desktopIndex * 4) % 100,
            )}:${pad((desktopIndex * 9) % 100)}`,
            status,
            firmwareVersion: `2.${(desktopIndex % 3) + 1}.${desktopIndex % 10}`,
            claimStatus: CLAIM_STATUSES[(index + 1) % CLAIM_STATUSES.length],
            usageDurationMinutes: 240 + desktopIndex * 37,
            upgradeStatus: UPGRADE_STATUSES[(index + 2) % UPGRADE_STATUSES.length],
            lastOnlineAt: status === "offline" ? null : daysAgo(desktopIndex % 4, 19),
            createdAt,
            updatedAt: daysAgo(desktopIndex % 5, 22),
          };
        }),
      )
      .returning({ id: desktopDevices.id, name: desktopDevices.name });

    const desktopIdByIndex = new Map<number, string>();
    for (const desktop of insertedDesktops) {
      const desktopIndex = Number(desktop.name.split(" ").at(-1));
      if (Number.isInteger(desktopIndex) && desktopIndex > 0) {
        desktopIdByIndex.set(desktopIndex, desktop.id);
      }
    }

    await tx.insert(desktopPetBindings).values(
      desktopBindingSeeds.map((binding) => ({
        desktopDeviceId: desktopIdByIndex.get(binding.desktopIndex) ?? "",
        petId: petIdByIndex.get(binding.petIndex) ?? "",
        bindingType: binding.bindingType,
        createdAt: binding.createdAt,
        unboundAt: binding.unboundAt,
      })),
    );

    const insertedAvatars = await tx
      .insert(petAvatars)
      .values(
        Array.from({ length: SEED_AVATAR_COUNT }, (_, index) => {
          const avatarIndex = index + 1;
          const petIndex = avatarIndex <= SEED_PET_COUNT ? avatarIndex : avatarIndex - 30;
          const status = AVATAR_STATUSES[index];
          const createdAt = daysAgo(35 - (avatarIndex % 18), 13);
          const reviewedAt =
            status === "pending" || status === "processing"
              ? null
              : daysAgo(12 - (avatarIndex % 5), 16);

          return {
            petId: petIdByIndex.get(petIndex) ?? "",
            sourceImageUrl: `https://seed.example.local/avatars/${avatarIndex}/source.png`,
            additionalImageUrls:
              avatarIndex % 4 === 0
                ? `https://seed.example.local/avatars/${avatarIndex}/detail-1.png,https://seed.example.local/avatars/${avatarIndex}/detail-2.png`
                : null,
            status,
            rejectReason:
              status === "rejected" ? "seed-demo-auto-rejected" : null,
            reviewedAt,
            createdAt,
          };
        }),
      )
      .returning({
        id: petAvatars.id,
        sourceImageUrl: petAvatars.sourceImageUrl,
        status: petAvatars.status,
      });

    const avatarIdByIndex = new Map<number, string>();
    const completableAvatarIndexes: number[] = [];
    for (const avatar of insertedAvatars) {
      const avatarIndex = Number(avatar.sourceImageUrl.split("/").at(-2));
      if (Number.isInteger(avatarIndex) && avatarIndex > 0) {
        avatarIdByIndex.set(avatarIndex, avatar.id);
        if (
          avatar.status === "processing" ||
          avatar.status === "done" ||
          avatar.status === "approved"
        ) {
          completableAvatarIndexes.push(avatarIndex);
        }
      }
    }

    const actionRows: Array<typeof petAvatarActions.$inferInsert> = [];
    completableAvatarIndexes
      .sort((left, right) => left - right)
      .forEach((avatarIndex, index) => {
        const actionCount = ACTION_COUNTS_FOR_COMPLETABLE_AVATARS[index] ?? 14;
        const avatarId = avatarIdByIndex.get(avatarIndex);
        if (!avatarId) {
          return;
        }

        ALL_ACTIONS.slice(0, actionCount).forEach((actionType, actionIndex) => {
          actionRows.push({
            petAvatarId: avatarId,
            actionType,
            imageUrl: `https://seed.example.local/avatars/${avatarIndex}/actions/${actionType}.png`,
            sortOrder: actionIndex,
          });
        });
      });

    if (actionRows.length > 0) {
      await tx.insert(petAvatarActions).values(actionRows);
    }

    const behaviorRows: Array<typeof petBehaviors.$inferInsert> = [];
    for (let petIndex = 1; petIndex <= 18; petIndex += 1) {
      const petId = petIdByIndex.get(petIndex);
      if (!petId) {
        continue;
      }

      const collarId = collarIdByPetId.get(petId);
      if (!collarId) {
        continue;
      }

      behaviorRows.push({
        petId,
        collarDeviceId: collarId,
        actionType: ALL_ACTIONS[(petIndex - 1) % ALL_ACTIONS.length],
        timestamp: daysAgo((petIndex % 7) + 1, 8),
      });
      behaviorRows.push({
        petId,
        collarDeviceId: collarId,
        actionType: ALL_ACTIONS[(petIndex + 3) % ALL_ACTIONS.length],
        timestamp: daysAgo(petIndex % 5, 18),
      });
    }

    if (behaviorRows.length > 0) {
      await tx.insert(petBehaviors).values(behaviorRows);
    }

    await tx.insert(memberships).values(
      membershipSeeds.map((membershipSeed) => ({
        userId: userIdByIndex.get(membershipSeed.userIndex) ?? "",
        level: membershipSeed.level,
        status: membershipSeed.status,
        startAt: daysAgo(40 - membershipSeed.userIndex, 9),
        expireAt: membershipSeed.expireAt,
        benefits: membershipSeed.benefits,
        createdAt: daysAgo(40 - membershipSeed.userIndex, 9),
        updatedAt:
          membershipSeed.status === "expired"
            ? daysAgo(2, 21)
            : daysAgo(1, 21),
      })),
    );

    return {
      users: insertedUsers.length,
      pets: insertedPets.length,
      collars: insertedCollars.length,
      desktops: insertedDesktops.length,
      bindings: desktopBindingSeeds.length,
      avatars: insertedAvatars.length,
      avatarActions: actionRows.length,
      petBehaviors: behaviorRows.length,
      memberships: membershipSeeds.length,
    };
  });

  console.log("Seed admin demo completed");
  console.table(summary);
}

void main()
  .catch((error) => {
    console.error("Seed admin demo failed");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$client.end();
  });
