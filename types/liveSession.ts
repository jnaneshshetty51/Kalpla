export type LiveSessionType = "live_class" | "architecture_session" | "office_hours" | "mock_interview";

export interface LiveSession {
  id: string;
  title: string;
  description: string | null;
  session_type: LiveSessionType;
  starts_at: string;
  duration_minutes: number;
  assigned_user_id: string | null;
  daily_room_name: string;
  daily_room_url: string;
  reminder_sent_at: string | null;
  cancelled_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface LiveSessionAttendance {
  id: string;
  session_id: string;
  user_id: string;
  role_at_join: "admin" | "student";
  joined_at: string;
}
