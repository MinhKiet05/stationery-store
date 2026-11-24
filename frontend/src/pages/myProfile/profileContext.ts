import { useOutletContext } from "react-router-dom";
import type { UserProfile } from "../../services/userService";

export type ProfileContext = {
  profile: UserProfile;
  updateProfile: (profile: UserProfile) => void;
  refreshOrders: () => void;
};

export function useProfile() {
  return useOutletContext<ProfileContext>();
}
