import { PlanType } from '@/lib/types'
import { PLAN_LABELS, PLAN_COLORS } from '@/lib/plan-features'

interface PlanBadgeProps {
  plan: PlanType
  size?: 'sm' | 'md'
}

export default function PlanBadge({ plan, size = 'sm' }: PlanBadgeProps) {
  const colors = PLAN_COLORS[plan]
  const label = PLAN_LABELS[plan]
  const textSize = size === 'md' ? 'text-sm px-3 py-1' : 'text-xs px-2 py-0.5'

  return (
    <span
      className={`inline-flex items-center rounded-full font-medium ${textSize} ${colors.bg} ${colors.text} border ${colors.border}`}
    >
      {label}
    </span>
  )
}
