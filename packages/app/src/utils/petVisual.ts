import type { Pet, Species } from "@pet-wechat/shared";

export function getPetFallbackImage(species?: Species | null) {
  return species === "dog"
    ? require("@/assets/images/dog-hero.png")
    : require("@/assets/images/pet-collar.png");
}

export function getPetDisplayImage(pet?: Pick<Pet, "species" | "avatarImageUrl"> | null) {
  if (pet?.avatarImageUrl) return pet.avatarImageUrl;
  return getPetFallbackImage(pet?.species);
}
