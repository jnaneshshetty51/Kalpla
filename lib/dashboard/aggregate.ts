import { createAdminClient } from "@/lib/supabase/admin";
import { CategoryResultGroup, NodeResultItem } from "@/types/results";
import { getRecommendedNextStep, NextStepRecommendation } from "@/lib/roadmap/nextStep";

export interface RecentSubmissionItem {
  id: string;
  task_id: string;
  task_name: string;
  category: string;
  ai_score: number | null;
  created_at: string;
}

export interface UserStreakData {
  current_streak_days: number;
  total_active_days: number;
  last_activity_at: string | null;
}

export interface UpcomingSessionItem {
  id: string;
  title: string;
  session_type: string;
  starts_at: string;
  duration_minutes: number;
}

export interface DashboardAggregateResponse {
  overallScore: number;
  readinessBadge: string;
  isAssessmentPending: boolean;
  streak: UserStreakData;
  next_step: NextStepRecommendation;
  recent_submissions: RecentSubmissionItem[];
  categories: CategoryResultGroup[];
  nodeCounts: {
    mastered: number;
    in_progress: number;
    needs_focus: number;
    total: number;
  };
  upcomingSessions: UpcomingSessionItem[];
}

const TOP_LEVEL_CATEGORIES = [
  "LLM Fundamentals",
  "Prompt Engineering",
  "API Integration",
  "Embeddings & Retrieval",
  "Agentic Systems",
  "Evaluation",
  "Fine-Tuning Basics",
  "Deployment",
];

/**
 * Server-side aggregation function that fetches skill graph status, roadmap position,
 * next-best-action, recent submission history, and streak data into a single payload.
 */
