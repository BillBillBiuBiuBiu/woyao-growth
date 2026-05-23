import { ReactNode } from 'react'
import { PlanType } from '@/lib/types'
import { PLAN_LABELS } from '@/lib/plan-features'

interface LockedFeatureProps {
  feature: string
  requiredPlan: PlanType
  children?: ReactNode
}

export default function LockedFeature({ feature, requiredPlan, children }: LockedFeatureProps) {
  const planLabel = PLAN_LABELS[requiredPlan]

  return (
    <div className="rounded-2xl border border-orange-100 bg-orange-50/60 p-5 flex flex-col items-center text-center gap-2">
      <div className="text-3xl select-none">🔒</div>
      <div className="font-bold text-gray-700 text-sm">{feature}</div>
      <p className="text-xs text-gray-500 leading-relaxed max-w-xs">
        此功能需要升级到{planLabel}才能解锁，帮助你更深入了解孩子的成长轨迹。
      </p>
      <div className="mt-1 text-xs font-semibold text-orange-600 bg-white border border-orange-200 rounded-full px-4 py-1.5 cursor-pointer hover:bg-orange-50 transition-colors">
        升级 {planLabel} 解锁
      </div>
      {children && <div className="w-full mt-2 opacity-30 pointer-events-none select-none">{children}</div>}
    </div>
  )
}
