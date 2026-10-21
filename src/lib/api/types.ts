// أنواع البيانات كما تعيدها دوال قاعدة البيانات (RPC)

export type Mode = 'forum' | 'debate' | 'turns' | 'poll'
export type SessionStatus = 'draft' | 'open' | 'paused' | 'closed'
export type PostKind = 'opinion' | 'quran' | 'hadith' | 'fiqh' | 'textbook' | 'example' | 'rebuttal' | 'question' | 'summary'
export type PostStatus = 'pending' | 'approved' | 'rejected'
export type TeacherTag = 'good_evidence' | 'needs_check' | 'incomplete' | 'no_evidence' | 'distinguished'
export type TimerScope = 'session' | 'stage' | 'turn'
export type TimerStatus = 'idle' | 'running' | 'paused' | 'ended'
export type PollKind = 'single' | 'multi' | 'yesno' | 'scale'
export type PollPhase = 'general' | 'pre' | 'post'
export type QueueStatus = 'waiting' | 'speaking' | 'done' | 'skipped' | 'withdrawn'
export type TeamColor = 'olive' | 'gold' | 'teal' | 'rose' | 'slate' | 'sky'

export interface RubricItem {
  key: string
  label: string
}

export interface SessionSettings {
  join_mode: 'roster' | 'approval'
  allow_join_closed: boolean
  moderation: boolean
  posts_open: boolean
  questions_open: boolean
  replies_enabled: boolean
  reply_scope: 'all' | 'team'
  max_posts_per_student: number
  max_replies_per_student: number
  edit_window_sec: number
  show_own_history: boolean
  points_enabled: boolean
  show_points_to_students: boolean
  evidence_enabled: boolean
  hand_raise_enabled: boolean
  turn_seconds: number
  turn_end_action: 'lock' | 'next'
  turn_posting: 'speaker_only' | 'all'
  auto_start_timer: boolean
  rubric: RubricItem[]
}

export interface Timer {
  status: TimerStatus
  duration_ms: number
  started_at: string | null
  ends_at: string | null
  remaining_ms: number | null
}
export type Timers = Partial<Record<TimerScope, Timer>>

export interface Evidence {
  source_type: 'quran' | 'hadith' | 'fiqh' | 'textbook' | 'example' | 'other'
  quote: string
  surah: string
  ayah: string
  hadith_source: string
  hadith_grade: string
  book_title: string
  page: string
  reasoning: string
  url: string
}
export type EvidenceInput = Partial<Omit<Evidence, 'source_type'>>

export interface Post {
  id: string
  parent_id: string | null
  topic_id: string | null
  member_id: string | null
  is_teacher: boolean
  author_name: string
  kind: PostKind
  body: string
  status: PostStatus
  pinned: boolean
  replies_locked: boolean
  team_id: string | null
  stage_id: string | null
  created_at: string
  edited_at: string | null
  reply_count: number
  evidence: Evidence | null
  teacher_tag?: TeacherTag | null
  teacher_note?: string
  mine?: boolean
}

export interface Topic {
  id: string
  title: string
  body: string
  is_active?: boolean
  position?: number
}

export interface Team {
  id: string
  name: string
  color: TeamColor
  position?: number
}

export interface Stage {
  id: string
  label: string
  team_id: string | null
  position: number
  duration_sec: number
  max_posts_per_team: number
}

export interface QueueEntry {
  id: string
  member_id: string
  name: string
  seq: number
  status: QueueStatus
  requested_at?: string
  granted_at: string | null
  ends_at: string | null
}

export interface PollOption {
  id: string
  label: string
  count: number | null
  voters?: string[] | null
}

export interface Poll {
  id: string
  question: string
  kind: PollKind
  phase: PollPhase
  status: 'draft' | 'open' | 'closed'
  show_voters: boolean
  hide_results: boolean
  max_choices: number
  opened_at: string | null
  closed_at: string | null
  results_visible: boolean
  ballots: number | null
  my_choice: string[] | null
  options: PollOption[]
}

// ----------------------------- الطالب -----------------------------
export interface StudentMember {
  id: string
  display_name: string
  role_label: string | null
  team_id: string | null
  online: boolean
}

export interface StudentState {
  server_now: string
  me: {
    id: string
    display_name: string
    status: 'pending' | 'active' | 'revoked'
    role_label?: string | null
    team_id?: string | null
    points?: number | null
    post_count?: number
    reply_count?: number
  }
  session: {
    id: string
    title: string
    lesson: string
    status: SessionStatus
    is_demo: boolean
    teacher_name: string
    main_question?: string
    instructions?: string
    mode?: Mode
    current_stage_id?: string | null
    settings?: Pick<
      SessionSettings,
      | 'moderation'
      | 'posts_open'
      | 'questions_open'
      | 'replies_enabled'
      | 'reply_scope'
      | 'max_posts_per_student'
      | 'max_replies_per_student'
      | 'edit_window_sec'
      | 'show_own_history'
      | 'evidence_enabled'
      | 'hand_raise_enabled'
      | 'turn_posting'
    > & { points_visible: boolean }
  }
  topics?: Topic[]
  teams?: Team[]
  stages?: Stage[]
  members?: StudentMember[]
  timers?: Timers
  queue?: QueueEntry[]
  posts?: Post[]
  post_total?: number
  polls?: Poll[]
}

