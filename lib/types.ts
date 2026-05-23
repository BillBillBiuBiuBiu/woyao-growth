export type PlanType = 'basic' | 'vip' | 'supervip'
export type UserRole = 'coach' | 'parent' | 'student' | 'admin'
export type ReportStatus = 'draft' | 'generated' | 'reviewed' | 'sent'
export type ReportType = 'basic' | 'vip' | 'supervip'
export type ReportScene = 'training' | 'match' | 'period_summary'
export type VideoStatus = 'uploaded' | 'processing' | 'analyzed' | 'failed'
export type VideoType = 'training' | 'match' | 'highlight'

export interface Student {
  id: string; name: string; age?: number; gender?: 'male'|'female'|'unknown'
  avatar?: string; classId?: string; coachId?: string; parentId?: string
  level: 'basic_class'|'match_class'|'elite_class'
  plan: PlanType
  position?: 'guard'|'forward'|'center'|'unknown'
  namePinyin?: string; number?: string
  createdAt: string; updatedAt: string
}

export interface RadarData {
  shooting: number; dribbling: number; passing: number; defense: number
  positioning: number; decisionMaking: number; physicality: number
  focus: number; teamwork: number
}

export interface TrendData {
  labels: string[]
  shooting?: number[]; defense?: number[]; decisionMaking?: number[]
  teamwork?: number[]; focus?: number[]
}

export interface ReportMetrics {
  shootingAttempts?: number; shootingMade?: number; assists?: number
  turnovers?: number; rebounds?: number; steals?: number
  defensiveInvolvement?: number; passingInvolvement?: number
}

export interface Report {
  id: string; studentId: string; coachId: string; videoId?: string
  reportType: ReportType; scene: ReportScene; title: string; summary: string
  strengths: string[]; weaknesses: string[]; suggestions: string[]
  coachComment?: string; parentVersionText?: string; internalCoachNotes?: string
  metrics?: ReportMetrics; radarData?: RadarData; trendData?: TrendData
  status: ReportStatus; createdAt: string; updatedAt: string
  badge?: { name: string; icon: string } | null
  clips?: Array<{id:string;title:string;videoUrl?:string|null;thumbnail?:string|null;timestamp:string;dimension:string;tag:string;level:string;coachComment:string;parentExplanation:string}>
}

export interface Video {
  id: string; title: string; type: VideoType
  uploadedBy: string; studentIds: string[]
  classId?: string; duration: number; videoUrl?: string
  thumbnailUrl?: string; status: VideoStatus; createdAt: string
}

export interface Class {
  id: string; name: string; level: 'basic_class'|'match_class'|'elite_class'
  coachId: string; studentCount: number; description?: string
}
