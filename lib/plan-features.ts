import { PlanType } from './types'

export const PLAN_FEATURES: Record<PlanType, Record<string, boolean>> = {
  basic: {
    basicReport: true, emotionalFeedback: true, videoHighlights: true,
    growthTimeline: true, radarChart: false, detailedMetrics: false,
    trainingSuggestions: false, trendAnalysis: false, coachReview: false,
    personalizedPlan: false,
  },
  vip: {
    basicReport: true, emotionalFeedback: true, videoHighlights: true,
    growthTimeline: true, radarChart: true, detailedMetrics: true,
    trainingSuggestions: true, trendAnalysis: false, coachReview: false,
    personalizedPlan: false,
  },
  supervip: {
    basicReport: true, emotionalFeedback: true, videoHighlights: true,
    growthTimeline: true, radarChart: true, detailedMetrics: true,
    trainingSuggestions: true, trendAnalysis: true, coachReview: true,
    personalizedPlan: true,
  },
}

export function canAccess(plan: PlanType, feature: string): boolean {
  return PLAN_FEATURES[plan]?.[feature] ?? false
}

export const PLAN_LABELS: Record<PlanType, string> = {
  basic: '基础版', vip: '专业版', supervip: '高阶版',
}

export const PLAN_COLORS: Record<PlanType, { bg: string; text: string; border: string }> = {
  basic:    { bg: 'bg-white/10',     text: 'text-slate-300', border: 'border-white/15'      },
  vip:      { bg: 'bg-sky-500/15',   text: 'text-sky-300',   border: 'border-sky-500/30'    },
  supervip: { bg: 'bg-amber-500/15', text: 'text-amber-300', border: 'border-amber-500/30'  },
}
