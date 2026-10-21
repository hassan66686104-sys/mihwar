// الواجهة البرمجية الموحدة التي تستخدمها الصفحات.
// كل دالة هنا تستدعي دالة RPC محمية في قاعدة البيانات؛ الصلاحيات تُفحص هناك وليس في الواجهة.
import type { Backend } from './backend'
import { supabaseBackend } from './supabaseBackend'
import type {
  ClassDetail,
  EvidenceInput,
  JoinResult,
  Mode,
  PollKind,
  PollPhase,
  PostKind,
  ReportResult,
  SessionLookup,
  SessionSettings,
  SessionStatus,
  StudentState,
  TeacherHome,
  TeacherState,
  TeacherTag,
  TeamColor,
  TimerScope,
} from './types'

export const backend: Backend = supabaseBackend
const rpc = <T>(fn: string, args: Record<string, unknown> = {}) => backend.rpc<T>(fn, args)

export const studentApi = {
  serverNow: () => rpc<string>('mh_server_now'),
  lookup: (code: string) => rpc<SessionLookup>('mh_lookup_session', { p_code: code }),
  join: (code: string, studentId: string | null, accessCode: string | null, name: string | null) =>
    rpc<JoinResult>('mh_join', { p_code: code, p_student: studentId, p_access_code: accessCode, p_name: name }),
  state: (token: string, limit = 200) => rpc<StudentState>('mh_student_state', { p_token: token, p_post_limit: limit }),
  postsBefore: (token: string, before: string) =>
    rpc<StudentState['posts']>('mh_student_posts_before', { p_token: token, p_before: before, p_limit: 100 }),
  heartbeat: (token: string) => rpc<string>('mh_heartbeat', { p_token: token }),
  submit: (
    token: string,
    p: { clientId: string; kind: PostKind; body: string; parentId?: string | null; topicId?: string | null; evidence?: EvidenceInput | null },
  ) =>
    rpc<{ id: string; status: string; duplicate: boolean }>('mh_submit_post', {
      p_token: token,
      p_client_id: p.clientId,
      p_kind: p.kind,
      p_body: p.body,
      p_parent: p.parentId ?? null,
      p_topic: p.topicId ?? null,
      p_evidence: p.evidence ?? null,
    }),
  edit: (token: string, postId: string, body: string, evidence: EvidenceInput | null) =>
    rpc<{ id: string; status: string }>('mh_edit_post', { p_token: token, p_post: postId, p_body: body, p_evidence: evidence }),
  requestSpeak: (token: string) => rpc<{ id: string; seq: number; status: string }>('mh_request_speak', { p_token: token }),
  cancelSpeak: (token: string) => rpc<void>('mh_cancel_speak', { p_token: token }),
  vote: (token: string, pollId: string, optionIds: string[]) =>
    rpc<{ ok: boolean }>('mh_vote', { p_token: token, p_poll: pollId, p_options: optionIds }),
}

export interface SessionInput {
  title: string
  lesson: string
  class_id: string | null
  main_question: string
  instructions: string
  mode: Mode
  duration_min: number
  settings: Partial<SessionSettings>
  topics: { title: string; body?: string }[]
  teams: string[]
}

