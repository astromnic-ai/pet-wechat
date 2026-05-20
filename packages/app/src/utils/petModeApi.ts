import { request } from "./request";
import {
  type PetActivityMode,
  type PetModePlan,
  setPetActivityMode,
  setPetModePlans,
} from "./storage";

export interface PetModeResponse {
  mode: PetActivityMode;
  plans: PetModePlan[];
}

export async function fetchPetActivityMode(petId: string) {
  return request<PetModeResponse>({
    url: `/api/pets/${petId}/activity-mode`,
  });
}

export async function updatePetActivityMode(petId: string, mode: PetActivityMode) {
  return request<PetModeResponse>({
    url: `/api/pets/${petId}/activity-mode`,
    method: "PUT",
    data: { mode },
  });
}

export async function updatePetCustomPlans(petId: string, plans: PetModePlan[]) {
  return request<PetModeResponse>({
    url: `/api/pets/${petId}/custom-plans`,
    method: "PUT",
    data: { plans },
  });
}

export function syncPetModeCache(petId: string, data: PetModeResponse) {
  setPetActivityMode(petId, data.mode);
  setPetModePlans(petId, data.plans);
}
