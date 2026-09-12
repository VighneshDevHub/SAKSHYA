// Mirrors backend/app/schemas and backend/app/models enums. Keep in sync.
//
// Section 1 — existing (legacy) types. These are preserved verbatim so no
// existing component / page needs to be rewritten.

export type OperationType = "DRIVE_ERASE" | "FILE_ERASE" | "RECOVERY";
export type CaseStatus = "OPEN" | "IN_PROGRESS" | "UNDER_REVIEW" | "CLOSED";

export interface OperationRecord {
  certificate_id: string;
  operation_type: OperationType;
  target_description: string;
  started_at: string;
  completed_at: string;
  success: boolean;
  operator: string;
  details: Record<string, unknown>;
  report_hash: string;
  signature: string;
  ledger_sequence_number: number;
  created_at: string;
}

export interface VerificationResult {
  certificate_id: string;
  signature_valid: boolean;
  chain_intact: boolean;
  overall_verified: boolean;
  detail: string;
}

export interface CaseInvestigator {
  email: string;
  is_lead: boolean;
  assigned_at: string;
}

export interface CaseEvidenceItem {
  id: string;
  evidence_label: string;
  evidence_reference: string;
  evidence_type: string;
  details: Record<string, unknown>;
  created_at: string;
}

export interface CaseLinkedOperation {
  certificate_id: string;
  operation_type: OperationType;
  target_description: string;
  completed_at: string;
  success: boolean;
  linked_at: string;
}

export interface CaseSummary {
  id: string;
  case_number: string;
  title: string;
  description: string;
  status: CaseStatus;
  lead_investigator_email: string | null;
  created_by_email: string;
  investigator_count: number;
  evidence_count: number;
  linked_operation_count: number;
  created_at: string;
  updated_at: string;
}

export interface CaseDetail extends CaseSummary {
  investigators: CaseInvestigator[];
  evidence_items: CaseEvidenceItem[];
  linked_operations: CaseLinkedOperation[];
}

// ============================================================
// Section 2 — NEW additive types (no existing member is changed)
// ============================================================

// --- auth / users / RBAC -------------------------------------------------
export type UserRole =
  | "ADMINISTRATOR"
  | "INVESTIGATOR"
  | "AUDITOR"
  | "SUPERVISOR";

export interface UserOut {
  id: string;
  email: string;
  role: UserRole;
}

export interface UserSummaryOut {
  id: string;
  email: string;
  role: UserRole;
  created_at: string;
}

export interface UserRoleUpdateIn {
  role: UserRole;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  role?: UserRole | null;
}

// --- devices -------------------------------------------------------------
export type DeviceStatus =
  | "CONNECTED"
  | "DISCONNECTED"
  | "IN_USE"
  | "ERRORED"
  | "QUARANTINED"
  | "SANITIZED"
  | "DECOMMISSIONED";

export type DeviceConnectionType =
  | "USB"
  | "SATA"
  | "NVMe"
  | "PCIe"
  | "SAS"
  | "SD"
  | "NETWORK"
  | "UNKNOWN";

export type DeviceMediaType =
  | "SSD"
  | "HDD"
  | "USB_FLASH"
  | "SD_CARD"
  | "NVME_SSD"
  | "OPTICAL"
  | "TAPE"
  | "OTHER";

export type DeviceHealth =
  | "EXCELLENT"
  | "GOOD"
  | "FAIR"
  | "POOR"
  | "CRITICAL"
  | "UNKNOWN";

export interface DeviceCreateIn {
  serial_number: string;
  manufacturer?: string;
  model?: string;
  connection_type?: DeviceConnectionType;
  media_type?: DeviceMediaType;
  capacity_bytes?: number;
  health?: DeviceHealth;
  status?: DeviceStatus;
  firmware_version?: string;
  notes?: string;
}

export interface DeviceUpdateIn {
  manufacturer?: string | null;
  model?: string | null;
  connection_type?: DeviceConnectionType | null;
  media_type?: DeviceMediaType | null;
  capacity_bytes?: number | null;
  health?: DeviceHealth | null;
  status?: DeviceStatus | null;
  firmware_version?: string | null;
  notes?: string | null;
}

