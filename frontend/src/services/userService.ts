import { api } from "./api";

export type UserProfile = {
  userID: number;
  username: string;
  email: string;
  fullName: string | null;
  phoneNumber: string | null;
  address: string | null;
  role: string;
  isActive: boolean;
  createdAt: string;
};

export type UpdateProfileRequest = Pick<UserProfile, "email" | "fullName" | "phoneNumber" | "address">;

export function getMyProfile(signal?: AbortSignal) {
  return api<UserProfile>("/api/users/me", { signal });
}

export async function updateMyProfile(body: UpdateProfileRequest) {
  const profile = await api<UserProfile>("/api/users/me", {
    method: "PUT",
    body: JSON.stringify(body),
  });
  window.dispatchEvent(new Event("auth-changed"));
  return profile;
}