export interface SessionLookup {
  session_id: string
  title: string
  lesson: string
  status: SessionStatus
  is_demo: boolean
  teacher_name: string
  join_mode: 'roster' | 'approval'
  joinable: boolean
  roster: { id: string; full_name: string }[]
}

export interface JoinResult {
  ok: boolean
  error?: string
  token?: string
  member_id?: string
  session_id?: string
  status?: 'pending' | 'active'
  display_name?: string
}

// ----------------------------- المعلم -----------------------------
export interface TeacherHome {
  profile: { id: string; display_name: string }
  classes: { id: string; name: string; is_demo: boolean; student_count: number }[]
  sessions: {
    id: string
    title: string
    lesson: string
    mode: Mode
    status: SessionStatus
    join_code: string
    is_demo: boolean
    class_name: string | null
    created_at: string
    opened_at: string | null
    closed_at: string | null
    member_count: number
    post_count: number
    has_report: boolean
  }[]
}

export interface ClassDetail {
  class: { id: string; name: string; is_demo: boolean }
  students: { id: string; full_name: string; access_code: string; code_revoked: boolean }[]
}

export interface TeacherMember {
  id: string
  display_name: string
  status: 'pending' | 'active' | 'revoked'
  role_label: string | null
  student_id: string | null
  joined_at: string
  last_seen_at: string | null
  online: boolean
  team_id: string | null
  teacher_note: string
  overall_grade: string
  points: number
  post_count: number
  reply_count: number
  evaluations: Record<string, number | null>
}

export interface TeacherSession {
  id: string
  teacher_id: string
  class_id: string | null
  title: string
  lesson: string
  main_question: string
  instructions: string
  mode: Mode
  status: SessionStatus
  join_code: string
  settings: SessionSettings
  duration_min: number
  current_stage_id: string | null
  is_demo: boolean
  opened_at: string | null
  closed_at: string | null
  created_at: string
  teacher_name: string
  class_name: string | null
  invited_count: number
}

export interface AuditEntry {
  action: string
  actor_name: string
  details: Record<string, unknown>
  created_at: string
}

export interface TeacherState {
  server_now: string
  session: TeacherSession
  topics: (Topic & { is_active: boolean; position: number })[]
  teams: Team[]
  stages: Stage[]
  timers: Timers
  members: TeacherMember[]
  not_joined: { id: string; full_name: string }[]
  queue: QueueEntry[]
  posts: Post[]
  post_total: number
  polls: Poll[]
  audit: AuditEntry[]
}

export interface ReportData {
  generated_at: string
  is_final: boolean
  session: {
    id: string
    title: string
    lesson: string
    main_question: string
    mode: Mode
    status: SessionStatus
    is_demo: boolean
    class_name: string | null
    teacher_name: string
    date: string
    opened_at: string | null
    closed_at: string | null
    planned_minutes: number
    actual_minutes: number | null
  }
  rubric: RubricItem[]
  counts: {
    invited: number | null
    joined: number
    participated: number
    posts: number
    replies: number
    rejected: number
    pending: number
    evidence: number
    questions: number
    turns: number
    hand_raises: number
    polls: number
    ballots: number
  }
  students: {
    member_id: string
    name: string
    status: string
    role_label: string | null
    team: string | null
    posts: number
    replies: number
    evidence: number
    turns: number
    votes: number
    points: number
    distinguished: number
    note: string
    grade: string
    evaluations: Record<string, number | null>
  }[]
  not_joined: string[]
  low_participation: string[]
  waiting_never_granted: string[]
  topics: { title: string; posts: number }[]
  untopiced_posts: number
  key_ideas: { author: string; body: string; kind: PostKind; tag: TeacherTag | null; pinned: boolean }[]
  most_discussed: { author: string; body: string; replies: number }[]
  unanswered_questions: { author: string; body: string }[]
  teacher_summaries: string[]
  kinds: Partial<Record<PostKind, number>>
  tags: Partial<Record<TeacherTag, number>>
  teams: { name: string; members: number; posts: number }[]
  polls: {
    question: string
    phase: PollPhase
    kind: PollKind
    status: string
    opened_at: string | null
    closed_at: string | null
    ballots: number
    options: { label: string; count: number }[]
  }[]
}

export interface ReportResult {
  data: ReportData
  teacher_summary: string
  generated_at: string
}
