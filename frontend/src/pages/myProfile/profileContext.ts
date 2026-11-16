import { useOutletContext } from "react-router-dom";
import type { Order } from "../../services/orderService";
import type { UserProfile } from "../../services/userService";

export type ProfileContext = {
  profile: UserProfile;
  updateProfile: (profile: UserProfile) => void;
  orders: Order[];
  ordersLoading: boolean;
  ordersError: string;
  retryOrders: () => void;
  replaceOrder: (order: Order) => void;
};

export function useProfile() {
  return useOutletContext<ProfileContext>();
}
