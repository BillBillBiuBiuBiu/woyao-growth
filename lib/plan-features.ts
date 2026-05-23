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
  basic:    { bg: 'bg-slate-100',  text: 'text-slate-600',  border: 'border-slate-200' },
  vip:      { bg: 'bg-blue-100',   text: 'text-blue-700',   border: 'border-blue-200'  },
  supervip: { bg: 'bg-amber-100',  text: 'text-amber-700',  border: 'border-amber-200' },
}
