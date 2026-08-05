import { User } from "@supabase/supabase-js";

export type UserRole = "user" | "admin";

export type ExperienceLevel = "beginner" | "intermediate" | "advanced";

export interface UserProfile {
  id: string;
  name: string | null;
  goal: string | null;
  experience_level: ExperienceLevel | null;
  time_budget_minutes_per_day: number | null;
  timeline_days: number | null;
  role: UserRole;
  created_at: string;
  updated_at: string;
}

export interface UserContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  error: Error | null;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
}
