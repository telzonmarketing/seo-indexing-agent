import { create } from "zustand";
import { persist } from "zustand/middleware";

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
}

interface AuthStore {
  user: User | null;
  token: string | null;
  setAuth: (user: User, token: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      setAuth: (user, token) => {
        localStorage.setItem("seo_os_token", token);
        set({ user, token });
      },
      logout: () => {
        localStorage.removeItem("seo_os_token");
        set({ user: null, token: null });
      },
    }),
    { name: "seo-os-auth", partialize: (state) => ({ user: state.user, token: state.token }) }
  )
);