export async function getDashboardAggregateData(
  userId: string,
): Promise<DashboardAggregateResponse> {
  const adminSupabase = createAdminClient();

  // Execute database queries and services in parallel
  const [
    { data: dbNodes },
    { data: dbScores },
    { data: dbAttempts },
    nextStepRecommendation,
    { data: dbSessions },
  ] = await Promise.all([
    adminSupabase
      .from("skill_nodes")
      .select("id, name, category, difficulty, order_index")
      .order("order_index", { ascending: true }),

    adminSupabase
      .from("competency_scores")
      .select("skill_node_id, score")
      .eq("user_id", userId),

    adminSupabase
      .from("assessment_attempts")
      .select("id, task_id, ai_score, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(20),

    getRecommendedNextStep(userId),

    // createAdminClient() bypasses RLS, so the cohort-wide-OR-assigned-to-me
    // filter live_sessions' select policies handle automatically elsewhere
    // (app/api/live-sessions/route.ts) must be replicated manually here.
    adminSupabase
      .from("live_sessions")
      .select("id, title, session_type, starts_at, duration_minutes, assigned_user_id")
      .is("cancelled_at", null)
      .gte("starts_at", new Date().toISOString())
      .or(`session_type.neq.mock_interview,assigned_user_id.eq.${userId}`)
      .order("starts_at", { ascending: true })
      .limit(3),
  ]);

  const nodesList = dbNodes || [];
  const scoreMap = new Map<string, number>();

  if (dbScores) {
    for (const s of dbScores) {
      scoreMap.set(s.skill_node_id, Number(s.score));
    }
  }

  // 1. Calculate category breakdowns and node counts
  const categories: CategoryResultGroup[] = [];
  let totalScoreSum = 0;
  let totalNodesCount = 0;

  let masteredCount = 0;
  let inProgressCount = 0;
  let needsFocusCount = 0;

  for (const cat of TOP_LEVEL_CATEGORIES) {
    const catNodes = nodesList.filter((n) => n.category === cat);
    let catScoreSum = 0;

    const nodeItems: NodeResultItem[] = catNodes.map((n) => {
      const rawScore = scoreMap.get(n.id) ?? 0;
      const score = Math.round(rawScore * 10) / 10;
      catScoreSum += score;
      totalScoreSum += score;
      totalNodesCount++;

      let status: NodeResultItem["status"] = "needs_focus";
      if (score >= 80) {
        status = "mastered";
        masteredCount++;
      } else if (score >= 40) {
        status = "in_progress";
        inProgressCount++;
      } else {
        needsFocusCount++;
      }

      return {
        id: n.id,
        name: n.name,
        category: n.category,
        difficulty: n.difficulty,
        score,
        status,
      };
    });

    const avg =
      catNodes.length > 0 ? Math.round((catScoreSum / catNodes.length) * 10) / 10 : 0;

    categories.push({
      category: cat,
      averageScore: avg,
      nodes: nodeItems,
    });
  }

  const overallScore =
    totalNodesCount > 0 ? Math.round((totalScoreSum / totalNodesCount) * 10) / 10 : 0;

  const isAssessmentPending = (!dbAttempts || dbAttempts.length === 0) && overallScore === 0;

  let readinessBadge = "Foundational Apprentice";
  if (overallScore >= 85) readinessBadge = "Senior GenAI Architect";
  else if (overallScore >= 70) readinessBadge = "Full-Stack GenAI Engineer";
  else if (overallScore >= 50) readinessBadge = "Intermediate Practitioner";

  // 2. Map recent submission history
  const recentSubmissions: RecentSubmissionItem[] = [];
  const nodeMap = new Map(nodesList.map((n) => [n.id, n]));

  if (dbAttempts && dbAttempts.length > 0) {
    // Limit to 5 most recent
    const topAttempts = dbAttempts.slice(0, 5);

    for (const att of topAttempts) {
      const matchedNode = Array.from(nodeMap.values()).find(
        (n) => n.id === att.task_id,
      );

      recentSubmissions.push({
        id: att.id,
        task_id: att.task_id,
        task_name: matchedNode?.name || "Diagnostic Assessment Task",
        category: matchedNode?.category || "GenAI Engineering",
        ai_score: att.ai_score !== null ? Number(att.ai_score) : null,
        created_at: att.created_at,
      });
    }
  }

  // 3. Compute active daily streak
  const streak = calculateUserStreak(dbAttempts || []);

  return {
    overallScore,
    readinessBadge,
    isAssessmentPending,
    streak,
    next_step: nextStepRecommendation,
    recent_submissions: recentSubmissions,
    categories,
    nodeCounts: {
      mastered: masteredCount,
      in_progress: inProgressCount,
      needs_focus: needsFocusCount,
      total: totalNodesCount,
    },
    upcomingSessions: dbSessions || [],
  };
}

/**
 * Calculates current active streak days and total active days from attempt timestamps.
 */
function calculateUserStreak(
  attempts: Array<{ created_at: string }>,
): UserStreakData {
  if (!attempts || attempts.length === 0) {
    return {
      current_streak_days: 0,
      total_active_days: 0,
      last_activity_at: null,
    };
  }

  const dateSet = new Set<string>();
  attempts.forEach((a) => {
    const dStr = new Date(a.created_at).toISOString().split("T")[0];
    dateSet.add(dStr);
  });

  const uniqueDates = Array.from(dateSet).sort((a, b) => b.localeCompare(a));
  const totalActiveDays = uniqueDates.length;
  const lastActivityAt = attempts[0]?.created_at || null;

  if (uniqueDates.length === 0) {
    return { current_streak_days: 0, total_active_days: 0, last_activity_at: null };
  }

  const todayStr = new Date().toISOString().split("T")[0];
  const yesterdayDate = new Date();
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterdayStr = yesterdayDate.toISOString().split("T")[0];

  const mostRecentDate = uniqueDates[0];
  if (mostRecentDate !== todayStr && mostRecentDate !== yesterdayStr) {
    return {
      current_streak_days: 0,
      total_active_days: totalActiveDays,
      last_activity_at: lastActivityAt,
    };
  }

  let streak = 0;
  const checkDate = new Date(mostRecentDate);

  for (let i = 0; i < uniqueDates.length; i++) {
    const expectedStr = checkDate.toISOString().split("T")[0];
    if (uniqueDates.includes(expectedStr)) {
      streak++;
      checkDate.setDate(checkDate.getDate() - 1);
    } else {
      break;
    }
  }

  return {
    current_streak_days: Math.max(1, streak),
    total_active_days: totalActiveDays,
    last_activity_at: lastActivityAt,
  };
}