export interface DeviceOut {
  id: string;
  serial_number: string;
  manufacturer: string;
  model: string;
  connection_type: DeviceConnectionType;
  media_type: DeviceMediaType;
  capacity_bytes: number;
  health: DeviceHealth;
  status: DeviceStatus;
  firmware_version: string;
  last_operation_record_id: string | null;
  last_operation_at: string | null;
  detected_at: string;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface DeviceDetectionOut {
  platform: string;
  detected_count: number;
  devices: DeviceOut[];
}

// --- jobs / task queue ---------------------------------------------------
export type TaskStatus =
  | "PENDING"
  | "CLAIMED"
  | "RUNNING"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";

export interface JobCreateIn {
  operation_type: OperationType;
  title?: string;
  payload?: Record<string, unknown>;
  case_id?: string | null;
  device_id?: string | null;
}

export interface JobUpdateIn {
  title?: string | null;
  payload?: Record<string, unknown> | null;
  status?: TaskStatus | null;
}

export interface JobOut {
  id: string;
  job_number: string;
  operation_type: OperationType;
  title: string;
  payload: Record<string, unknown>;
  case_id: string | null;
  device_id: string | null;
  created_by_user_id: string;
  assigned_agent_id: string | null;
  status: TaskStatus;
  progress_percent: number;
  stage: string;
  message: string;
  retries_count: number;
  parent_job_id: string | null;
  certificate_id: string | null;
  error_message: string;
  claimed_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
}

// --- notifications -------------------------------------------------------
export type NotificationType =
  | "CERT_GENERATED"
  | "RECOVERY_DONE"
  | "TAMPER_DETECTED"
  | "DEVICE_CONNECTED"
  | "DEVICE_REMOVED"
  | "JOB_FAILED"
  | "ROLE_CHANGED";

export interface NotificationOut {
  id: string;
  user_id: string | null;
  type: NotificationType;
  title: string;
  message: string;
  payload: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface NotificationListOut {
  items: NotificationOut[];
  unread_count?: number | null;
}

// --- timeline ------------------------------------------------------------
export type TimelineEventType =
  | "DEVICE_CONNECTED"
  | "RECOVERY_STARTED"
  | "FILES_RECOVERED"
  | "VERIFICATION"
  | "DRIVE_ERASED"
  | "CERT_GENERATED"
  | "EVIDENCE_ADDED"
  | "INVESTIGATOR_ASSIGNED"
  | "STATUS_CHANGED"
  | "OPERATION_LINKED"
  | "NOTE";

export interface TimelineEventOut {
  id: string;
  case_id: string;
  event_type: TimelineEventType;
  event_at: string;
  actor_email: string;
  description: string;
  // Both `event_metadata` (server-side name) and `metadata` (computed_field
  // alias) exist on the wire — normalise to one field on the client side
  // after unmarshalling via api.ts helpers.
  event_metadata: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  operation_record_id: string | null;
}

export interface TimelineNoteCreateIn {
  description: string;
  metadata?: Record<string, unknown>;
}

// --- evidence explorer ---------------------------------------------------
export interface EvidenceFileItem {
  filename: string;
  size_bytes: number;
  sha256: string;
  confidence?: unknown;
  metadata: Record<string, unknown>;
}

export interface EvidenceFileListOut {
  evidence_id: string;
  evidence_label: string;
  type_filter: "image" | "video" | "document" | "archive" | "all";
  count: number;
  files: EvidenceFileItem[];
}

// --- hash-chain ledger ---------------------------------------------------
export interface LedgerBlock {
  sequence_number: number;
  operation_type: OperationType | null;
  certificate_id: string | null;
  target_description: string | null;
  success: boolean | null;
  report_hash: string;
  previous_hash: string;
  entry_hash: string;
  created_at: string;
}

export interface LedgerVerifyOut {
  valid: boolean;
  sequence_number: number;
  computed_entry_hash: string;
  stored_entry_hash: string;
  previous_hash: string;
  report_hash: string;
  broken_at_sequence?: number;
}

// --- analytics -----------------------------------------------------------
export interface TopInvestigator {
  email: string;
  count: number;
}

export interface AnalyticsSummary {
  recovered_files_count: number;
  recovered_data_size_bytes: number;
  operations_today_count: number;
  devices_total: number;
  success_rate_pct: number;
  failure_rate_pct: number;
  storage_sanitized_bytes: number;
  top_investigators_by_ops: TopInvestigator[];
  ops_by_type?: Record<string, number>;
  device_health_breakdown?: Record<string, number>;
  device_status_breakdown?: Record<string, number>;
  ledger_blocks_count?: number;
  ledger_integrity_pct?: number;
}

export interface TimeseriesPoint {
  date: string;
  value: number;
}

export interface PublicStatsOut {
  operations_count: number;
  devices_count: number;
  cases_count: number;
  chain_verification_pct: number;
}

// --- universal search ----------------------------------------------------
export type SearchResultType =
  | "certificate"
  | "case"
  | "device"
  | "operation"
  | "officer";

export interface SearchResultItem {
  result_type: SearchResultType;
  id: string;
  title: string;
  subtitle: string;
  match_field: string;
  created_at: string;
}

export interface SearchOut {
  total: number;
  limit: number;
  offset: number;
  results: SearchResultItem[];
}

// --- reports -------------------------------------------------------------
export interface ReportCertificateRow {
  certificate_id: string;
  operation_type: OperationType | string;
  target_description: string;
  started_at: string | null;
  completed_at: string | null;
  success: boolean;
  operator: string;
  details: Record<string, unknown>;
  report_hash: string;
  signature: string;
  ledger_sequence_number: number;
  created_at: string;
}

export interface ReportListOut {
  total: number;
  limit: number;
  offset: number;
  items: ReportCertificateRow[];
}

export interface MonthlyReportBucket {
  year: number;
  month: number;
  operations_total: number;
  recoveries: number;
  drive_erases: number;
  file_erases: number;
  successes: number;
  failures: number;
}

export interface MonthlyReportOut {
  count: number;
  buckets: MonthlyReportBucket[];
}

// --- settings ------------------------------------------------------------
export interface AppSettings {
  organization_name: string;
  organization_logo_url: string;
  organization_address: string;
  department_name: string;
  department_code: string;
  certificate_header_text: string;
  certificate_footer_text: string;
  compliance_statement: string;
  default_overwrite_passes: number;
  hash_algorithm_display: string;
}

export interface SettingsPatchIn {
  organization_name?: string | null;
  organization_logo_url?: string | null;
  organization_address?: string | null;
  department_name?: string | null;
  department_code?: string | null;
  certificate_header_text?: string | null;
  certificate_footer_text?: string | null;
  compliance_statement?: string | null;
  default_overwrite_passes?: number | null;
}

// --- system logs ---------------------------------------------------------
export type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR" | "SECURITY";
export type LogCategory = "LIVE" | "DEVICE" | "BACKEND" | "SECURITY";

export interface SystemLogItem {
  id: string;
  level: LogLevel;
  category: LogCategory;
  message: string;
  details: Record<string, unknown>;
  source: string;
  created_at: string;
}

export interface SystemLogListOut {
  limit: number;
  offset: number;
  count: number;
  items: SystemLogItem[];
}

// --- WebSocket events (mirrors backend/app/schemas/ws.py) ----------------
export interface WSJobEvent {
  type: string;
  job_id: string;
  ts: string;
  status?: TaskStatus | null;
  progress_percent?: number | null;
  stage?: string | null;
  message?: string | null;
  error_message?: string | null;
  certificate_id?: string | null;
}

export interface WSUserEvent {
  type: string;
  user_id: string;
  ts: string;
  notification_id?: string | null;
  payload?: Record<string, unknown> | null;
}

export interface WSLogEvent {
  type: string;
  ts: string;
  level: LogLevel;
  category: LogCategory;
  message: string;
  details?: Record<string, unknown> | null;
}
