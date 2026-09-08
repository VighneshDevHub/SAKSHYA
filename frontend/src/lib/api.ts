import type {
  AppSettings,
  CaseDetail,
  CaseStatus,
  CaseSummary,
  DeviceCreateIn,
  DeviceOut,
  DeviceUpdateIn,
  EvidenceFileListOut,
  JobCreateIn,
  JobOut,
  LedgerBlock,
  LedgerVerifyOut,
  LogCategory,
  LogLevel,
  MonthlyReportOut,
  NotificationListOut,
  NotificationOut,
  OperationRecord,
  PublicStatsOut,
  ReportListOut,
  SearchOut,
  SearchResultType,
  SettingsPatchIn,
  SystemLogListOut,
  TaskStatus,
  TimelineEventOut,
  TimelineNoteCreateIn,
  TimeseriesPoint,
  UserRole,
  UserRoleUpdateIn,
  UserSummaryOut,
  VerificationResult,
} from "./types";
import { getToken } from "./auth";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export class NotFoundError extends Error {}
export class UnauthorizedError extends Error {}
export class ForbiddenError extends Error {}
export class ConflictError extends Error {}

async function fetchJson<T>(
  path: string,
  options: {
    method?: string;
    requireAuth?: boolean;
    body?: unknown;
    headers?: HeadersInit;
    rawResponse?: boolean;
  } = {},
): Promise<T> {
  const { method = "GET", requireAuth = false, body, headers, rawResponse = false } = options;
  const mergedHeaders: HeadersInit = { ...(headers ?? {}) };
  if (requireAuth) {
    const token = getToken();
    if (!token) throw new UnauthorizedError("Not logged in");
    mergedHeaders["Authorization" as string] = `Bearer ${token}`;
  }
  if (body !== undefined && !(body instanceof FormData)) {
    mergedHeaders["Content-Type" as string] = "application/json";
  }

  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    cache: "no-store",
    headers: mergedHeaders,
    body:
      body === undefined
        ? undefined
        : body instanceof FormData
          ? body
          : JSON.stringify(body),
  });
  if (res.status === 404) throw new NotFoundError(`Not found: ${path}`);
  if (res.status === 401) throw new UnauthorizedError("Session expired, please sign in again");
  if (res.status === 403) throw new ForbiddenError(`Forbidden: ${path}`);
  if (res.status === 409) throw new ConflictError(`Conflict: ${path}`);
  if (!res.ok) throw new Error(`Request to ${path} failed with status ${res.status}`);
  if (rawResponse) return res as unknown as T;
  return res.json() as Promise<T>;
}

