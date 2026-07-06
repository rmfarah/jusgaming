// Tipos do domínio JusGaming — usados em todo o dashboard

export type UserRole = 'admin' | 'professor' | 'student'
export type CaseStatus = 'draft' | 'active' | 'closed'
export type TeamRole = 'plaintiff' | 'defendant' | 'judge'
export type CaseType = 'civil' | 'arbitration'
export type InstanceLevel = 'first' | 'appeal' | 'arbitral' | 'appeal_interlocutory' | 'appeal_sentence'

/** Returns true when the instance level represents a 2nd-degree (appellate) case. */
export function isAppealLevel(level: InstanceLevel): boolean {
  return level === 'appeal_interlocutory' || level === 'appeal_sentence'
}

export interface JusUser {
  id: string
  institution_id: string
  email: string
  full_name: string
  role: UserRole
  active: boolean
  created_at: string
}

export interface Course {
  id: string
  institution_id: string
  professor_id: string
  name: string
  code: string
  semester: string
  active: boolean
  email_notifications_enabled: boolean
  created_at: string
}

export interface CourseMember {
  id: string
  course_id: string
  user_id: string
  joined_at: string
}

export interface CourseMemberWithUser extends CourseMember {
  users: Pick<JusUser, 'id' | 'full_name' | 'email' | 'active'>
}

export interface JusCase {
  id: string
  institution_id: string
  course_id: string
  professor_id: string
  parent_case_id: string | null
  title: string
  type: CaseType
  instance_level: InstanceLevel
  arbitration_rules: string | null
  status: CaseStatus
  activated_at: string | null
  closed_at: string | null
  created_at: string
  plaintiff_brief: string | null
  defendant_brief: string | null
  judge_brief: string | null
  plaintiff_email_subject: string | null
  defendant_email_subject: string | null
  email_sender_type: 'client' | 'previous_lawyers' | null
  appealed_decision_type: string | null
}

export interface Team {
  id: string
  case_id: string
  role: TeamRole
  name: string
}

export interface CourseWithMemberCount extends Course {
  course_members: { count: number }[]
}

// ── Document types ───────────────────────────────────────────────────────────
export type DocumentType =
  // Lawyer teams
  | 'petition' | 'counterclaim' | 'appeal_ai' | 'appeal_ms' | 'appeal_ed'
  | 'appeal_general' | 'incident_request' | 'document_filing' | 'other'
  // Judge team
  | 'order' | 'decision' | 'intimation' | 'sentence' | 'minutes' | 'saneamento'
  // System (automatic)
  | 'certificate_conclusion' | 'certificate_publication'
  // Incident-specific (added in migration 004)
  | 'acordao' | 'decision_monocratica'        // judge/professor in incident
  | 'complementation' | 'counterargument' | 'withdrawal'  // lawyers in incident
  // Professor case setup (added in migration 006)
  | 'case_material'   // uploaded by professor during draft; shown per-team in autos
  // Judge special actions (added in migration 007)
  | 'certificate_citation'  // certidão de citação positiva — system doc, judge action
  | 'hearing_notice'        // designação de audiência — judge action
  // Appeal module (added in migration 008)
  | 'certificate_distribution'  // certidão de distribuição — 2nd degree activation
  | 'substitution_of_attorney'  // substabelecimento sem reserva — all degrees

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  petition: 'Petição / Memorial / Réplica',
  counterclaim: 'Reconvenção',
  appeal_ai: 'Agravo de Instrumento',
  appeal_ms: 'Mandado de Segurança',
  appeal_ed: 'Embargos de Declaração',
  appeal_general: 'Apelação / Recurso Geral',
  incident_request: 'Requerimento Incidental',
  document_filing: 'Juntada de Documento',
  other: 'Outros',
  order: 'Despacho',
  decision: 'Decisão Interlocutória',
  intimation: 'Intimação',
  sentence: 'Sentença',
  minutes: 'Ata de Audiência',
  saneamento: 'Decisão de Saneamento',
  certificate_conclusion: 'Certidão de Conclusão',
  certificate_publication: 'Certidão de Publicação no DJe',
  // Incident
  acordao: 'Acórdão',
  decision_monocratica: 'Decisão Monocrática',
  complementation: 'Complementação',
  counterargument: 'Contrarrazões',
  withdrawal: 'Desistência',
  // Professor material
  case_material: 'Material do Caso',
  // Judge special actions
  certificate_citation: 'Certidão de Citação Positiva',
  hearing_notice: 'Designação de Audiência',
  // Appeal module
  certificate_distribution: 'Certidão de Distribuição',
  substitution_of_attorney: 'Substabelecimento sem Reserva',
}