export const teacherApi = {
  bootstrap: (displayName: string | null) => rpc<{ id: string; display_name: string }>('mh_teacher_bootstrap', { p_display_name: displayName }),
  home: () => rpc<TeacherHome>('mh_teacher_home'),
  seedDemo: () => rpc<{ session_id: string; class_id: string; join_code: string }>('mh_seed_demo'),
  purgeClosed: (days: number) => rpc<number>('mh_purge_closed_sessions', { p_days: days }),

  saveClass: (id: string | null, name: string) => rpc<string>('mh_class_save', { p_id: id, p_name: name }),
  deleteClass: (id: string) => rpc<void>('mh_class_delete', { p_id: id }),
  classDetail: (id: string) => rpc<ClassDetail>('mh_class_detail', { p_id: id }),
  addStudents: (classId: string, names: string[]) => rpc<number>('mh_students_add', { p_class: classId, p_names: names }),
  renameStudent: (id: string, name: string) => rpc<void>('mh_student_update', { p_id: id, p_name: name }),
  studentCode: (id: string, action: 'regenerate' | 'revoke' | 'restore') => rpc<string>('mh_student_code', { p_id: id, p_action: action }),
  deleteStudent: (id: string) => rpc<void>('mh_student_delete', { p_id: id }),

  createSession: (p: SessionInput) => rpc<{ id: string; join_code: string }>('mh_session_create', { p }),
  updateSession: (id: string, p: Partial<Omit<SessionInput, 'topics' | 'teams' | 'mode'>>) =>
    rpc<void>('mh_session_update', { p_id: id, p }),
  deleteSession: (id: string) => rpc<void>('mh_session_delete', { p_id: id }),
  setStatus: (id: string, status: SessionStatus) => rpc<void>('mh_session_set_status', { p_id: id, p_status: status }),
  setMode: (id: string, mode: Mode) => rpc<void>('mh_session_set_mode', { p_id: id, p_mode: mode }),
  state: (id: string, limit = 300) => rpc<TeacherState>('mh_teacher_state', { p_session: id, p_post_limit: limit }),
  postsBefore: (id: string, before: string) =>
    rpc<TeacherState['posts']>('mh_teacher_posts_before', { p_session: id, p_before: before, p_limit: 100 }),

  timer: (id: string, scope: TimerScope, action: 'start' | 'pause' | 'resume' | 'end' | 'add' | 'reset', seconds: number | null = null) =>
    rpc<void>('mh_timer_control', { p_session: id, p_scope: scope, p_action: action, p_seconds: seconds }),

  saveTopic: (sessionId: string, id: string | null, title: string, body = '') =>
    rpc<string>('mh_topic_save', { p_session: sessionId, p_id: id, p_title: title, p_body: body }),
  topicAction: (id: string, action: 'activate' | 'deactivate' | 'delete') => rpc<void>('mh_topic_set', { p_id: id, p_action: action }),

  moderate: (postId: string, action: 'approve' | 'reject' | 'delete' | 'pin' | 'unpin' | 'lock' | 'unlock' | 'tag' | 'note', value: string | null = null) =>
    rpc<void>('mh_post_moderate', { p_post: postId, p_action: action, p_value: value }),
  tag: (postId: string, tag: TeacherTag | null) => teacherApi.moderate(postId, 'tag', tag ?? ''),
  teacherPost: (sessionId: string, kind: PostKind, body: string, parentId: string | null, clientId: string) =>
    rpc<string>('mh_teacher_post', { p_session: sessionId, p_kind: kind, p_body: body, p_parent: parentId, p_topic: null, p_client_id: clientId }),

  memberAction: (memberId: string, action: 'approve' | 'revoke' | 'restore' | 'role' | 'note' | 'grade', value: string | null = null) =>
    rpc<void>('mh_member_action', { p_member: memberId, p_action: action, p_value: value }),
  addPoints: (memberId: string, delta: number, reason: string, postId: string | null = null) =>
    rpc<void>('mh_points_add', { p_member: memberId, p_delta: delta, p_reason: reason, p_post: postId }),
  evaluate: (memberId: string, criterion: string, score: number | null) =>
    rpc<void>('mh_evaluate', { p_member: memberId, p_criterion: criterion, p_score: score }),

  saveTeam: (sessionId: string, id: string | null, name: string, color: TeamColor) =>
    rpc<string>('mh_team_save', { p_session: sessionId, p_id: id, p_name: name, p_color: color }),
  deleteTeam: (id: string) => rpc<void>('mh_team_delete', { p_id: id }),
  assignTeam: (memberId: string, teamId: string | null) => rpc<void>('mh_team_assign', { p_member: memberId, p_team: teamId }),
  autoTeams: (sessionId: string, count: number) => rpc<void>('mh_team_auto', { p_session: sessionId, p_count: count }),

  saveStage: (sessionId: string, id: string | null, s: { label: string; team_id: string | null; duration_sec: number; max_posts_per_team: number; position?: number }) =>
    rpc<string>('mh_stage_save', {
      p_session: sessionId,
      p_id: id,
      p_label: s.label,
      p_team: s.team_id,
      p_duration: s.duration_sec,
      p_max: s.max_posts_per_team,
      p_position: s.position ?? null,
    }),
  deleteStage: (id: string) => rpc<void>('mh_stage_delete', { p_id: id }),
  defaultStages: (sessionId: string) => rpc<void>('mh_stage_defaults', { p_session: sessionId }),
  activateStage: (sessionId: string, stageId: string | null, next = false) =>
    rpc<string | null>('mh_stage_activate', { p_session: sessionId, p_stage: stageId, p_next: next }),

  queue: (sessionId: string, action: 'grant' | 'next' | 'skip' | 'end' | 'extend' | 'clear', entryId: string | null = null, seconds: number | null = null) =>
    rpc<void>('mh_queue_action', { p_session: sessionId, p_action: action, p_entry: entryId, p_seconds: seconds }),
  queueTick: (sessionId: string) => rpc<void>('mh_queue_tick', { p_session: sessionId }),

  createPoll: (
    sessionId: string,
    p: { question: string; kind: PollKind; options: string[]; phase: PollPhase; show_voters: boolean; hide_results: boolean; max_choices?: number },
  ) => rpc<string>('mh_poll_create', { p_session: sessionId, p }),
  setPollStatus: (pollId: string, status: 'open' | 'closed') => rpc<void>('mh_poll_set_status', { p_poll: pollId, p_status: status }),
  deletePoll: (pollId: string) => rpc<void>('mh_poll_delete', { p_poll: pollId }),

  buildReport: (sessionId: string) => rpc<ReportResult>('mh_report_build', { p_session: sessionId }),
  saveReportSummary: (sessionId: string, text: string) => rpc<void>('mh_report_save_summary', { p_session: sessionId, p_text: text }),
}
