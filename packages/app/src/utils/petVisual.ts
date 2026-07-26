import type { Pet, Species } from "@pet-wechat/shared";

export function getPetFallbackImage(species?: Species | null) {
  if (species === "dog") return require("@/assets/images/dog-hero.png");
  if (species === "bird") return require("@/assets/images/pet-type-bird-budgie.png");
  return require("@/assets/images/pet-collar.png");
}

export function getPetDisplayImage(pet?: Pick<Pet, "species" | "avatarImageUrl"> | null) {
  if (pet?.avatarImageUrl) return pet.avatarImageUrl;
  return getPetFallbackImage(pet?.species);
}

export function getPetSpeciesLabel(species?: Species | null) {
  if (species === "dog") return "狗狗";
  if (species === "bird") return "鸟鸟";
  return "猫咪";
}