/** Available to plaintiff/defendant in 1st-degree cases. */
export const LAWYER_DOC_TYPES: DocumentType[] = [
  'petition', 'counterclaim', 'appeal_ai', 'appeal_ms', 'appeal_ed',
  'appeal_general', 'incident_request', 'document_filing',
  'substitution_of_attorney', 'other',
]

/** Available to plaintiff/defendant in appellate (2nd-degree) cases. */
export const APPEAL_LAWYER_DOC_TYPES: DocumentType[] = [
  'appeal_ed', 'appeal_general', 'appeal_ai', 'appeal_ms',
  'document_filing', 'substitution_of_attorney', 'other',
]
export const JUDGE_DOC_TYPES: DocumentType[] = [
  'order', 'decision', 'intimation', 'sentence', 'minutes', 'saneamento', 'other',
]
export const PROFESSOR_DOC_TYPES: DocumentType[] = [
  ...LAWYER_DOC_TYPES.filter(t => t !== 'other'),
  ...JUDGE_DOC_TYPES,
]

// ── Incident-specific types ──────────────────────────────────────────────────
/** Types available for professor OR judge team when inside an incident case */
export const INCIDENT_JUDGE_DOC_TYPES: DocumentType[] = [
  'acordao', 'decision_monocratica', 'other',
]
/** Types available for plaintiff/defendant teams inside an incident case */
export const INCIDENT_LAWYER_DOC_TYPES: DocumentType[] = [
  'complementation', 'counterargument', 'withdrawal', 'other',
]
/** Doc types that, when filed in an incident, automatically close it */
export const INCIDENT_CLOSING_TYPES: DocumentType[] = [
  'acordao', 'decision_monocratica',
]

export interface JusDocument {
  id: string
  case_id: string
  sequence_number: number
  uploaded_by: string | null
  team_id: string | null
  document_type: DocumentType
  title: string
  file_path: string | null
  certificate_text: string | null
  triggered_by: string | null
  created_at: string
}

export interface JusDocumentWithRefs extends JusDocument {
  users: { full_name: string } | null
  teams: { name: string; role: TeamRole } | null
  evaluations: Array<{
    id: string
    score: number | null
    comments: string | null
    weight: number
    published_at: string | null
  }>
}

export interface JusNotification {
  id: string
  case_id: string
  document_id: string | null
  recipient_team_id: string | null
  notification_type: 'case_activated' | 'citation_served' | 'new_document' | 'new_document_judge' | 'fato_novo'
  email_subject: string | null
  email_body: string | null
  send_email: boolean
  read_at: string | null
  status: 'pending' | 'sent' | 'failed'
  created_at: string
}

export interface CaseTemplate {
  id: string
  institution_id: string | null
  created_by: string | null
  title: string
  subject: string | null
  type: CaseType
  instance_level: InstanceLevel
  arbitration_rules: string | null
  plaintiff_brief: string | null
  defendant_brief: string | null
  judge_brief: string | null
  plaintiff_email_subject: string | null
  defendant_email_subject: string | null
  email_sender_type: 'client' | 'previous_lawyers' | null
  appealed_decision_type: string | null
  is_public: boolean
  created_at: string
}

export interface CaseTemplateDocument {
  id: string
  template_id: string
  recipient: 'plaintiff' | 'defendant' | 'both' | 'judge'
  label: string
  description: string | null
  file_path: string | null
  created_at: string
}

export interface TeamWithMembers extends Team {
  team_members: Array<{ user_id: string }>
}

export interface CaseWithCourse extends JusCase {
  courses: Pick<Course, 'name' | 'semester'>
  teams: Array<{ team_members: { count: number }[] }>
}

// Usado no painel do aluno
export interface StudentCourse {
  course: Course
  cases: StudentCase[]
}

export interface StudentCase {
  case: JusCase
  teamRole: TeamRole
  teamName: string
}