function buildQuery(params: Record<string, string | number | boolean | null | undefined>): string {
  const entries = Object.entries(params).filter(
    ([, v]) => v !== undefined && v !== null && v !== "",
  );
  if (!entries.length) return "";
  const qs = entries
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v ?? ""))}`)
    .join("&");
  return `?${qs}`;
}

// ========================================================================
// SECTION 1 — existing (legacy) wrappers preserved verbatim (no changes)
// ========================================================================

export async function getOperation(certificateId: string): Promise<OperationRecord> {
  return fetchJson<OperationRecord>(`/api/v1/operations/${certificateId}`);
}

export async function verifyOperation(certificateId: string): Promise<VerificationResult> {
  return fetchJson<VerificationResult>(`/api/v1/verify/${certificateId}`);
}

export async function listOperations(): Promise<OperationRecord[]> {
  return fetchJson<OperationRecord[]>(`/api/v1/operations`, { requireAuth: true });
}

export function getOperationPdfUrl(certificateId: string): string {
  return `${API_BASE_URL}/api/v1/operations/${certificateId}/pdf`;
}

export async function listCases(): Promise<CaseSummary[]> {
  return fetchJson<CaseSummary[]>(`/api/v1/cases`, { requireAuth: true });
}

export async function getCase(caseId: string): Promise<CaseDetail> {
  return fetchJson<CaseDetail>(`/api/v1/cases/${caseId}`, { requireAuth: true });
}

export async function createCase(payload: {
  title: string;
  description: string;
  status?: CaseStatus;
}): Promise<CaseDetail> {
  return fetchJson<CaseDetail>(`/api/v1/cases`, {
    method: "POST",
    requireAuth: true,
    body: payload,
  });
}

export async function assignInvestigator(caseId: string, investigatorEmail: string): Promise<CaseDetail> {
  return fetchJson<CaseDetail>(`/api/v1/cases/${caseId}/assign`, {
    method: "POST",
    requireAuth: true,
    body: { investigator_email: investigatorEmail, set_as_lead: true },
  });
}

export async function addCaseEvidence(
  caseId: string,
  payload: {
    evidence_label: string;
    evidence_reference: string;
    evidence_type: string;
    details?: Record<string, unknown>;
  },
): Promise<CaseDetail> {
  return fetchJson<CaseDetail>(`/api/v1/cases/${caseId}/evidence`, {
    method: "POST",
    requireAuth: true,
    body: payload,
  });
}

export async function linkCaseOperation(caseId: string, certificateId: string): Promise<CaseDetail> {
  return fetchJson<CaseDetail>(`/api/v1/cases/${caseId}/operations`, {
    method: "POST",
    requireAuth: true,
    body: { certificate_id: certificateId },
  });
}

export async function updateCaseStatus(caseId: string, status: CaseStatus): Promise<CaseDetail> {
  return fetchJson<CaseDetail>(`/api/v1/cases/${caseId}/status`, {
    method: "POST",
    requireAuth: true,
    body: { status },
  });
}

// ========================================================================
// SECTION 2 — NEW additive wrappers (mirrors routers in backend/app/api/v1)
// ========================================================================

// --- users (RBAC admin) --------------------------------------------------

export async function listUsers(params?: {
  limit?: number;
  offset?: number;
}): Promise<UserSummaryOut[]> {
  const qs = buildQuery({
    limit: params?.limit,
    offset: params?.offset,
  });
  return fetchJson<UserSummaryOut[]>(`/api/v1/users${qs}`, { requireAuth: true });
}

export async function updateUserRole(userId: string, role: UserRole): Promise<UserSummaryOut> {
  const payload: UserRoleUpdateIn = { role };
  return fetchJson<UserSummaryOut>(`/api/v1/users/${userId}/role`, {
    method: "PATCH",
    requireAuth: true,
    body: payload,
  });
}

// --- devices -------------------------------------------------------------

export async function listDevices(params?: {
  connection_type?: string;
  status?: string;
  media_type?: string;
  serial_contains?: string;
  limit?: number;
  offset?: number;
}): Promise<DeviceOut[]> {
  const qs = buildQuery({
    connection_type: params?.connection_type,
    status: params?.status,
    media_type: params?.media_type,
    serial_contains: params?.serial_contains,
    limit: params?.limit,
    offset: params?.offset,
  });
  return fetchJson<DeviceOut[]>(`/api/v1/devices${qs}`, { requireAuth: true });
}

export async function getDevice(deviceId: string): Promise<DeviceOut> {
  return fetchJson<DeviceOut>(`/api/v1/devices/${deviceId}`, { requireAuth: true });
}

export async function createDevice(payload: DeviceCreateIn): Promise<DeviceOut> {
  return fetchJson<DeviceOut>(`/api/v1/devices`, {
    method: "POST",
    requireAuth: true,
    body: payload,
  });
}

export async function updateDevice(deviceId: string, payload: DeviceUpdateIn): Promise<DeviceOut> {
  return fetchJson<DeviceOut>(`/api/v1/devices/${deviceId}`, {
    method: "PATCH",
    requireAuth: true,
    body: payload,
  });
}

// --- jobs ----------------------------------------------------------------

export async function createJob(payload: JobCreateIn): Promise<JobOut> {
  return fetchJson<JobOut>(`/api/v1/jobs`, {
    method: "POST",
    requireAuth: true,
    body: payload,
  });
}

export async function listJobs(params?: {
  status?: TaskStatus;
  operation_type?: string;
  case_id?: string;
  device_id?: string;
  created_by_user_id?: string;
  limit?: number;
  offset?: number;
}): Promise<JobOut[]> {
  const qs = buildQuery({
    status: params?.status,
    operation_type: params?.operation_type,
    case_id: params?.case_id,
    device_id: params?.device_id,
    created_by_user_id: params?.created_by_user_id,
    limit: params?.limit,
    offset: params?.offset,
  });
  return fetchJson<JobOut[]>(`/api/v1/jobs${qs}`, { requireAuth: true });
}

export async function getJob(jobId: string): Promise<JobOut> {
  return fetchJson<JobOut>(`/api/v1/jobs/${jobId}`, { requireAuth: true });
}

export async function cancelJob(jobId: string): Promise<JobOut> {
  return fetchJson<JobOut>(`/api/v1/jobs/${jobId}/cancel`, {
    method: "POST",
    requireAuth: true,
  });
}

export async function retryJob(jobId: string): Promise<JobOut> {
  return fetchJson<JobOut>(`/api/v1/jobs/${jobId}/retry`, {
    method: "POST",
    requireAuth: true,
  });
}

// --- notifications -------------------------------------------------------

export async function listNotifications(params?: {
  unread_only?: boolean;
  limit?: number;
}): Promise<NotificationListOut> {
  const qs = buildQuery({
    unread_only: params?.unread_only,
    limit: params?.limit,
  });
  return fetchJson<NotificationListOut>(`/api/v1/notifications${qs}`, { requireAuth: true });
}

export async function markNotificationRead(notificationId: string): Promise<NotificationOut> {
  return fetchJson<NotificationOut>(`/api/v1/notifications/${notificationId}/read`, {
    method: "PATCH",
    requireAuth: true,
  });
}

export async function markAllNotificationsRead(): Promise<{ marked_read: number }> {
  return fetchJson<{ marked_read: number }>(`/api/v1/notifications/read-all`, {
    method: "POST",
    requireAuth: true,
  });
}

// --- case timeline -------------------------------------------------------

export async function getCaseTimeline(caseId: string): Promise<TimelineEventOut[]> {
  return fetchJson<TimelineEventOut[]>(`/api/v1/cases/${caseId}/timeline`, { requireAuth: true });
}

export async function createCaseTimelineNote(
  caseId: string,
  payload: TimelineNoteCreateIn,
): Promise<TimelineEventOut> {
  return fetchJson<TimelineEventOut>(`/api/v1/cases/${caseId}/timeline`, {
    method: "POST",
    requireAuth: true,
    body: payload,
  });
}

// --- evidence explorer ---------------------------------------------------

export async function listEvidenceFiles(
  evidenceId: string,
  type: "image" | "video" | "document" | "archive" | "all" = "all",
): Promise<EvidenceFileListOut> {
  const qs = buildQuery({ type });
  return fetchJson<EvidenceFileListOut>(`/api/v1/evidence/${evidenceId}/files${qs}`, {
    requireAuth: true,
  });
}

// --- hash-chain ledger ---------------------------------------------------

export async function getLedgerChain(params?: {
  from_seq?: number;
  to_seq?: number;
}): Promise<LedgerBlock[]> {
  const qs = buildQuery({
    from_seq: params?.from_seq,
    to_seq: params?.to_seq,
  });
  return fetchJson<LedgerBlock[]>(`/api/v1/ledger/chain${qs}`, { requireAuth: true });
}

export async function verifyLedgerSeq(seq: number): Promise<LedgerVerifyOut> {
  const qs = buildQuery({ seq });
  return fetchJson<LedgerVerifyOut>(`/api/v1/ledger/chain/verify${qs}`, { requireAuth: true });
}

// --- analytics -----------------------------------------------------------

export async function getAnalyticsSummary() {
  // Import here lazily to preserve strict typing while keeping existing
  // module's import graph small.
  type Summary = import("./types").AnalyticsSummary;
  return fetchJson<Summary>(`/api/v1/analytics/summary`, { requireAuth: true });
}

export async function getAnalyticsTimeseries(params: {
  metric?: string;
  range?: string;
}): Promise<TimeseriesPoint[]> {
  const qs = buildQuery({
    metric: params.metric,
    range: params.range,
  });
  return fetchJson<TimeseriesPoint[]>(`/api/v1/analytics/timeseries${qs}`, { requireAuth: true });
}

// --- universal search ----------------------------------------------------

export async function universalSearch(params: {
  q?: string;
  types?: SearchResultType[] | SearchResultType | string;
  from?: string;
  to?: string;
  hash?: string;
  limit?: number;
  offset?: number;
}): Promise<SearchOut> {
  const { types, ...rest } = params;
  const resolvedParams: Record<string, string | number | null | undefined> = {
    q: rest.q,
    from: rest.from,
    to: rest.to,
    hash: rest.hash,
    limit: rest.limit,
    offset: rest.offset,
  };
  if (Array.isArray(types) && types.length) {
    resolvedParams["types"] = types.join(",");
  } else if (typeof types === "string") {
    resolvedParams["types"] = types;
  }
  const qs = buildQuery(resolvedParams);
  return fetchJson<SearchOut>(`/api/v1/search${qs}`, { requireAuth: true });
}

// --- reports -------------------------------------------------------------

export async function listCertificatesReport(params?: {
  from?: string;
  to?: string;
  operator_email?: string;
  success?: boolean;
  limit?: number;
  offset?: number;
}): Promise<ReportListOut> {
  const qs = buildQuery({
    from: params?.from,
    to: params?.to,
    operator_email: params?.operator_email,
    success: params?.success,
    limit: params?.limit,
    offset: params?.offset,
  });
  return fetchJson<ReportListOut>(`/api/v1/reports/certificates${qs}`, { requireAuth: true });
}

export async function listRecoveryReport(params?: {
  from?: string;
  to?: string;
  operator_email?: string;
  success?: boolean;
  limit?: number;
  offset?: number;
}): Promise<ReportListOut> {
  const qs = buildQuery({
    from: params?.from,
    to: params?.to,
    operator_email: params?.operator_email,
    success: params?.success,
    limit: params?.limit,
    offset: params?.offset,
  });
  return fetchJson<ReportListOut>(`/api/v1/reports/recovery${qs}`, { requireAuth: true });
}

export async function listAuditReport(params?: {
  from?: string;
  to?: string;
  operator_email?: string;
  success?: boolean;
  limit?: number;
  offset?: number;
}): Promise<ReportListOut> {
  const qs = buildQuery({
    from: params?.from,
    to: params?.to,
    operator_email: params?.operator_email,
    success: params?.success,
    limit: params?.limit,
    offset: params?.offset,
  });
  return fetchJson<ReportListOut>(`/api/v1/reports/audit${qs}`, { requireAuth: true });
}

export async function listMonthlyReport(params?: {
  year?: number;
  month?: number;
}): Promise<MonthlyReportOut> {
  const qs = buildQuery({
    year: params?.year,
    month: params?.month,
  });
  return fetchJson<MonthlyReportOut>(`/api/v1/reports/monthly${qs}`, { requireAuth: true });
}

export function getCertificateReportPdfUrl(certificateId: string): string {
  return `${API_BASE_URL}/api/v1/reports/certificates/${certificateId}/pdf`;
}

export function getCertificatesCsvDownloadUrl(params?: {
  from?: string;
  to?: string;
  operator_email?: string;
  success?: boolean;
}): string {
  const qs = buildQuery({
    from: params?.from,
    to: params?.to,
    operator_email: params?.operator_email,
    success: params?.success,
  });
  return `${API_BASE_URL}/api/v1/reports/certificates/download.csv${qs}`;
}

// --- settings ------------------------------------------------------------

export async function getSettings(): Promise<AppSettings> {
  return fetchJson<AppSettings>(`/api/v1/settings`, { requireAuth: true });
}

export async function patchSettings(payload: SettingsPatchIn): Promise<AppSettings> {
  return fetchJson<AppSettings>(`/api/v1/settings`, {
    method: "PATCH",
    requireAuth: true,
    body: payload,
  });
}

// --- system logs ---------------------------------------------------------

export async function listSystemLogs(params?: {
  category?: LogCategory | string;
  level?: LogLevel | string;
  limit?: number;
  offset?: number;
}): Promise<SystemLogListOut> {
  const qs = buildQuery({
    category: params?.category,
    level: params?.level,
    limit: params?.limit,
    offset: params?.offset,
  });
  return fetchJson<SystemLogListOut>(`/api/v1/system-logs${qs}`, { requireAuth: true });
}

// --- public (landing page) -----------------------------------------------

export async function getPublicStats(): Promise<PublicStatsOut> {
  return fetchJson<PublicStatsOut>(`/api/v1/public/stats`);
}

// --- re-export API base URL for the ws hook ------------------------------
export const API_BASE = API_BASE_URL;
