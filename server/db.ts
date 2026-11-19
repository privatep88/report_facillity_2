import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type {
  ApprovalRecord,
  AuditLogEntry,
  AuthUser,
  ContractLicenseGroup,
  LogisticsChannelItem,
  MaintenanceCategory,
  MaintenanceCostEntry,
  MaintenanceSite,
  MonthlyReportFull,
  PerformanceThresholds,
  ReportListSummary,
  ReportStatus,
  ReportVersionSummary,
  SafetyMetricGroup,
  SecurityReceptionItem,
  ServiceMetricItem,
  TaskStatus,
  UserRole,
} from '../src/types/report.ts';
import { DEFAULT_THRESHOLDS, REPORT_STATUSES, TASK_STATUSES, USER_ROLES } from '../src/types/report.ts';
import {
  computeReportMetrics,
  formatDateWestern,
  normalizeDigits,
  parseDisplayDateDDMMYYYY,
  syncReceptionServiceWithSecurity,
} from '../src/utils/calculations.ts';
import {
  evaluateDualSignatureApproval,
  isValidSignatureDataUrl,
} from '../src/utils/signatureValidation.ts';
import {
  validateReportCompleteness,
  type ReportValidationResult,
} from '../src/services/ReportValidationService.ts';
import {
  canEditPostApprovalReport,
  canEditWorkingReport,
  isAuthorizedPostApprovalOwner,
} from '../src/utils/postApprovalAccess.ts';
import { computeReportFieldDiffs } from '../src/utils/reportDiff.ts';
import { populateReportWithSampleData } from '../src/utils/sampleReportData.ts';

export class DomainError extends Error {
  statusCode: number;
  validation?: ReportValidationResult;
  constructor(message: string, statusCode = 400, validation?: ReportValidationResult) {
    super(message);
    this.statusCode = statusCode;
    this.validation = validation;
  }
}

const DATA_DIR = path.join(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'saaed_fm.db');
export const db = new DatabaseSync(DB_PATH);

db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

const SESSION_SECRET = process.env.SESSION_SECRET || 'saaed-fm-exec-secret-2027-key-rotate';

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split(':');
  if (parts.length !== 2) return false;
  const [salt, hashHex] = parts;
  const derived = crypto.scryptSync(password, salt, 64);
  const storedBuf = Buffer.from(hashHex, 'hex');
  if (derived.length !== storedBuf.length) return false;
  return crypto.timingSafeEqual(derived, storedBuf);
}

export function signToken(payload: Record<string, unknown>): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(encoded).digest('base64url');
  return `${encoded}.${sig}`;
}

export function verifyToken(token: string): Record<string, unknown> | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encoded, sig] = parts;
  const expected = crypto.createHmac('sha256', SESSION_SECRET).update(encoded).digest('base64url');
  if (sig.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    if (typeof parsed.exp === 'number' && Date.now() > parsed.exp) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function createSignatureToken(userId: string, reportId: string, versionNumber: number, action: string): string {
  const timestamp = new Date().toISOString();
  const digest = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(`${userId}|${reportId}|v${versionNumber}|${action}|${timestamp}`)
    .digest('hex')
    .slice(0, 24)
    .toUpperCase();
  return `SIG-${digest}`;
}

export const DEFAULT_SERVICES: Array<{
  serviceId: string;
  sortOrder: number;
  summaryOrder: number;
  nameAr: string;
  nameEn: string;
}> = [
  { serviceId: 'svc_reception', sortOrder: 1, summaryOrder: 4, nameAr: 'خدمات الاستقبال', nameEn: 'Reception Services' },
  { serviceId: 'svc_hospitality', sortOrder: 2, summaryOrder: 7, nameAr: 'طلبات الضيافة', nameEn: 'Hospitality Requests' },
  { serviceId: 'svc_maintenance', sortOrder: 3, summaryOrder: 1, nameAr: 'طلبات الصيانة', nameEn: 'Maintenance Requests' },
  { serviceId: 'svc_logistics', sortOrder: 4, summaryOrder: 3, nameAr: 'طلبات الدعم اللوجستي', nameEn: 'Logistics Support Requests' },
  { serviceId: 'svc_cleaning', sortOrder: 5, summaryOrder: 8, nameAr: 'طلبات النظافة', nameEn: 'Cleaning Requests' },
  { serviceId: 'svc_waste', sortOrder: 6, summaryOrder: 9, nameAr: 'طلبات إدارة النفايات', nameEn: 'Waste Management Requests' },
  { serviceId: 'svc_assets', sortOrder: 7, summaryOrder: 6, nameAr: 'طلبات حركات الأصول', nameEn: 'Asset Movement Requests' },
  { serviceId: 'svc_petty_cash', sortOrder: 8, summaryOrder: 2, nameAr: 'النثرية Petty Cash', nameEn: 'Petty Cash' },
  { serviceId: 'svc_disbursement', sortOrder: 9, summaryOrder: 5, nameAr: 'طلبات صرف', nameEn: 'Disbursement Requests' },
  { serviceId: 'svc_government', sortOrder: 10, summaryOrder: 10, nameAr: 'طلبات وخدمات حكومية', nameEn: 'Government Services & Requests' },
  { serviceId: 'svc_access_permit', sortOrder: 11, summaryOrder: 11, nameAr: 'طلبات تصريح أو إلغاء دخول', nameEn: 'Access Permit / Cancellation' },
];

export const DEFAULT_LOGISTICS_CHANNELS: Array<{
  channelKey: string;
  nameAr: string;
  nameEn: string;
  sortOrder: number;
}> = [
  { channelKey: 'courier', nameAr: 'المندوب', nameEn: 'Courier', sortOrder: 1 },
  { channelKey: 'emirates_post', nameAr: 'بريد الإمارات', nameEn: 'Emirates Post', sortOrder: 2 },
  { channelKey: 'aramex', nameAr: 'أرامكس', nameEn: 'Aramex', sortOrder: 3 },
  { channelKey: 'tawzea', nameAr: 'توزيع', nameEn: 'Tawzea', sortOrder: 4 },
  { channelKey: 'other', nameAr: 'أخرى', nameEn: 'Other', sortOrder: 5 },
];

export const DEFAULT_SECURITY_ACTIVITIES: Array<{
  activityKey: string;
  nameAr: string;
  nameEn: string;
  sortOrder: number;
}> = [
  { activityKey: 'card_activation', nameAr: 'تفعيل البطاقات', nameEn: 'Card Activation', sortOrder: 1 },
  { activityKey: 'visitors', nameAr: 'عدد الزوار', nameEn: 'Visitors Count', sortOrder: 2 },
  { activityKey: 'vendor_visitors', nameAr: 'زوار الموردين', nameEn: 'Vendor Visitors', sortOrder: 3 },
  { activityKey: 'hall_booking', nameAr: 'حجز القاعات', nameEn: 'Meeting Room Bookings', sortOrder: 4 },
  { activityKey: 'evacuation', nameAr: 'حالات الإخلاء', nameEn: 'Evacuation Drills/Incidents', sortOrder: 5 },
  { activityKey: 'security_reports', nameAr: 'تقارير أمنية', nameEn: 'Security Reports', sortOrder: 6 },
  { activityKey: 'emergencies', nameAr: 'حالات طارئة', nameEn: 'Emergency Cases', sortOrder: 7 },
];

export function initSchemaAndSeed(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS roles (
      key TEXT PRIMARY KEY,
      name_ar TEXT NOT NULL,
      name_en TEXT NOT NULL,
      permissions_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      full_name TEXT NOT NULL,
      job_title TEXT NOT NULL,
      role_key TEXT NOT NULL REFERENCES roles(key),
      password_hash TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS system_settings (
      key TEXT PRIMARY KEY,
      value_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS reporting_periods (
      id TEXT PRIMARY KEY,
      year INTEGER NOT NULL,
      month INTEGER NOT NULL,
      department TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(year, month, department)
    );

    CREATE TABLE IF NOT EXISTS monthly_reports (
      id TEXT PRIMARY KEY,
      period_id TEXT NOT NULL REFERENCES reporting_periods(id),
      report_number TEXT NOT NULL UNIQUE,
      year INTEGER NOT NULL,
      month INTEGER NOT NULL,
      department TEXT NOT NULL,
      company TEXT NOT NULL,
      classification TEXT NOT NULL DEFAULT 'Public',
      status TEXT NOT NULL DEFAULT 'draft',
      current_version INTEGER NOT NULL DEFAULT 1,
      preparer_id TEXT,
      preparer_name TEXT NOT NULL DEFAULT '',
      preparer_title TEXT NOT NULL DEFAULT '',
      prepared_at TEXT,
      preparer_signature_hash TEXT,
      preparer_signature_image TEXT,
      reviewer_id TEXT,
      reviewer_name TEXT NOT NULL DEFAULT '',
      reviewer_title TEXT NOT NULL DEFAULT '',
      reviewed_at TEXT,
      approver_id TEXT,
      approver_name TEXT NOT NULL DEFAULT '',
      approver_title TEXT NOT NULL DEFAULT '',
      approved_at TEXT,
      approver_signature_hash TEXT,
      approver_signature_image TEXT,
      maint_from_facilities INTEGER NOT NULL DEFAULT 0,
      maint_from_other INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS service_metrics (
      id TEXT PRIMARY KEY,
      report_id TEXT NOT NULL REFERENCES monthly_reports(id) ON DELETE CASCADE,
      service_id TEXT NOT NULL,
      sort_order INTEGER NOT NULL,
      summary_order INTEGER NOT NULL,
      name_ar TEXT NOT NULL,
      name_en TEXT NOT NULL,
      received_count INTEGER NOT NULL DEFAULT 0,
      executed_count INTEGER NOT NULL DEFAULT 0,
      UNIQUE(report_id, service_id)
    );

    CREATE TABLE IF NOT EXISTS maintenance_sites (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      name_ar TEXT NOT NULL,
      name_en TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS maintenance_categories (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      name_ar TEXT NOT NULL,
      name_en TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS maintenance_records (
      id TEXT PRIMARY KEY,
      report_id TEXT NOT NULL REFERENCES monthly_reports(id) ON DELETE CASCADE,
      site_id TEXT NOT NULL REFERENCES maintenance_sites(id),
      category_id TEXT NOT NULL REFERENCES maintenance_categories(id),
      fault_count INTEGER NOT NULL DEFAULT 0,
      UNIQUE(report_id, site_id, category_id)
    );

    CREATE TABLE IF NOT EXISTS maintenance_costs (
      id TEXT PRIMARY KEY,
      report_id TEXT NOT NULL REFERENCES monthly_reports(id) ON DELETE CASCADE,
      category_id TEXT NOT NULL REFERENCES maintenance_categories(id),
      petty_cash_aed REAL NOT NULL DEFAULT 0,
      purchase_order_aed REAL NOT NULL DEFAULT 0,
      UNIQUE(report_id, category_id)
    );

    CREATE TABLE IF NOT EXISTS contracts_licenses (
      id TEXT PRIMARY KEY,
      report_id TEXT NOT NULL REFERENCES monthly_reports(id) ON DELETE CASCADE,
      group_key TEXT NOT NULL,
      name_ar TEXT NOT NULL,
      name_en TEXT NOT NULL,
      active_count INTEGER NOT NULL DEFAULT 0,
      inactive_count INTEGER NOT NULL DEFAULT 0,
      notes TEXT NOT NULL DEFAULT '',
      UNIQUE(report_id, group_key)
    );

    CREATE TABLE IF NOT EXISTS safety_metrics (
      id TEXT PRIMARY KEY,
      report_id TEXT NOT NULL REFERENCES monthly_reports(id) ON DELETE CASCADE,
      group_key TEXT NOT NULL,
      name_ar TEXT NOT NULL,
      name_en TEXT NOT NULL,
      primary_label_ar TEXT NOT NULL,
      primary_label_en TEXT NOT NULL,
      secondary_label_ar TEXT NOT NULL,
      secondary_label_en TEXT NOT NULL,
      primary_count INTEGER NOT NULL DEFAULT 0,
      secondary_count INTEGER NOT NULL DEFAULT 0,
      notes TEXT NOT NULL DEFAULT '',
      UNIQUE(report_id, group_key)
    );

    CREATE TABLE IF NOT EXISTS logistics_metrics (
      id TEXT PRIMARY KEY,
      report_id TEXT NOT NULL REFERENCES monthly_reports(id) ON DELETE CASCADE,
      channel_key TEXT NOT NULL,
      name_ar TEXT NOT NULL,
      name_en TEXT NOT NULL,
      request_count INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL,
      UNIQUE(report_id, channel_key)
    );

    CREATE TABLE IF NOT EXISTS reception_metrics (
      id TEXT PRIMARY KEY,
      report_id TEXT NOT NULL REFERENCES monthly_reports(id) ON DELETE CASCADE,
      activity_key TEXT NOT NULL,
      name_ar TEXT NOT NULL,
      name_en TEXT NOT NULL,
      received_count INTEGER NOT NULL DEFAULT 0,
      executed_count INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL,
      UNIQUE(report_id, activity_key)
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      report_id TEXT NOT NULL REFERENCES monthly_reports(id) ON DELETE CASCADE,
      row_order INTEGER NOT NULL,
      topic TEXT NOT NULL DEFAULT '',
      task_name TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'not_started',
      completion_pct INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS challenges (
      id TEXT PRIMARY KEY,
      report_id TEXT NOT NULL REFERENCES monthly_reports(id) ON DELETE CASCADE,
      row_order INTEGER NOT NULL,
      challenge_text TEXT NOT NULL DEFAULT '',
      update_text TEXT NOT NULL DEFAULT '',
      recommendation_text TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS approval_records (
      id TEXT PRIMARY KEY,
      report_id TEXT NOT NULL REFERENCES monthly_reports(id) ON DELETE CASCADE,
      version_number INTEGER NOT NULL,
      action TEXT NOT NULL,
      from_status TEXT NOT NULL,
      to_status TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      actor_name TEXT NOT NULL,
      actor_role TEXT NOT NULL,
      comment TEXT NOT NULL DEFAULT '',
      signature_token TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS report_versions (
      id TEXT PRIMARY KEY,
      report_id TEXT NOT NULL REFERENCES monthly_reports(id) ON DELETE CASCADE,
      version_number INTEGER NOT NULL,
      snapshot_json TEXT NOT NULL,
      approved_by_id TEXT NOT NULL,
      approved_by_name TEXT NOT NULL,
      signature_token TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(report_id, version_number)
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      report_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      user_name TEXT NOT NULL,
      user_role TEXT NOT NULL,
      action TEXT NOT NULL,
      field_path TEXT NOT NULL,
      previous_value TEXT NOT NULL DEFAULT '',
      new_value TEXT NOT NULL DEFAULT '',
      reason TEXT NOT NULL DEFAULT '',
      version_number INTEGER NOT NULL DEFAULT 1,
      report_status TEXT NOT NULL DEFAULT 'draft',
      created_at TEXT NOT NULL
    );
  `);

  // Ensure new signature image, post-approval revision, & concurrency columns exist on already-initialized databases
  const reportCols = db.prepare('PRAGMA table_info(monthly_reports)').all() as Array<{ name: string }>;
  const colNames = new Set(reportCols.map((c) => c.name));
  const missingColumns: Array<[string, string]> = [
    ['preparer_signature_image', 'TEXT'],
    ['approver_signature_image', 'TEXT'],
    ['preparer_signed_at', 'TEXT'],
    ['preparer_signed_by_id', 'TEXT'],
    ['preparer_signed_by_name', 'TEXT'],
    ['preparer_signature_status', "TEXT NOT NULL DEFAULT 'valid'"],
    ['approver_signed_at', 'TEXT'],
    ['approver_signed_by_id', 'TEXT'],
    ['approver_signed_by_name', 'TEXT'],
    ['approver_signature_status', "TEXT NOT NULL DEFAULT 'valid'"],
    ['is_post_approval_revision', 'INTEGER NOT NULL DEFAULT 0'],
    ['revision_reason', 'TEXT'],
    ['revision_started_by_id', 'TEXT'],
    ['revision_started_by_name', 'TEXT'],
    ['revision_started_by_role', 'TEXT'],
    ['revision_started_at', 'TEXT'],
    ['source_approved_version', 'INTEGER'],
    ['lock_version', 'INTEGER NOT NULL DEFAULT 1'],
  ];
  for (const [colName, colDef] of missingColumns) {
    if (!colNames.has(colName)) {
      db.exec(`ALTER TABLE monthly_reports ADD COLUMN ${colName} ${colDef};`);
    }
  }

  const versionCols = db.prepare('PRAGMA table_info(report_versions)').all() as Array<{ name: string }>;
  const verColNames = new Set(versionCols.map((c) => c.name));
  const missingVerCols: Array<[string, string]> = [
    ['revision_reason', 'TEXT'],
    ['source_approved_version', 'INTEGER'],
    ['edited_by_name', 'TEXT'],
  ];
  for (const [colName, colDef] of missingVerCols) {
    if (!verColNames.has(colName)) {
      db.exec(`ALTER TABLE report_versions ADD COLUMN ${colName} ${colDef};`);
    }
  }

  // Enforce append-only / immutable protection on audit logs, approval records, and version snapshots
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS prevent_audit_logs_update
    BEFORE UPDATE ON audit_logs
    BEGIN
      SELECT RAISE(ABORT, 'audit_logs is immutable and append-only');
    END;

    CREATE TRIGGER IF NOT EXISTS prevent_audit_logs_delete
    BEFORE DELETE ON audit_logs
    BEGIN
      SELECT RAISE(ABORT, 'audit_logs is immutable and cannot be deleted');
    END;

    CREATE TRIGGER IF NOT EXISTS prevent_approval_records_update
    BEFORE UPDATE ON approval_records
    BEGIN
      SELECT RAISE(ABORT, 'approval_records is immutable and append-only');
    END;

    CREATE TRIGGER IF NOT EXISTS prevent_approval_records_delete
    BEFORE DELETE ON approval_records
    BEGIN
      SELECT RAISE(ABORT, 'approval_records is immutable and cannot be deleted');
    END;

    CREATE TRIGGER IF NOT EXISTS prevent_report_versions_update
    BEFORE UPDATE ON report_versions
    BEGIN
      SELECT RAISE(ABORT, 'report_versions snapshots are immutable');
    END;

    CREATE TRIGGER IF NOT EXISTS prevent_report_versions_delete
    BEFORE DELETE ON report_versions
    BEGIN
      SELECT RAISE(ABORT, 'report_versions snapshots are immutable and cannot be deleted');
    END;
  `);

  const now = new Date().toISOString();

  // Seed roles
  const rolesCount = db.prepare('SELECT COUNT(*) as cnt FROM roles').get() as { cnt: number };
  if (rolesCount.cnt === 0) {
    const insertRole = db.prepare('INSERT INTO roles (key, name_ar, name_en, permissions_json) VALUES (?, ?, ?, ?)');
    insertRole.run(USER_ROLES.ADMIN, 'مدير النظام', 'System Administrator', JSON.stringify(['*']));
    insertRole.run(USER_ROLES.PREPARER, 'معد التقرير', 'Report Preparer', JSON.stringify(['create_report', 'edit_draft', 'submit_review']));
    insertRole.run(USER_ROLES.REVIEWER, 'المراجع', 'Reviewer', JSON.stringify(['start_review', 'return_report', 'forward_approval']));
    insertRole.run(USER_ROLES.APPROVER, 'المعتمد', 'Approver', JSON.stringify(['approve_report', 'archive_report', 'return_report']));
    insertRole.run(USER_ROLES.VIEWER, 'مستخدم للعرض فقط', 'Read-Only Viewer', JSON.stringify(['read_only']));
  }

  // Seed users
  const usersCount = db.prepare('SELECT COUNT(*) as cnt FROM users').get() as { cnt: number };
  if (usersCount.cnt === 0) {
    const defaultPwdHash = hashPassword('Saaed@2027');
    const insertUser = db.prepare(
      'INSERT INTO users (id, email, full_name, job_title, role_key, password_hash, is_active, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?)'
    );
    insertUser.run('usr_admin', 'mr.aljefre@gmail.com', 'خالد الهاشمي', 'مدير النظام التنفيذي', USER_ROLES.ADMIN, defaultPwdHash, now);
    insertUser.run('usr_preparer', 'muath.almasabi@saaed.ae', 'معاذ المصعبي', 'ضابط أول المرافق والأصول', USER_ROLES.PREPARER, defaultPwdHash, now);
    insertUser.run('usr_reviewer', 'reviewer@saaed.ae', 'سالم المنصوري', 'مراجع عمليات المرافق', USER_ROLES.REVIEWER, defaultPwdHash, now);
    insertUser.run('usr_approver', 'faisal.alsulaimani@saaed.ae', 'فيصل سويد السليماني', 'رئيس قسم إدارة المرافق', USER_ROLES.APPROVER, defaultPwdHash, now);
    insertUser.run('usr_viewer', 'viewer@saaed.ae', 'الإدارة العليا (عرض)', 'عضو اللجنة التنفيذية', USER_ROLES.VIEWER, defaultPwdHash, now);
  }

  // Seed thresholds setting
  const thresholdRow = db.prepare("SELECT key FROM system_settings WHERE key = 'kpi_thresholds'").get();
  if (!thresholdRow) {
    db.prepare('INSERT INTO system_settings (key, value_json, updated_at) VALUES (?, ?, ?)').run(
      'kpi_thresholds',
      JSON.stringify(DEFAULT_THRESHOLDS),
      now
    );
  }

  // Seed Maintenance Sites (6 standard sites including Impound Yards right after Ajman Patrols)
  const sitesCount = db.prepare('SELECT COUNT(*) as cnt FROM maintenance_sites').get() as { cnt: number };
  if (sitesCount.cnt === 0) {
    const insertSite = db.prepare(
      'INSERT INTO maintenance_sites (id, code, name_ar, name_en, is_active, sort_order, created_at) VALUES (?, ?, ?, ?, 1, ?, ?)'
    );
    insertSite.run('site_injazat', 'INJAZAT', 'مقر إنجازات', 'Injazat HQ', 1, now);
    insertSite.run('site_patrols', 'PATROLS', 'مقر الدوريات', 'Patrols HQ', 2, now);
    insertSite.run('site_ibn_battuta', 'IBN_BATTUTA', 'مقر ابن بطوطة', 'Ibn Battuta HQ', 3, now);
    insertSite.run('site_ajman_eval', 'AJMAN_EVAL', 'مقر تقييم عجمان', 'Ajman Evaluation HQ', 4, now);
    insertSite.run('site_ajman_patrols', 'AJMAN_PATROLS', 'مقر دوريات عجمان', 'Ajman Patrols HQ', 5, now);
    insertSite.run('site_impound_yards', 'IMPOUND_YARDS', 'مقرات ساحات الحجز', 'Impound Yards HQ', 6, now);
  } else {
    // Idempotent migration for existing databases: insert 'مقرات ساحات الحجز' immediately after 'مقر دوريات عجمان'
    const existingImpound = db
      .prepare(
        `SELECT id FROM maintenance_sites
         WHERE id = 'site_impound_yards' OR code = 'IMPOUND_YARDS' OR TRIM(name_ar) = 'مقرات ساحات الحجز'`
      )
      .get() as { id: string } | undefined;

    if (!existingImpound) {
      const ajmanRow = db
        .prepare(
          `SELECT sort_order FROM maintenance_sites
           WHERE id = 'site_ajman_patrols' OR TRIM(name_ar) = 'مقر دوريات عجمان'
           ORDER BY sort_order ASC LIMIT 1`
        )
        .get() as { sort_order: number } | undefined;

      const maxRow = db
        .prepare('SELECT COALESCE(MAX(sort_order), 0) as max_order FROM maintenance_sites')
        .get() as { max_order: number };

      const targetOrder = ajmanRow ? Number(ajmanRow.sort_order) + 1 : Number(maxRow.max_order) + 1;

      db.exec('BEGIN IMMEDIATE');
      try {
        if (ajmanRow) {
          db.prepare('UPDATE maintenance_sites SET sort_order = sort_order + 1 WHERE sort_order >= ?').run(
            targetOrder
          );
        }
        db.prepare(
          'INSERT INTO maintenance_sites (id, code, name_ar, name_en, is_active, sort_order, created_at) VALUES (?, ?, ?, ?, 1, ?, ?)'
        ).run('site_impound_yards', 'IMPOUND_YARDS', 'مقرات ساحات الحجز', 'Impound Yards HQ', targetOrder, now);

        // Initialize 0-fault matrix cells for existing reports without altering any saved values
        const existingReports = db.prepare('SELECT id FROM monthly_reports').all() as Array<{ id: string }>;
        const existingCats = db.prepare('SELECT id FROM maintenance_categories').all() as Array<{ id: string }>;
        const insertRecord = db.prepare(
          'INSERT OR IGNORE INTO maintenance_records (id, report_id, site_id, category_id, fault_count) VALUES (?, ?, ?, ?, 0)'
        );
        for (const rep of existingReports) {
          for (const cat of existingCats) {
            insertRecord.run(`mr_${rep.id}_site_impound_yards_${cat.id}`, rep.id, 'site_impound_yards', cat.id);
          }
        }
        db.exec('COMMIT');
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
    }
  }

  // Seed original 12 Maintenance Categories
  const catsCount = db.prepare('SELECT COUNT(*) as cnt FROM maintenance_categories').get() as { cnt: number };
  if (catsCount.cnt === 0) {
    const insertCat = db.prepare(
      'INSERT INTO maintenance_categories (id, code, name_ar, name_en, is_active, sort_order, created_at) VALUES (?, ?, ?, ?, 1, ?, ?)'
    );
    const cats: Array<[string, string, string, string]> = [
      ['cat_general', 'GENERAL', 'أعطال عامة', 'General Faults'],
      ['cat_furniture', 'FURNITURE', 'أثاث', 'Furniture'],
      ['cat_decor', 'DECOR', 'أعمال ديكور', 'Decor Works'],
      ['cat_fire_alarm', 'FIRE_ALARM', 'إنذار حريق', 'Fire Alarm'],
      ['cat_water_leak', 'WATER_LEAK', 'تسريب ماء', 'Water Leak'],
      ['cat_doors', 'DOORS', 'عطل أبواب', 'Door Faults'],
      ['cat_lighting', 'LIGHTING', 'عطل إنارة', 'Lighting Faults'],
      ['cat_flooring', 'FLOORING', 'عطل أرضيات', 'Flooring Faults'],
      ['cat_hvac', 'HVAC', 'عطل تكييف', 'HVAC Faults'],
      ['cat_signage', 'SIGNAGE', 'عطل لوحات خارجية', 'External Signage'],
      ['cat_electrical', 'ELECTRICAL', 'عطل كهرباء', 'Electrical Faults'],
      ['cat_elevators', 'ELEVATORS', 'عطل مصاعد', 'Elevator Faults'],
    ];
    cats.forEach(([id, code, ar, en], idx) => insertCat.run(id, code, ar, en, idx + 1, now));
  }

  // Seed Reference Month Report (January 2027 from attached PDF)
  const reportsCount = db.prepare('SELECT COUNT(*) as cnt FROM monthly_reports').get() as { cnt: number };
  if (reportsCount.cnt === 0) {
    seedReferenceJan2027Report();
  }

  // Ensure any unfilled draft report has realistic sample template data pre-populated
  populateUnfilledDraftReportsWithSampleData();
}

function populateUnfilledDraftReportsWithSampleData(): void {
  const draftRows = db
    .prepare(
      `SELECT r.id,
        COALESCE((SELECT SUM(received_count) FROM service_metrics WHERE report_id = r.id), 0) AS total_received,
        COALESCE((SELECT COUNT(*) FROM tasks WHERE report_id = r.id AND TRIM(topic) != '' AND TRIM(task_name) != ''), 0) AS filled_tasks
       FROM monthly_reports r
       WHERE r.status = 'draft'`
    )
    .all() as Array<{ id: string; total_received: number; filled_tasks: number }>;

  if (draftRows.length === 0) return;

  const sites = getAllSites();
  const categories = getAllCategories();
  const systemAdmin: AuthUser = {
    id: 'usr_admin',
    email: 'mr.aljefre@gmail.com',
    fullName: 'خالد الهاشمي',
    jobTitle: 'مدير النظام التنفيذي',
    role: USER_ROLES.ADMIN,
    isActive: true,
  };

  for (const row of draftRows) {
    if (Number(row.total_received) <= 5 || Number(row.filled_tasks) === 0) {
      const report = getReportById(row.id);
      if (report) {
        const populated = populateReportWithSampleData(report, sites, categories);
        saveReportData(row.id, populated, systemAdmin);
      }
    }
  }
}

function seedReferenceJan2027Report(): void {
  const now = new Date().toISOString();
  const periodId = 'period_2027_01_general';
  const reportId = 'rep_2027_01_001';
  const dept = 'إدارة الخدمات العامة';
  const reportNumber = 'FM-2027-01-001';

  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare('INSERT INTO reporting_periods (id, year, month, department, created_at) VALUES (?, ?, ?, ?, ?)').run(
      periodId,
      2027,
      1,
      dept,
      now
    );

    db.prepare(
      `INSERT INTO monthly_reports (
        id, period_id, report_number, year, month, department, company, classification,
        status, current_version,
        preparer_id, preparer_name, preparer_title, prepared_at, preparer_signature_hash,
        reviewer_id, reviewer_name, reviewer_title, reviewed_at,
        approver_id, approver_name, approver_title, approved_at, approver_signature_hash,
        maint_from_facilities, maint_from_other, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      reportId,
      periodId,
      reportNumber,
      2027,
      1,
      dept,
      'ساعد للأنظمة المرورية — SAAED',
      'Public',
      REPORT_STATUSES.DRAFT,
      1,
      'usr_preparer',
      'معاذ المصعبي',
      'ضابط أول المرافق والأصول',
      null,
      null,
      null,
      '',
      '',
      null,
      'usr_approver',
      'فيصل سويد السليماني',
      'رئيس قسم إدارة المرافق',
      null,
      null,
      0,
      0,
      now,
      now
    );

    // 11 Services (all 0 in Jan 2027 PDF)
    const insSvc = db.prepare(
      'INSERT INTO service_metrics (id, report_id, service_id, sort_order, summary_order, name_ar, name_en, received_count, executed_count) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0)'
    );
    for (const s of DEFAULT_SERVICES) {
      insSvc.run(`${reportId}_${s.serviceId}`, reportId, s.serviceId, s.sortOrder, s.summaryOrder, s.nameAr, s.nameEn);
    }

    // Contracts & Licenses (Exact Jan 2027 PDF numbers: 5 Rental, 5 Commercial, 6 Service)
    const insCon = db.prepare(
      'INSERT INTO contracts_licenses (id, report_id, group_key, name_ar, name_en, active_count, inactive_count, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    );
    insCon.run(`${reportId}_rental`, reportId, 'rental_contracts', 'العقود الإيجارية', 'Rental Contracts', 5, 0, '');
    insCon.run(`${reportId}_commercial`, reportId, 'commercial_licenses', 'الرخص التجارية', 'Commercial Licenses', 5, 0, '');
    insCon.run(`${reportId}_service`, reportId, 'service_contracts', 'عقود الخدمات', 'Service Contracts', 6, 0, '');

    // Safety (0/0 in Jan 2027 PDF)
    const insSaf = db.prepare(
      'INSERT INTO safety_metrics (id, report_id, group_key, name_ar, name_en, primary_label_ar, primary_label_en, secondary_label_ar, secondary_label_en, primary_count, secondary_count, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?)'
    );
    insSaf.run(
      `${reportId}_ext`,
      reportId,
      'fire_extinguishers',
      'عدد الطفايات',
      'Fire Extinguishers',
      'فعّالة',
      'Active',
      'غير فعّالة',
      'Inactive',
      ''
    );
    insSaf.run(
      `${reportId}_risk`,
      reportId,
      'risk_observations',
      'عدد ملاحظات المخاطر',
      'Risk Observations',
      'مغلقة',
      'Closed',
      'غير مغلقة',
      'Not closed',
      ''
    );

    // Maintenance Matrix (Jan 2027 PDF: Injazat Fire Alarm = 1, Ibn Battuta Electrical = 1)
    const sites = db.prepare('SELECT id FROM maintenance_sites').all() as Array<{ id: string }>;
    const cats = db.prepare('SELECT id FROM maintenance_categories').all() as Array<{ id: string }>;
    const insMaint = db.prepare(
      'INSERT INTO maintenance_records (id, report_id, site_id, category_id, fault_count) VALUES (?, ?, ?, ?, ?)'
    );
    for (const site of sites) {
      for (const cat of cats) {
        let count = 0;
        if (site.id === 'site_injazat' && cat.id === 'cat_fire_alarm') count = 1;
        if (site.id === 'site_ibn_battuta' && cat.id === 'cat_electrical') count = 1;
        insMaint.run(`${reportId}_${site.id}_${cat.id}`, reportId, site.id, cat.id, count);
      }
    }

    const insCost = db.prepare(
      'INSERT INTO maintenance_costs (id, report_id, category_id, petty_cash_aed, purchase_order_aed) VALUES (?, ?, ?, 0, 0)'
    );
    for (const cat of cats) {
      insCost.run(`${reportId}_cost_${cat.id}`, reportId, cat.id);
    }

    // Logistics
    const insLog = db.prepare(
      'INSERT INTO logistics_metrics (id, report_id, channel_key, name_ar, name_en, request_count, sort_order) VALUES (?, ?, ?, ?, ?, 0, ?)'
    );
    for (const ch of DEFAULT_LOGISTICS_CHANNELS) {
      insLog.run(`${reportId}_${ch.channelKey}`, reportId, ch.channelKey, ch.nameAr, ch.nameEn, ch.sortOrder);
    }

    // Security & Reception
    const insRec = db.prepare(
      'INSERT INTO reception_metrics (id, report_id, activity_key, name_ar, name_en, received_count, executed_count, sort_order) VALUES (?, ?, ?, ?, ?, 0, 0, ?)'
    );
    for (const act of DEFAULT_SECURITY_ACTIVITIES) {
      insRec.run(`${reportId}_${act.activityKey}`, reportId, act.activityKey, act.nameAr, act.nameEn, act.sortOrder);
    }

    // Tasks: 1 clean initial empty row (not falsely marked completed!)
    db.prepare(
      'INSERT INTO tasks (id, report_id, row_order, topic, task_name, status, completion_pct) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(`${reportId}_task_1`, reportId, 1, '', '', TASK_STATUSES.NOT_STARTED, 0);

    // Challenges: Exact Musaffah challenge from Jan 2027 PDF page 3
    db.prepare(
      'INSERT INTO challenges (id, report_id, row_order, challenge_text, update_text, recommendation_text) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(
      `${reportId}_chal_1`,
      reportId,
      1,
      'عدم التمكن من إصدار تراخيص البناء لأرض مصفح',
      'تم مخاطبة بلدية أبوظبي للحصول على ترخيص البناء في أرض مصفح وتم الرد بأنه تم إيقاف إصدار تراخيص البناء للأرض',
      'تصعيد الموضوع للبت في حالة الأرض'
    );

    // Audit Log seed entry
    db.prepare(
      'INSERT INTO audit_logs (id, report_id, user_id, user_name, user_role, action, field_path, previous_value, new_value, reason, version_number, report_status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(
      crypto.randomUUID(),
      reportId,
      'usr_preparer',
      'معاذ المصعبي',
      USER_ROLES.PREPARER,
      'تهيئة التقرير المرجعي',
      'monthly_reports',
      '',
      reportNumber,
      'استيراد بيانات التقرير المرجعي لشهر يناير 2027',
      1,
      REPORT_STATUSES.DRAFT,
      now
    );

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export function getThresholds(): PerformanceThresholds {
  const row = db.prepare("SELECT value_json FROM system_settings WHERE key = 'kpi_thresholds'").get() as
    | { value_json: string }
    | undefined;
  if (!row) return DEFAULT_THRESHOLDS;
  try {
    return JSON.parse(row.value_json) as PerformanceThresholds;
  } catch {
    return DEFAULT_THRESHOLDS;
  }
}

export function getAllSites(): MaintenanceSite[] {
  const rows = db
    .prepare('SELECT id, code, name_ar, name_en, is_active, sort_order FROM maintenance_sites ORDER BY sort_order ASC')
    .all() as Array<{
    id: string;
    code: string;
    name_ar: string;
    name_en: string;
    is_active: number;
    sort_order: number;
  }>;
  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    nameAr: r.name_ar,
    nameEn: r.name_en,
    isActive: r.is_active === 1,
    sortOrder: r.sort_order,
  }));
}

export function getAllCategories(): MaintenanceCategory[] {
  const rows = db
    .prepare('SELECT id, code, name_ar, name_en, is_active, sort_order FROM maintenance_categories ORDER BY sort_order ASC')
    .all() as Array<{
    id: string;
    code: string;
    name_ar: string;
    name_en: string;
    is_active: number;
    sort_order: number;
  }>;
  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    nameAr: r.name_ar,
    nameEn: r.name_en,
    isActive: r.is_active === 1,
    sortOrder: r.sort_order,
  }));
}

export function getReportById(reportId: string): MonthlyReportFull | null {
  const r = db.prepare('SELECT * FROM monthly_reports WHERE id = ?').get(reportId) as Record<string, unknown> | undefined;
  if (!r) return null;

  const services = (
    db.prepare('SELECT * FROM service_metrics WHERE report_id = ? ORDER BY sort_order ASC').all(reportId) as Array<
      Record<string, unknown>
    >
  ).map((s) => ({
    serviceId: String(s.service_id),
    sortOrder: Number(s.sort_order),
    summaryOrder: Number(s.summary_order),
    nameAr: String(s.name_ar),
    nameEn: String(s.name_en),
    receivedCount: Number(s.received_count),
    executedCount: Number(s.executed_count),
  })) satisfies ServiceMetricItem[];

  const contracts = (
    db.prepare('SELECT * FROM contracts_licenses WHERE report_id = ?').all(reportId) as Array<Record<string, unknown>>
  ).map((c) => ({
    groupKey: String(c.group_key) as ContractLicenseGroup['groupKey'],
    nameAr: String(c.name_ar),
    nameEn: String(c.name_en),
    activeCount: Number(c.active_count),
    inactiveCount: Number(c.inactive_count),
    notes: String(c.notes || ''),
  }));

  const safety = (
    db.prepare('SELECT * FROM safety_metrics WHERE report_id = ?').all(reportId) as Array<Record<string, unknown>>
  ).map((s) => ({
    groupKey: String(s.group_key) as SafetyMetricGroup['groupKey'],
    nameAr: String(s.name_ar),
    nameEn: String(s.name_en),
    primaryLabelAr: String(s.primary_label_ar),
    primaryLabelEn: String(s.primary_label_en),
    secondaryLabelAr: String(s.secondary_label_ar),
    secondaryLabelEn: String(s.secondary_label_en),
    primaryCount: Number(s.primary_count),
    secondaryCount: Number(s.secondary_count),
    notes: String(s.notes || ''),
  }));

  const maintRows = db
    .prepare('SELECT site_id, category_id, fault_count FROM maintenance_records WHERE report_id = ?')
    .all(reportId) as Array<{ site_id: string; category_id: string; fault_count: number }>;
  const maintenanceMatrix: Record<string, Record<string, number>> = {};
  for (const row of maintRows) {
    if (!maintenanceMatrix[row.site_id]) maintenanceMatrix[row.site_id] = {};
    maintenanceMatrix[row.site_id][row.category_id] = Number(row.fault_count);
  }

  const costRows = db
    .prepare('SELECT category_id, petty_cash_aed, purchase_order_aed FROM maintenance_costs WHERE report_id = ?')
    .all(reportId) as Array<{ category_id: string; petty_cash_aed: number; purchase_order_aed: number }>;
  const maintenanceCosts: Record<string, MaintenanceCostEntry> = {};
  for (const row of costRows) {
    maintenanceCosts[row.category_id] = {
      categoryId: row.category_id,
      pettyCashAed: Number(row.petty_cash_aed),
      purchaseOrderAed: Number(row.purchase_order_aed),
    };
  }

  const logistics = (
    db.prepare('SELECT * FROM logistics_metrics WHERE report_id = ? ORDER BY sort_order ASC').all(reportId) as Array<
      Record<string, unknown>
    >
  ).map((l) => ({
    channelKey: String(l.channel_key),
    nameAr: String(l.name_ar),
    nameEn: String(l.name_en),
    requestCount: Number(l.request_count),
    sortOrder: Number(l.sort_order),
  })) satisfies LogisticsChannelItem[];

  const securityReception = (
    db.prepare('SELECT * FROM reception_metrics WHERE report_id = ? ORDER BY sort_order ASC').all(reportId) as Array<
      Record<string, unknown>
    >
  ).map((sr) => ({
    activityKey: String(sr.activity_key),
    nameAr: String(sr.name_ar),
    nameEn: String(sr.name_en),
    receivedCount: Number(sr.received_count),
    executedCount: Number(sr.executed_count),
    sortOrder: Number(sr.sort_order),
  })) satisfies SecurityReceptionItem[];

  const tasks = (
    db.prepare('SELECT * FROM tasks WHERE report_id = ? ORDER BY row_order ASC').all(reportId) as Array<
      Record<string, unknown>
    >
  ).map((t) => ({
    id: String(t.id),
    rowOrder: Number(t.row_order),
    topic: String(t.topic || ''),
    taskName: String(t.task_name || ''),
    status: String(t.status) as TaskStatus,
    completionPct: Number(t.completion_pct),
  }));

  const challenges = (
    db.prepare('SELECT * FROM challenges WHERE report_id = ? ORDER BY row_order ASC').all(reportId) as Array<
      Record<string, unknown>
    >
  ).map((c) => ({
    id: String(c.id),
    rowOrder: Number(c.row_order),
    challengeText: String(c.challenge_text || ''),
    updateText: String(c.update_text || ''),
    recommendationText: String(c.recommendation_text || ''),
  }));

  const report: MonthlyReportFull = {
    id: String(r.id),
    periodId: String(r.period_id),
    reportNumber: String(r.report_number),
    year: Number(r.year),
    month: Number(r.month),
    department: String(r.department),
    company: String(r.company),
    classification: String(r.classification),
    status: String(r.status) as ReportStatus,
    currentVersion: Number(r.current_version),
    isPostApprovalRevision: Number(r.is_post_approval_revision || 0) === 1,
    revisionReason: r.revision_reason ? String(r.revision_reason) : null,
    revisionStartedById: r.revision_started_by_id ? String(r.revision_started_by_id) : null,
    revisionStartedByName: r.revision_started_by_name ? String(r.revision_started_by_name) : null,
    revisionStartedByRole: r.revision_started_by_role ? String(r.revision_started_by_role) : null,
    revisionStartedAt: r.revision_started_at ? String(r.revision_started_at) : null,
    sourceApprovedVersion:
      r.source_approved_version !== null && r.source_approved_version !== undefined
        ? Number(r.source_approved_version)
        : null,
    lockVersion: Number(r.lock_version || 1),
    preparerId: r.preparer_id ? String(r.preparer_id) : null,
    preparerName: String(r.preparer_name || ''),
    preparerTitle: String(r.preparer_title || ''),
    preparedAt: r.prepared_at ? String(r.prepared_at) : null,
    preparerSignatureHash: r.preparer_signature_hash ? String(r.preparer_signature_hash) : null,
    preparerSignatureImage: r.preparer_signature_image ? String(r.preparer_signature_image) : null,
    preparerSignedAt: r.preparer_signed_at ? String(r.preparer_signed_at) : null,
    preparerSignedById: r.preparer_signed_by_id ? String(r.preparer_signed_by_id) : null,
    preparerSignedByName: r.preparer_signed_by_name ? String(r.preparer_signed_by_name) : null,
    preparerSignatureStatus: (
      r.preparer_signature_status === 'revoked' || r.preparer_signature_status === 'invalid'
        ? r.preparer_signature_status
        : 'valid'
    ) as 'valid' | 'revoked' | 'invalid',
    reviewerId: r.reviewer_id ? String(r.reviewer_id) : null,
    reviewerName: String(r.reviewer_name || ''),
    reviewerTitle: String(r.reviewer_title || ''),
    reviewedAt: r.reviewed_at ? String(r.reviewed_at) : null,
    approverId: r.approver_id ? String(r.approver_id) : null,
    approverName: String(r.approver_name || ''),
    approverTitle: String(r.approver_title || ''),
    approvedAt: r.approved_at ? String(r.approved_at) : null,
    approverSignatureHash: r.approver_signature_hash ? String(r.approver_signature_hash) : null,
    approverSignatureImage: r.approver_signature_image ? String(r.approver_signature_image) : null,
    approverSignedAt: r.approver_signed_at ? String(r.approver_signed_at) : null,
    approverSignedById: r.approver_signed_by_id ? String(r.approver_signed_by_id) : null,
    approverSignedByName: r.approver_signed_by_name ? String(r.approver_signed_by_name) : null,
    approverSignatureStatus: (
      r.approver_signature_status === 'revoked' || r.approver_signature_status === 'invalid'
        ? r.approver_signature_status
        : 'valid'
    ) as 'valid' | 'revoked' | 'invalid',
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
    services,
    contracts,
    safety,
    maintenanceMatrix,
    maintenanceCosts,
    maintenanceServices: {
      fromFacilitiesDept: Number(r.maint_from_facilities),
      fromOtherDepts: Number(r.maint_from_other),
    },
    logistics,
    securityReception,
    tasks,
    challenges,
  };

  return report.status === REPORT_STATUSES.DRAFT ? syncReceptionServiceWithSecurity(report) : report;
}

export function listReportsSummary(): ReportListSummary[] {
  const rows = db
    .prepare(
      `SELECT r.*,
        COALESCE((SELECT SUM(received_count) FROM service_metrics WHERE report_id = r.id), 0) AS total_received,
        COALESCE((SELECT SUM(executed_count) FROM service_metrics WHERE report_id = r.id), 0) AS total_executed,
        COALESCE((SELECT SUM(fault_count) FROM maintenance_records WHERE report_id = r.id), 0) AS total_faults,
        COALESCE((SELECT SUM(petty_cash_aed + purchase_order_aed) FROM maintenance_costs WHERE report_id = r.id), 0) AS total_cost_aed,
        COALESCE((SELECT COUNT(*) FROM report_versions WHERE report_id = r.id), 0) AS version_count
      FROM monthly_reports r
      ORDER BY r.year DESC, r.month DESC, r.created_at DESC`
    )
    .all() as Array<Record<string, unknown>>;

  const latestVerStmt = db.prepare(
    `SELECT version_number, approved_by_name, created_at, snapshot_json
     FROM report_versions
     WHERE report_id = ?
     ORDER BY version_number DESC
     LIMIT 1`
  );

  return rows.map((r) => {
    const id = String(r.id);
    const totalReceived = Number(r.total_received) || 0;
    const totalExecuted = Number(r.total_executed) || 0;
    const completionRate = totalReceived > 0 ? Math.round((totalExecuted / totalReceived) * 1000) / 10 : null;
    const status = String(r.status) as ReportStatus;

    let latestApprovedVersion: number | null = null;
    let latestApprovedAt: string | null = null;
    let latestApprovedByName: string | null = null;
    let latestApprovedPreparedAt: string | null = null;
    let latestApprovedStatus: ReportStatus | null = null;
    let latestApprovedTotalReceived: number | null = null;
    let latestApprovedCompletionRate: number | null = null;

    const verRow = latestVerStmt.get(id) as
      | {
          version_number: number;
          approved_by_name: string;
          created_at: string;
          snapshot_json: string;
        }
      | undefined;

    if (verRow) {
      latestApprovedVersion = Number(verRow.version_number);
      latestApprovedByName = String(verRow.approved_by_name || '');
      try {
        const parsed = JSON.parse(verRow.snapshot_json) as {
          report?: MonthlyReportFull;
          sites?: MaintenanceSite[];
          categories?: MaintenanceCategory[];
          thresholds?: PerformanceThresholds;
          approvedAt?: string;
        };
        const snapRep = parsed.report;
        latestApprovedAt = snapRep?.approvedAt || parsed.approvedAt || verRow.created_at;
        latestApprovedPreparedAt = snapRep?.preparedAt || null;
        latestApprovedByName = snapRep?.approverName || latestApprovedByName;
        latestApprovedStatus =
          snapRep?.status === REPORT_STATUSES.ARCHIVED || status === REPORT_STATUSES.ARCHIVED
            ? REPORT_STATUSES.ARCHIVED
            : REPORT_STATUSES.APPROVED;
        if (snapRep) {
          const snapMetrics = computeReportMetrics(
            snapRep,
            parsed.sites || [],
            parsed.categories || [],
            parsed.thresholds || DEFAULT_THRESHOLDS
          );
          latestApprovedTotalReceived = snapMetrics.totalReceived;
          latestApprovedCompletionRate = snapMetrics.overallCompletionPct;
        }
      } catch {
        latestApprovedAt = verRow.created_at;
        latestApprovedStatus = REPORT_STATUSES.APPROVED;
      }
    } else if (status === REPORT_STATUSES.APPROVED || status === REPORT_STATUSES.ARCHIVED) {
      latestApprovedVersion = Number(r.current_version);
      latestApprovedAt = r.approved_at ? String(r.approved_at) : null;
      latestApprovedByName = String(r.approver_name || '');
      latestApprovedPreparedAt = r.prepared_at ? String(r.prepared_at) : null;
      latestApprovedStatus = status;
      latestApprovedTotalReceived = totalReceived;
      latestApprovedCompletionRate = completionRate;
    }

    return {
      id,
      reportNumber: String(r.report_number),
      year: Number(r.year),
      month: Number(r.month),
      department: String(r.department),
      status,
      currentVersion: Number(r.current_version),
      preparerId: r.preparer_id ? String(r.preparer_id) : null,
      preparerName: String(r.preparer_name || ''),
      approverName: String(r.approver_name || ''),
      preparedAt: r.prepared_at ? String(r.prepared_at) : null,
      approvedAt: r.approved_at ? String(r.approved_at) : null,
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
      totalReceived,
      totalExecuted,
      completionRate,
      totalFaults: Number(r.total_faults) || 0,
      totalCostAed: Math.round((Number(r.total_cost_aed) || 0) * 100) / 100,
      versionCount: Number(r.version_count) || 0,
      isPostApprovalRevision: Number(r.is_post_approval_revision || 0) === 1,
      revisionReason: r.revision_reason ? String(r.revision_reason) : null,
      revisionStartedByName: r.revision_started_by_name ? String(r.revision_started_by_name) : null,
      revisionStartedAt: r.revision_started_at ? String(r.revision_started_at) : null,
      sourceApprovedVersion:
        r.source_approved_version !== null && r.source_approved_version !== undefined
          ? Number(r.source_approved_version)
          : null,
      latestApprovedVersion,
      latestApprovedAt,
      latestApprovedByName,
      latestApprovedPreparedAt,
      latestApprovedStatus,
      latestApprovedTotalReceived,
      latestApprovedCompletionRate,
    };
  });
}

export function createBlankMonthlyReport(params: {
  year: number;
  month: number;
  department: string;
  user: AuthUser;
}): MonthlyReportFull {
  const existing = db
    .prepare('SELECT id FROM reporting_periods WHERE year = ? AND month = ? AND department = ?')
    .get(params.year, params.month, params.department) as { id: string } | undefined;

  if (existing) {
    throw new Error('يوجد تقرير مسجل مسبقاً لنفس الشهر والسنة والنطاق الإداري');
  }

  const prevReport =
    (db
      .prepare(
        `SELECT preparer_name, preparer_title, approver_name, approver_title
         FROM monthly_reports
         WHERE (year < ? OR (year = ? AND month < ?))
         ORDER BY year DESC, month DESC, updated_at DESC
         LIMIT 1`
      )
      .get(params.year, params.year, params.month) as
      | {
          preparer_name: string;
          preparer_title: string;
          approver_name: string;
          approver_title: string;
        }
      | undefined) ??
    (db
      .prepare(
        `SELECT preparer_name, preparer_title, approver_name, approver_title
         FROM monthly_reports
         ORDER BY year DESC, month DESC, updated_at DESC
         LIMIT 1`
      )
      .get() as
      | {
          preparer_name: string;
          preparer_title: string;
          approver_name: string;
          approver_title: string;
        }
      | undefined);

  const initialPreparerName = (prevReport?.preparer_name || '').trim() || params.user.fullName;
  const initialPreparerTitle = (prevReport?.preparer_title || '').trim() || params.user.jobTitle;
  const initialApproverName = (prevReport?.approver_name || '').trim();
  const initialApproverTitle = (prevReport?.approver_title || '').trim();

  const now = new Date().toISOString();
  const periodId = `period_${params.year}_${String(params.month).padStart(2, '0')}_${crypto.randomUUID().slice(0, 6)}`;
  const reportId = `rep_${params.year}_${String(params.month).padStart(2, '0')}_${crypto.randomUUID().slice(0, 8)}`;

  // Generate unique sequential report number FM-YYYY-MM-NNN
  const seqRow = db
    .prepare('SELECT COUNT(*) as cnt FROM monthly_reports WHERE year = ? AND month = ?')
    .get(params.year, params.month) as { cnt: number };
  const seq = String(seqRow.cnt + 1).padStart(3, '0');
  const reportNumber = `FM-${params.year}-${String(params.month).padStart(2, '0')}-${seq}`;

  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare('INSERT INTO reporting_periods (id, year, month, department, created_at) VALUES (?, ?, ?, ?, ?)').run(
      periodId,
      params.year,
      params.month,
      params.department,
      now
    );

    db.prepare(
      `INSERT INTO monthly_reports (
        id, period_id, report_number, year, month, department, company, classification,
        status, current_version,
        preparer_id, preparer_name, preparer_title,
        approver_name, approver_title,
        maint_from_facilities, maint_from_other, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'Public', 'draft', 1, ?, ?, ?, ?, ?, 0, 0, ?, ?)`
    ).run(
      reportId,
      periodId,
      reportNumber,
      params.year,
      params.month,
      params.department,
      'ساعد للأنظمة المرورية — SAAED',
      params.user.id,
      initialPreparerName,
      initialPreparerTitle,
      initialApproverName,
      initialApproverTitle,
      now,
      now
    );

    const insSvc = db.prepare(
      'INSERT INTO service_metrics (id, report_id, service_id, sort_order, summary_order, name_ar, name_en, received_count, executed_count) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0)'
    );
    for (const s of DEFAULT_SERVICES) {
      insSvc.run(`${reportId}_${s.serviceId}`, reportId, s.serviceId, s.sortOrder, s.summaryOrder, s.nameAr, s.nameEn);
    }

    const insCon = db.prepare(
      'INSERT INTO contracts_licenses (id, report_id, group_key, name_ar, name_en, active_count, inactive_count, notes) VALUES (?, ?, ?, ?, ?, 0, 0, ?)'
    );
    insCon.run(`${reportId}_rental`, reportId, 'rental_contracts', 'العقود الإيجارية', 'Rental Contracts', '');
    insCon.run(`${reportId}_commercial`, reportId, 'commercial_licenses', 'الرخص التجارية', 'Commercial Licenses', '');
    insCon.run(`${reportId}_service`, reportId, 'service_contracts', 'عقود الخدمات', 'Service Contracts', '');

    const insSaf = db.prepare(
      'INSERT INTO safety_metrics (id, report_id, group_key, name_ar, name_en, primary_label_ar, primary_label_en, secondary_label_ar, secondary_label_en, primary_count, secondary_count, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?)'
    );
    insSaf.run(`${reportId}_ext`, reportId, 'fire_extinguishers', 'عدد الطفايات', 'Fire Extinguishers', 'فعّالة', 'Active', 'غير فعّالة', 'Inactive', '');
    insSaf.run(`${reportId}_risk`, reportId, 'risk_observations', 'عدد ملاحظات المخاطر', 'Risk Observations', 'مغلقة', 'Closed', 'غير مغلقة', 'Not closed', '');

    const sites = db.prepare('SELECT id FROM maintenance_sites').all() as Array<{ id: string }>;
    const cats = db.prepare('SELECT id FROM maintenance_categories').all() as Array<{ id: string }>;
    const insMaint = db.prepare(
      'INSERT INTO maintenance_records (id, report_id, site_id, category_id, fault_count) VALUES (?, ?, ?, ?, 0)'
    );
    for (const site of sites) {
      for (const cat of cats) {
        insMaint.run(`${reportId}_${site.id}_${cat.id}`, reportId, site.id, cat.id);
      }
    }

    const insCost = db.prepare(
      'INSERT INTO maintenance_costs (id, report_id, category_id, petty_cash_aed, purchase_order_aed) VALUES (?, ?, ?, 0, 0)'
    );
    for (const cat of cats) {
      insCost.run(`${reportId}_cost_${cat.id}`, reportId, cat.id);
    }

    const insLog = db.prepare(
      'INSERT INTO logistics_metrics (id, report_id, channel_key, name_ar, name_en, request_count, sort_order) VALUES (?, ?, ?, ?, ?, 0, ?)'
    );
    for (const ch of DEFAULT_LOGISTICS_CHANNELS) {
      insLog.run(`${reportId}_${ch.channelKey}`, reportId, ch.channelKey, ch.nameAr, ch.nameEn, ch.sortOrder);
    }

    const insRec = db.prepare(
      'INSERT INTO reception_metrics (id, report_id, activity_key, name_ar, name_en, received_count, executed_count, sort_order) VALUES (?, ?, ?, ?, ?, 0, 0, ?)'
    );
    for (const act of DEFAULT_SECURITY_ACTIVITIES) {
      insRec.run(`${reportId}_${act.activityKey}`, reportId, act.activityKey, act.nameAr, act.nameEn, act.sortOrder);
    }

    db.prepare(
      'INSERT INTO tasks (id, report_id, row_order, topic, task_name, status, completion_pct) VALUES (?, ?, 1, ?, ?, ?, 0)'
    ).run(`${reportId}_task_1`, reportId, '', '', TASK_STATUSES.NOT_STARTED);

    db.prepare(
      'INSERT INTO challenges (id, report_id, row_order, challenge_text, update_text, recommendation_text) VALUES (?, ?, 1, ?, ?, ?)'
    ).run(`${reportId}_chal_1`, reportId, '', '', '');

    db.prepare(
      'INSERT INTO audit_logs (id, report_id, user_id, user_name, user_role, action, field_path, previous_value, new_value, reason, version_number, report_status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)'
    ).run(
      crypto.randomUUID(),
      reportId,
      params.user.id,
      params.user.fullName,
      params.user.role,
      'إنشاء تقرير جديد',
      'monthly_reports',
      '',
      reportNumber,
      `إنشاء مسودة مستقلة لشهر ${params.month}/${params.year}`,
      REPORT_STATUSES.DRAFT,
      now
    );

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  const created = getReportById(reportId);
  if (!created) throw new Error('تعذر تحميل التقرير بعد إنشائه');
  const populated = populateReportWithSampleData(created, getAllSites(), getAllCategories());
  return saveReportData(reportId, populated, params.user);
}

export function saveReportData(reportId: string, payload: MonthlyReportFull, user: AuthUser): MonthlyReportFull {
  // Validate services & non-negative counts before opening write transaction
  const seenServiceIds = new Set<string>();
  for (const s of payload.services) {
    if (!s.nameAr || !s.nameAr.trim()) {
      throw new DomainError('يجب إدخال اسم الخدمة باللغة العربية لجميع بنود الخدمات', 400);
    }
    if (s.receivedCount < 0 || s.executedCount < 0) {
      throw new DomainError('لا يُسمح بالقيم السالبة في حقول الطلبات', 400);
    }
    const sid = (s.serviceId || '').trim();
    if (sid && seenServiceIds.has(sid)) {
      throw new DomainError('يوجد معرف خدمة مكرر في قائمة الخدمات', 400);
    }
    if (sid) seenServiceIds.add(sid);
  }
  for (const t of payload.tasks) {
    if (t.completionPct < 0 || t.completionPct > 100) {
      throw new DomainError('نسبة إنجاز المهمة يجب أن تكون بين 0 و 100', 400);
    }
    if (t.status === TASK_STATUSES.COMPLETED && (!t.topic.trim() && !t.taskName.trim())) {
      throw new DomainError('لا يمكن اعتبار صف فارغ مهمة مكتملة', 400);
    }
  }
  const seenSecurityKeys = new Set<string>();
  for (const sr of payload.securityReception || []) {
    if (!sr.nameAr || !sr.nameAr.trim()) {
      throw new DomainError('يجب إدخال مسمى البيان لجميع أعمدة خدمات الأمن والاستقبال', 400);
    }
    if (sr.receivedCount < 0 || sr.executedCount < 0) {
      throw new DomainError('لا يُسمح بالقيم السالبة في حقول خدمات الأمن والاستقبال', 400);
    }
    const key = (sr.activityKey || '').trim();
    if (key && seenSecurityKeys.has(key)) {
      throw new DomainError('يوجد معرف مكرر في أعمدة خدمات الأمن والاستقبال', 400);
    }
    if (key) seenSecurityKeys.add(key);
  }

  // Note: electronic signature images & statuses are ONLY written via dedicated saveReportSignature()
  // so draft/payload edits can never spoof or alter persisted electronic signatures.
  const sanitizedPreparedAt = sanitizeReportDate(payload.preparedAt);
  const sanitizedApprovedAt = sanitizeReportDate(payload.approvedAt);
  const now = new Date().toISOString();
  const syncedPayload = syncReceptionServiceWithSecurity(payload);
  const sitesList = getAllSites();
  const categoriesList = getAllCategories();

  db.exec('BEGIN IMMEDIATE');
  try {
    const existing = getReportById(reportId);
    if (!existing) throw new DomainError('التقرير غير موجود', 404);

    if (existing.status === REPORT_STATUSES.APPROVED || existing.status === REPORT_STATUSES.ARCHIVED) {
      throw new DomainError('يُمنع تعديل النسخة المعتمدة أو المؤرشفة مباشرة. استخدم «تحرير التقرير بعد الاعتماد» لفتح إصدار جديد.', 403);
    }
    if (existing.status !== REPORT_STATUSES.DRAFT && user.role !== USER_ROLES.ADMIN) {
      throw new DomainError('لا يمكن تعديل التقرير بعد تقديمه للمراجعة إلا بعد إرجاعه كمسودة', 403);
    }
    if (existing.isPostApprovalRevision && !isAuthorizedPostApprovalOwner(user, existing)) {
      throw new DomainError('ليس لديك صلاحية تعديل هذا التقرير المعتمد', 403);
    }
    if (!canEditWorkingReport(user, existing)) {
      throw new DomainError('ليس لديك صلاحية تعديل هذا التقرير', 403);
    }

    // Optimistic Concurrency Check (prevents concurrent editors overwriting each other silently)
    const expectedLock = payload.expectedLockVersion ?? payload.lockVersion;
    if (
      expectedLock !== undefined &&
      expectedLock !== null &&
      Number.isFinite(Number(expectedLock)) &&
      Number(expectedLock) !== Number(existing.lockVersion ?? 1)
    ) {
      throw new DomainError(
        'تم حفظ تعديلات أحدث على هذا التقرير من مستخدم أو جلسة أخرى. يرجى تحديث الصفحة ومراجعة آخر نسخة قبل الحفظ لتجنب تعارض البيانات.',
        409
      );
    }

    const updHeader = db.prepare(
      `UPDATE monthly_reports SET
        classification = ?,
        preparer_name = ?,
        preparer_title = ?,
        prepared_at = ?,
        approver_name = ?,
        approver_title = ?,
        approved_at = ?,
        maint_from_facilities = ?,
        maint_from_other = ?,
        lock_version = COALESCE(lock_version, 1) + 1,
        updated_at = ?
      WHERE id = ? AND COALESCE(lock_version, 1) = ?`
    ).run(
      payload.classification || 'Public',
      payload.preparerName || '',
      payload.preparerTitle || '',
      sanitizedPreparedAt,
      payload.approverName || '',
      payload.approverTitle || '',
      sanitizedApprovedAt,
      Math.max(0, Math.round(Number(payload.maintenanceServices.fromFacilitiesDept) || 0)),
      Math.max(0, Math.round(Number(payload.maintenanceServices.fromOtherDepts) || 0)),
      now,
      reportId,
      Number(existing.lockVersion ?? 1)
    );
    if (Number(updHeader.changes) === 0) {
      throw new DomainError('تغير إصدار القفل المتزامن للتقرير أثناء الحفظ. أعد تحميل الصفحة وحاول مجدداً.', 409);
    }

    db.prepare('DELETE FROM service_metrics WHERE report_id = ?').run(reportId);
    const insSvc = db.prepare(
      'INSERT INTO service_metrics (id, report_id, service_id, sort_order, summary_order, name_ar, name_en, received_count, executed_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    syncedPayload.services.forEach((s, idx) => {
      const sid = (s.serviceId || '').trim() || `svc_${crypto.randomUUID().slice(0, 8)}`;
      const nameAr = s.nameAr.trim();
      const nameEn = (s.nameEn || '').trim() || nameAr;
      const sortOrder = Number.isFinite(Number(s.sortOrder)) && Number(s.sortOrder) > 0 ? Number(s.sortOrder) : idx + 1;
      const summaryOrder =
        Number.isFinite(Number(s.summaryOrder)) && Number(s.summaryOrder) > 0 ? Number(s.summaryOrder) : idx + 1;
      insSvc.run(
        `${reportId}_${sid}`,
        reportId,
        sid,
        sortOrder,
        summaryOrder,
        nameAr,
        nameEn,
        Math.max(0, Math.round(Number(s.receivedCount) || 0)),
        Math.max(0, Math.round(Number(s.executedCount) || 0))
      );
    });

    const updCon = db.prepare(
      'UPDATE contracts_licenses SET active_count = ?, inactive_count = ?, notes = ? WHERE report_id = ? AND group_key = ?'
    );
    for (const c of payload.contracts) {
      updCon.run(
        Math.max(0, Math.round(Number(c.activeCount) || 0)),
        Math.max(0, Math.round(Number(c.inactiveCount) || 0)),
        c.notes || '',
        reportId,
        c.groupKey
      );
    }

    const updSaf = db.prepare(
      'UPDATE safety_metrics SET primary_count = ?, secondary_count = ?, notes = ? WHERE report_id = ? AND group_key = ?'
    );
    for (const sf of payload.safety) {
      updSaf.run(
        Math.max(0, Math.round(Number(sf.primaryCount) || 0)),
        Math.max(0, Math.round(Number(sf.secondaryCount) || 0)),
        sf.notes || '',
        reportId,
        sf.groupKey
      );
    }

    const upsertMaint = db.prepare(
      `INSERT INTO maintenance_records (id, report_id, site_id, category_id, fault_count)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(report_id, site_id, category_id) DO UPDATE SET fault_count = excluded.fault_count`
    );
    for (const [siteId, catMap] of Object.entries(payload.maintenanceMatrix || {})) {
      for (const [catId, count] of Object.entries(catMap || {})) {
        upsertMaint.run(
          `${reportId}_${siteId}_${catId}`,
          reportId,
          siteId,
          catId,
          Math.max(0, Math.round(Number(count) || 0))
        );
      }
    }

    const upsertCost = db.prepare(
      `INSERT INTO maintenance_costs (id, report_id, category_id, petty_cash_aed, purchase_order_aed)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(report_id, category_id) DO UPDATE SET
         petty_cash_aed = excluded.petty_cash_aed,
         purchase_order_aed = excluded.purchase_order_aed`
    );
    for (const [catId, entry] of Object.entries(payload.maintenanceCosts || {})) {
      upsertCost.run(
        `${reportId}_cost_${catId}`,
        reportId,
        catId,
        Math.max(0, Math.round((Number(entry.pettyCashAed) || 0) * 100) / 100),
        Math.max(0, Math.round((Number(entry.purchaseOrderAed) || 0) * 100) / 100)
      );
    }

    const updLog = db.prepare('UPDATE logistics_metrics SET request_count = ? WHERE report_id = ? AND channel_key = ?');
    for (const l of payload.logistics) {
      updLog.run(Math.max(0, Math.round(Number(l.requestCount) || 0)), reportId, l.channelKey);
    }

    db.prepare('DELETE FROM reception_metrics WHERE report_id = ?').run(reportId);
    const insRec = db.prepare(
      'INSERT INTO reception_metrics (id, report_id, activity_key, name_ar, name_en, received_count, executed_count, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    );
    (payload.securityReception || []).forEach((sr, idx) => {
      const actKey = (sr.activityKey || '').trim() || `sec_${crypto.randomUUID().slice(0, 8)}`;
      const nameAr = sr.nameAr.trim();
      const nameEn = (sr.nameEn || '').trim() || nameAr;
      const sortOrder =
        Number.isFinite(Number(sr.sortOrder)) && Number(sr.sortOrder) > 0 ? Number(sr.sortOrder) : idx + 1;
      insRec.run(
        `${reportId}_${actKey}`,
        reportId,
        actKey,
        nameAr,
        nameEn,
        Math.max(0, Math.round(Number(sr.receivedCount) || 0)),
        Math.max(0, Math.round(Number(sr.executedCount) || 0)),
        sortOrder
      );
    });

    db.prepare('DELETE FROM tasks WHERE report_id = ?').run(reportId);
    const insTask = db.prepare(
      'INSERT INTO tasks (id, report_id, row_order, topic, task_name, status, completion_pct) VALUES (?, ?, ?, ?, ?, ?, ?)'
    );
    payload.tasks.forEach((t, idx) => {
      insTask.run(
        t.id || crypto.randomUUID(),
        reportId,
        idx + 1,
        t.topic || '',
        t.taskName || '',
        t.status || TASK_STATUSES.NOT_STARTED,
        Math.max(0, Math.min(100, Math.round(Number(t.completionPct) || 0)))
      );
    });

    db.prepare('DELETE FROM challenges WHERE report_id = ?').run(reportId);
    const insChal = db.prepare(
      'INSERT INTO challenges (id, report_id, row_order, challenge_text, update_text, recommendation_text) VALUES (?, ?, ?, ?, ?, ?)'
    );
    payload.challenges.forEach((c, idx) => {
      insChal.run(
        c.id || crypto.randomUUID(),
        reportId,
        idx + 1,
        c.challengeText || '',
        c.updateText || '',
        c.recommendationText || ''
      );
    });

    const diffs = computeReportFieldDiffs(existing, {
      ...syncedPayload,
      preparedAt: sanitizedPreparedAt,
      approvedAt: sanitizedApprovedAt,
    }, sitesList, categoriesList);

    const insertAudit = db.prepare(
      'INSERT INTO audit_logs (id, report_id, user_id, user_name, user_role, action, field_path, previous_value, new_value, reason, version_number, report_status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    const reasonPrefix = existing.isPostApprovalRevision && existing.revisionReason
      ? `تعديل ما بعد الاعتماد (${existing.revisionReason})`
      : 'تحديث البيانات التشغيلية في المسودة';

    if (diffs.length === 0) {
      insertAudit.run(
        crypto.randomUUID(),
        reportId,
        user.id,
        user.fullName,
        user.role,
        'حفظ بيانات التقرير',
        'monthly_reports',
        existing.updatedAt,
        now,
        reasonPrefix,
        existing.currentVersion,
        existing.status,
        now
      );
    } else {
      const cappedDiffs = diffs.slice(0, 60);
      for (const d of cappedDiffs) {
        insertAudit.run(
          crypto.randomUUID(),
          reportId,
          user.id,
          user.fullName,
          user.role,
          `تعديل حقل: ${d.fieldLabel}`,
          d.fieldPath,
          d.previousValue,
          d.newValue,
          reasonPrefix,
          existing.currentVersion,
          existing.status,
          now
        );
      }
      if (diffs.length > 60) {
        insertAudit.run(
          crypto.randomUUID(),
          reportId,
          user.id,
          user.fullName,
          user.role,
          'تعديلات إضافية محفوظة',
          'monthly_reports',
          `${diffs.length} حقول معدّلة`,
          'مكتمل',
          reasonPrefix,
          existing.currentVersion,
          existing.status,
          now
        );
      }
    }

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  return getReportById(reportId)!;
}

export function sanitizeSignatureDataUrl(val: unknown): string | null {
  if (val === null || val === undefined || val === '') return null;
  if (typeof val !== 'string') {
    throw new DomainError('صيغة صورة التوقيع غير صالحة', 400);
  }
  const trimmed = val.trim();
  if (!trimmed) return null;
  if (trimmed.length > 750_000) {
    throw new DomainError('حجم صورة التوقيع يتجاوز الحد المسموح (الحد الأقصى ~500 كيلوبايت)', 400);
  }
  if (!/^data:image\/(png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=]+$/.test(trimmed)) {
    throw new DomainError('يجب أن تكون صورة التوقيع بصيغة PNG أو JPG أو WEBP صالحة', 400);
  }
  if (!isValidSignatureDataUrl(trimmed)) {
    throw new DomainError('صورة التوقيع فارغة أو غير صالحة للاستخدام الرسمي', 400);
  }
  return trimmed;
}

export function sanitizeReportDate(val: unknown): string | null {
  if (val === null || val === undefined || val === '') return null;
  if (typeof val !== 'string') {
    throw new Error('صيغة التاريخ غير صالحة');
  }
  const trimmed = normalizeDigits(val).trim();
  if (!trimmed) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const parsed = new Date(`${trimmed}T12:00:00.000Z`);
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== trimmed) {
      throw new Error('التاريخ المدخل غير صحيح');
    }
    return `${trimmed}T12:00:00.000Z`;
  }

  const parsedDDMMYYYY = parseDisplayDateDDMMYYYY(trimmed);
  if (parsedDDMMYYYY) {
    return `${parsedDDMMYYYY}T12:00:00.000Z`;
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error('يرجى إدخال تاريخ صحيح');
  }
  return parsed.toISOString();
}

export function saveReportDate(params: {
  reportId: string;
  target: 'preparedAt' | 'approvedAt';
  dateValue: string | null;
  user: AuthUser;
}): MonthlyReportFull {
  const existing = getReportById(params.reportId);
  if (!existing) throw new DomainError('التقرير غير موجود', 404);

  if (existing.status === REPORT_STATUSES.APPROVED || existing.status === REPORT_STATUSES.ARCHIVED) {
    throw new DomainError('يُمنع تعديل تواريخ النسخة المعتمدة أو المؤرشفة مباشرة', 403);
  }

  const { user, target } = params;
  const isDraft = existing.status === REPORT_STATUSES.DRAFT;

  if (target === 'preparedAt') {
    const allowed =
      user.role === USER_ROLES.ADMIN ||
      (user.role === USER_ROLES.PREPARER &&
        isDraft &&
        (!existing.isPostApprovalRevision || isAuthorizedPostApprovalOwner(user, existing)));
    if (!allowed) {
      throw new DomainError('لا تملك صلاحية تعديل تاريخ التقديم في هذه المرحلة', 403);
    }
  } else if (target === 'approvedAt') {
    const allowed =
      user.role === USER_ROLES.ADMIN ||
      user.role === USER_ROLES.APPROVER ||
      (user.role === USER_ROLES.PREPARER &&
        isDraft &&
        (!existing.isPostApprovalRevision || isAuthorizedPostApprovalOwner(user, existing)));
    if (!allowed) {
      throw new DomainError('لا تملك صلاحية تعديل تاريخ الاعتماد في هذه المرحلة', 403);
    }
  } else {
    throw new DomainError('حقل التاريخ غير صالح', 400);
  }

  const sanitized = sanitizeReportDate(params.dateValue);
  const now = new Date().toISOString();
  const column = target === 'preparedAt' ? 'prepared_at' : 'approved_at';
  const label = target === 'preparedAt' ? 'تاريخ التقديم' : 'تاريخ الاعتماد';

  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare(`UPDATE monthly_reports SET ${column} = ?, lock_version = COALESCE(lock_version, 1) + 1, updated_at = ? WHERE id = ?`).run(
      sanitized,
      now,
      params.reportId
    );

    db.prepare(
      'INSERT INTO audit_logs (id, report_id, user_id, user_name, user_role, action, field_path, previous_value, new_value, reason, version_number, report_status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(
      crypto.randomUUID(),
      params.reportId,
      user.id,
      user.fullName,
      user.role,
      `تحديث ${label}`,
      target,
      formatDateWestern(existing[target], ''),
      formatDateWestern(sanitized, ''),
      `تعديل ${label} يدوياً`,
      existing.currentVersion,
      existing.status,
      now
    );

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  return getReportById(params.reportId)!;
}

export function saveReportSignature(params: {
  reportId: string;
  target: 'preparer' | 'approver';
  signatureImage: string | null;
  user: AuthUser;
}): MonthlyReportFull {
  const existing = getReportById(params.reportId);
  if (!existing) throw new DomainError('التقرير غير موجود', 404);

  if (existing.status === REPORT_STATUSES.APPROVED || existing.status === REPORT_STATUSES.ARCHIVED) {
    throw new DomainError('يُمنع تعديل توقيعات النسخة المعتمدة أو المؤرشفة مباشرة', 403);
  }

  const { user, target } = params;
  const isDraft = existing.status === REPORT_STATUSES.DRAFT;

  if (target === 'preparer') {
    const allowed =
      user.role === USER_ROLES.ADMIN ||
      (user.role === USER_ROLES.PREPARER &&
        isDraft &&
        (!existing.isPostApprovalRevision || isAuthorizedPostApprovalOwner(user, existing)));
    if (!allowed) {
      throw new DomainError('لا تملك صلاحية تعديل توقيع معد التقرير في هذه المرحلة', 403);
    }
  } else if (target === 'approver') {
    // STRICT RBAC: Only ADMIN or APPROVER may add/update/remove the Approver signature.
    // Preparer/Reviewer/Viewer are strictly prohibited from signing on behalf of the Approver.
    const allowed = user.role === USER_ROLES.ADMIN || user.role === USER_ROLES.APPROVER;
    if (!allowed) {
      throw new DomainError(
        'صلاحية توقيع المعتمد مخصصة لصاحب صلاحية الاعتماد أو مدير النظام فقط — لا يُسمح بتوقيع المعتمد من قبل مستخدم غير مخوّل',
        403
      );
    }
  } else {
    throw new DomainError('نوع التوقيع المطلوب غير صحيح', 400);
  }

  const sanitized = sanitizeSignatureDataUrl(params.signatureImage);

  // Enforce Smart Report Completeness Validation before adding/updating a signature
  // (Removing a signature via null is always permitted)
  if (sanitized !== null) {
    const validation = validateReportCompleteness(existing, {
      stage: target === 'preparer' ? 'sign_preparer' : 'sign_approver',
      sites: getAllSites(),
      categories: getAllCategories(),
      user,
    });
    if (!validation.isComplete) {
      const firstMsg = validation.issues[0]?.message || 'توجد بيانات إلزامية غير مكتملة';
      throw new DomainError(
        `تعذر استكمال التوقيع لوجود بيانات غير مكتملة (${validation.missingRequiredFields} حقول ناقصة): ${firstMsg}`,
        400,
        validation
      );
    }
  }

  const now = new Date().toISOString();
  const roleLabel = target === 'preparer' ? 'معد التقرير' : 'المعتمد';
  const fieldPath = target === 'preparer' ? 'preparerSignatureImage' : 'approverSignatureImage';

  db.exec('BEGIN IMMEDIATE');
  try {
    if (target === 'preparer') {
      db.prepare(
        `UPDATE monthly_reports SET
          preparer_signature_image = ?,
          preparer_signed_at = ?,
          preparer_signed_by_id = ?,
          preparer_signed_by_name = ?,
          preparer_signature_status = 'valid',
          lock_version = COALESCE(lock_version, 1) + 1,
          updated_at = ?
        WHERE id = ?`
      ).run(
        sanitized,
        sanitized ? now : null,
        sanitized ? user.id : null,
        sanitized ? user.fullName : null,
        now,
        params.reportId
      );
    } else {
      const effectiveApproverName = existing.approverName.trim() || user.fullName;
      const effectiveApproverTitle = existing.approverTitle.trim() || user.jobTitle;
      db.prepare(
        `UPDATE monthly_reports SET
          approver_signature_image = ?,
          approver_signed_at = ?,
          approver_signed_by_id = ?,
          approver_signed_by_name = ?,
          approver_signature_status = 'valid',
          approver_name = CASE WHEN TRIM(approver_name) = '' THEN ? ELSE approver_name END,
          approver_title = CASE WHEN TRIM(approver_title) = '' THEN ? ELSE approver_title END,
          lock_version = COALESCE(lock_version, 1) + 1,
          updated_at = ?
        WHERE id = ?`
      ).run(
        sanitized,
        sanitized ? now : null,
        sanitized ? user.id : null,
        sanitized ? user.fullName : null,
        effectiveApproverName,
        effectiveApproverTitle,
        now,
        params.reportId
      );
    }

    db.prepare(
      'INSERT INTO audit_logs (id, report_id, user_id, user_name, user_role, action, field_path, previous_value, new_value, reason, version_number, report_status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(
      crypto.randomUUID(),
      params.reportId,
      user.id,
      user.fullName,
      user.role,
      sanitized ? `إضافة / تحديث توقيع ${roleLabel}` : `حذف توقيع ${roleLabel}`,
      fieldPath,
      existing[fieldPath] ? 'توقيع محفوظ' : 'بدون توقيع',
      sanitized ? 'توقيع مرفق/مرسوم' : 'محذوف',
      `تحديث التوقيع الرسمي لـ ${roleLabel}`,
      existing.currentVersion,
      existing.status,
      now
    );

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  return getReportById(params.reportId)!;
}

function ensureImmutableApprovedSnapshot(report: MonthlyReportFull, actingUser: AuthUser): void {
  const existingRow = db
    .prepare('SELECT id FROM report_versions WHERE report_id = ? AND version_number = ?')
    .get(report.id, report.currentVersion) as { id: string } | undefined;
  if (existingRow) return;

  const sites = getAllSites();
  const categories = getAllCategories();
  const thresholds = getThresholds();
  const sigToken =
    report.approverSignatureHash ||
    createSignatureToken(report.approverId || actingUser.id, report.id, report.currentVersion, 'approve');
  const snapshotPayload = {
    report,
    sites,
    categories,
    thresholds,
    approvedAt: report.approvedAt || report.updatedAt,
    preparerSignedAt: report.preparerSignedAt ?? report.preparedAt,
    approverSignedAt: report.approverSignedAt ?? report.approvedAt,
    approvedBy: {
      id: report.approverId || actingUser.id,
      fullName: report.approverName || actingUser.fullName,
      jobTitle: report.approverTitle || actingUser.jobTitle,
    },
    signatureToken: sigToken,
  };
  db.prepare(
    `INSERT INTO report_versions
      (id, report_id, version_number, snapshot_json, approved_by_id, approved_by_name, signature_token, created_at, revision_reason, source_approved_version, edited_by_name)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    crypto.randomUUID(),
    report.id,
    report.currentVersion,
    JSON.stringify(snapshotPayload),
    report.approverId || actingUser.id,
    report.approverName || actingUser.fullName,
    sigToken,
    report.approvedAt || report.updatedAt,
    report.revisionReason ?? null,
    report.sourceApprovedVersion ?? null,
    report.revisionStartedByName ?? report.preparerName ?? null
  );
}

function restoreReportChildrenFromSnapshot(reportId: string, snapReport: MonthlyReportFull): void {
  db.prepare('DELETE FROM service_metrics WHERE report_id = ?').run(reportId);
  const insSvc = db.prepare(
    'INSERT INTO service_metrics (id, report_id, service_id, sort_order, summary_order, name_ar, name_en, received_count, executed_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  );
  snapReport.services.forEach((s, idx) => {
    insSvc.run(
      `${reportId}_${s.serviceId}`,
      reportId,
      s.serviceId,
      s.sortOrder ?? idx + 1,
      s.summaryOrder ?? idx + 1,
      s.nameAr,
      s.nameEn || s.nameAr,
      s.receivedCount,
      s.executedCount
    );
  });

  db.prepare('DELETE FROM contracts_licenses WHERE report_id = ?').run(reportId);
  const insCon = db.prepare(
    'INSERT INTO contracts_licenses (id, report_id, group_key, name_ar, name_en, active_count, inactive_count, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  );
  for (const c of snapReport.contracts) {
    insCon.run(`${reportId}_${c.groupKey}`, reportId, c.groupKey, c.nameAr, c.nameEn, c.activeCount, c.inactiveCount, c.notes || '');
  }

  db.prepare('DELETE FROM safety_metrics WHERE report_id = ?').run(reportId);
  const insSaf = db.prepare(
    'INSERT INTO safety_metrics (id, report_id, group_key, name_ar, name_en, primary_label_ar, primary_label_en, secondary_label_ar, secondary_label_en, primary_count, secondary_count, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  );
  for (const sf of snapReport.safety) {
    insSaf.run(
      `${reportId}_${sf.groupKey}`,
      reportId,
      sf.groupKey,
      sf.nameAr,
      sf.nameEn,
      sf.primaryLabelAr,
      sf.primaryLabelEn,
      sf.secondaryLabelAr,
      sf.secondaryLabelEn,
      sf.primaryCount,
      sf.secondaryCount,
      sf.notes || ''
    );
  }

  db.prepare('DELETE FROM maintenance_records WHERE report_id = ?').run(reportId);
  const insMaint = db.prepare(
    'INSERT INTO maintenance_records (id, report_id, site_id, category_id, fault_count) VALUES (?, ?, ?, ?, ?)'
  );
  for (const [siteId, catMap] of Object.entries(snapReport.maintenanceMatrix || {})) {
    for (const [catId, count] of Object.entries(catMap || {})) {
      insMaint.run(`${reportId}_${siteId}_${catId}`, reportId, siteId, catId, Number(count) || 0);
    }
  }

  db.prepare('DELETE FROM maintenance_costs WHERE report_id = ?').run(reportId);
  const insCost = db.prepare(
    'INSERT INTO maintenance_costs (id, report_id, category_id, petty_cash_aed, purchase_order_aed) VALUES (?, ?, ?, ?, ?)'
  );
  for (const [catId, entry] of Object.entries(snapReport.maintenanceCosts || {})) {
    insCost.run(`${reportId}_cost_${catId}`, reportId, catId, Number(entry.pettyCashAed) || 0, Number(entry.purchaseOrderAed) || 0);
  }

  db.prepare('DELETE FROM logistics_metrics WHERE report_id = ?').run(reportId);
  const insLog = db.prepare(
    'INSERT INTO logistics_metrics (id, report_id, channel_key, name_ar, name_en, request_count, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );
  for (const l of snapReport.logistics) {
    insLog.run(`${reportId}_${l.channelKey}`, reportId, l.channelKey, l.nameAr, l.nameEn, l.requestCount, l.sortOrder);
  }

  db.prepare('DELETE FROM reception_metrics WHERE report_id = ?').run(reportId);
  const insRec = db.prepare(
    'INSERT INTO reception_metrics (id, report_id, activity_key, name_ar, name_en, received_count, executed_count, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  );
  for (const sr of snapReport.securityReception) {
    insRec.run(`${reportId}_${sr.activityKey}`, reportId, sr.activityKey, sr.nameAr, sr.nameEn, sr.receivedCount, sr.executedCount, sr.sortOrder);
  }

  db.prepare('DELETE FROM tasks WHERE report_id = ?').run(reportId);
  const insTask = db.prepare(
    'INSERT INTO tasks (id, report_id, row_order, topic, task_name, status, completion_pct) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );
  snapReport.tasks.forEach((t, idx) => {
    insTask.run(t.id || crypto.randomUUID(), reportId, t.rowOrder ?? idx + 1, t.topic, t.taskName, t.status, t.completionPct);
  });

  db.prepare('DELETE FROM challenges WHERE report_id = ?').run(reportId);
  const insChal = db.prepare(
    'INSERT INTO challenges (id, report_id, row_order, challenge_text, update_text, recommendation_text) VALUES (?, ?, ?, ?, ?, ?)'
  );
  snapReport.challenges.forEach((c, idx) => {
    insChal.run(c.id || crypto.randomUUID(), reportId, c.rowOrder ?? idx + 1, c.challengeText, c.updateText, c.recommendationText);
  });
}

export function transitionWorkflow(params: {
  reportId: string;
  action:
    | 'submit_review'
    | 'start_review'
    | 'return_revision'
    | 'forward_approval'
    | 'approve'
    | 'archive'
    | 'create_revision'
    | 'cancel_revision';
  user: AuthUser;
  comment?: string;
  approverName?: string;
  approverTitle?: string;
  expectedVersion?: number;
}): MonthlyReportFull {
  const { user, action, comment = '' } = params;

  db.exec('BEGIN IMMEDIATE');
  try {
    const report = getReportById(params.reportId);
    if (!report) throw new DomainError('التقرير غير موجود', 404);

    const now = new Date().toISOString();
    const fromStatus = report.status;
    let toStatus: ReportStatus = fromStatus;
    let recordedVersion = report.currentVersion;

    // Enforce strict RBAC + state machine transitions + Dual Signature Gate
    if (action === 'submit_review') {
      if (!([USER_ROLES.ADMIN, USER_ROLES.PREPARER] as UserRole[]).includes(user.role)) {
        throw new DomainError('صلاحية تقديم التقرير للمراجعة مخصصة لمعد التقرير أو مدير النظام فقط', 403);
      }
      if (report.isPostApprovalRevision && !isAuthorizedPostApprovalOwner(user, report)) {
        throw new DomainError('ليس لديك صلاحية إرسال تعديل هذا التقرير المعتمد', 403);
      }
      if (fromStatus !== REPORT_STATUSES.DRAFT) {
        throw new DomainError('يمكن إرسال التقرير للاعتماد من حالة المسودة فقط', 400);
      }
      if (!report.preparerName.trim() || !report.preparerTitle.trim()) {
        throw new DomainError('يجب استكمال اسم معد التقرير والمسمى الوظيفي قبل الإرسال للاعتماد', 400);
      }
      const submitValidation = validateReportCompleteness(report, {
        stage: 'submit_review',
        sites: getAllSites(),
        categories: getAllCategories(),
        user,
      });
      if (!submitValidation.isComplete) {
        const firstMsg = submitValidation.issues[0]?.message || 'توجد بيانات إلزامية غير مكتملة';
        throw new DomainError(
          `تعذر إرسال التقرير للاعتماد لوجود بيانات غير مكتملة (${submitValidation.missingRequiredFields} حقول): ${firstMsg}`,
          400,
          submitValidation
        );
      }
      toStatus = REPORT_STATUSES.PENDING_APPROVAL;
    } else if (action === 'start_review') {
      if (!([USER_ROLES.ADMIN, USER_ROLES.REVIEWER] as UserRole[]).includes(user.role)) {
        throw new DomainError('صلاحية بدء المراجعة مخصصة للمراجع أو مدير النظام فقط', 403);
      }
      if (fromStatus !== REPORT_STATUSES.READY_FOR_REVIEW) {
        throw new DomainError('التقرير ليس في حالة جاهز للمراجعة', 400);
      }
      const startValidation = validateReportCompleteness(report, {
        stage: 'start_review',
        sites: getAllSites(),
        categories: getAllCategories(),
        user,
      });
      if (!startValidation.isComplete) {
        throw new DomainError(
          `تعذر بدء المراجعة لوجود بيانات غير مكتملة (${startValidation.missingRequiredFields} حقول)`,
          400,
          startValidation
        );
      }
      toStatus = REPORT_STATUSES.UNDER_REVIEW;
    } else if (action === 'forward_approval') {
      if (!([USER_ROLES.ADMIN, USER_ROLES.REVIEWER] as UserRole[]).includes(user.role)) {
        throw new DomainError('صلاحية رفع التقرير للاعتماد مخصصة للمراجع أو مدير النظام فقط', 403);
      }
      if (fromStatus !== REPORT_STATUSES.UNDER_REVIEW && fromStatus !== REPORT_STATUSES.READY_FOR_REVIEW) {
        throw new DomainError('يجب أن يكون التقرير قيد المراجعة لرفعه للاعتماد', 400);
      }
      const fwdValidation = validateReportCompleteness(report, {
        stage: 'forward_approval',
        sites: getAllSites(),
        categories: getAllCategories(),
        user,
      });
      if (!fwdValidation.isComplete) {
        throw new DomainError(
          `تعذر رفع التقرير للاعتماد لوجود بيانات غير مكتملة (${fwdValidation.missingRequiredFields} حقول)`,
          400,
          fwdValidation
        );
      }
      toStatus = REPORT_STATUSES.PENDING_APPROVAL;
    } else if (action === 'return_revision') {
      if (!([USER_ROLES.ADMIN, USER_ROLES.REVIEWER, USER_ROLES.APPROVER] as UserRole[]).includes(user.role)) {
        throw new DomainError('لا تملك صلاحية إرجاع التقرير للتعديل', 403);
      }
      if (
        !(
          [
            REPORT_STATUSES.READY_FOR_REVIEW,
            REPORT_STATUSES.UNDER_REVIEW,
            REPORT_STATUSES.PENDING_APPROVAL,
          ] as ReportStatus[]
        ).includes(fromStatus)
      ) {
        throw new DomainError('لا يمكن إرجاع التقرير في حالته الحالية', 400);
      }
      if (!comment.trim()) {
        throw new DomainError('يجب كتابة سبب الإرجاع للتعديل', 400);
      }
      toStatus = REPORT_STATUSES.DRAFT;
    } else if (action === 'approve') {
      if (!([USER_ROLES.ADMIN, USER_ROLES.APPROVER] as UserRole[]).includes(user.role)) {
        throw new DomainError('صلاحية الاعتماد النهائي مخصصة للمعتمد أو مدير النظام فقط', 403);
      }
      if (fromStatus === REPORT_STATUSES.APPROVED || fromStatus === REPORT_STATUSES.ARCHIVED) {
        throw new DomainError('التقرير معتمد مسبقاً ولا يمكن إعادة اعتماده مرتين', 409);
      }
      if (
        fromStatus !== REPORT_STATUSES.PENDING_APPROVAL &&
        fromStatus !== REPORT_STATUSES.READY_FOR_REVIEW &&
        fromStatus !== REPORT_STATUSES.UNDER_REVIEW
      ) {
        throw new DomainError('يجب أن يكون التقرير في حالة بانتظار الاعتماد قبل اعتماده رسمياً', 400);
      }

      // Prevent duplicate version approval inside transaction
      const existingVersion = db
        .prepare('SELECT id FROM report_versions WHERE report_id = ? AND version_number = ?')
        .get(report.id, report.currentVersion) as { id: string } | undefined;
      if (existingVersion) {
        throw new DomainError('تم توثيق اعتماد هذا الإصدار مسبقاً في السجل الدائم', 409);
      }

      // STRICT SERVER-SIDE COMPLETENESS + DUAL SIGNATURE GATE
      const effectiveApproverNameForCheck = (params.approverName ?? report.approverName).trim() || user.fullName;
      const effectiveApproverTitleForCheck = (params.approverTitle ?? report.approverTitle).trim() || user.jobTitle;
      const reportForCheck: MonthlyReportFull = {
        ...report,
        approverName: effectiveApproverNameForCheck,
        approverTitle: effectiveApproverTitleForCheck,
      };

      const approveValidation = validateReportCompleteness(reportForCheck, {
        stage: 'approve',
        sites: getAllSites(),
        categories: getAllCategories(),
        user,
      });
      if (!approveValidation.dataIsComplete) {
        const firstMsg = approveValidation.issues[0]?.message || 'توجد بيانات إلزامية غير مكتملة';
        throw new DomainError(
          `تعذر استكمال إجراء الاعتماد لوجود بيانات إلزامية غير مكتملة (${approveValidation.missingRequiredFields} حقول): ${firstMsg}`,
          400,
          approveValidation
        );
      }

      const evalResult = evaluateDualSignatureApproval(reportForCheck, user);
      if (!evalResult.hasValidPreparerSignature || !evalResult.hasValidApproverSignature) {
        const missingParts: string[] = [];
        if (!evalResult.hasValidPreparerSignature) {
          missingParts.push(evalResult.preparer.reason || 'توقيع معد التقرير');
        }
        if (!evalResult.hasValidApproverSignature) {
          missingParts.push(evalResult.approver.reason || 'توقيع معتمد التقرير');
        }
        throw new DomainError(
          `لا يمكن اعتماد التقرير نهائياً قبل استكمال توقيع معد التقرير وتوقيع معتمد التقرير (${missingParts.join(' · ')})`,
          400,
          approveValidation
        );
      }

      if (!report.preparerName.trim()) {
        throw new DomainError('حقل معد التقرير إلزامي قبل الاعتماد', 400, approveValidation);
      }
      if (!evalResult.canApproveReport) {
        throw new DomainError(
          evalResult.blockingReasons[0] || 'لم تكتمل شروط الاعتماد الإلزامية بالتوقيع المزدوج',
          400,
          approveValidation
        );
      }

      toStatus = REPORT_STATUSES.APPROVED;
    } else if (action === 'archive') {
      if (!([USER_ROLES.ADMIN, USER_ROLES.APPROVER] as UserRole[]).includes(user.role)) {
        throw new DomainError('صلاحية الأرشفة مخصصة للمعتمد أو مدير النظام فقط', 403);
      }
      if (fromStatus !== REPORT_STATUSES.APPROVED) {
        throw new DomainError('لا يمكن أرشفة تقرير غير معتمد', 400);
      }
      toStatus = REPORT_STATUSES.ARCHIVED;
    } else if (action === 'create_revision') {
      // STRICT POST-APPROVAL RBAC: ONLY Admin OR original report Preparer (by authenticated UID)
      if (!isAuthorizedPostApprovalOwner(user, report)) {
        throw new DomainError('ليس لديك صلاحية تعديل هذا التقرير المعتمد', 403);
      }
      if (report.isPostApprovalRevision && fromStatus !== REPORT_STATUSES.APPROVED && fromStatus !== REPORT_STATUSES.ARCHIVED) {
        throw new DomainError(
          `تم فتح إصدار تعديل (v${report.currentVersion}) لهذا التقرير المعتمد مسبقاً؛ استكمل تحريره من مسودات التقارير أو ألغِه أولاً.`,
          409
        );
      }
      if (!canEditPostApprovalReport(user, report)) {
        throw new DomainError('يُفتح تعديل ما بعد الاعتماد للتقارير المعتمدة أو المؤرشفة فقط', 400);
      }
      if (
        params.expectedVersion !== undefined &&
        params.expectedVersion !== null &&
        Number(params.expectedVersion) !== report.currentVersion
      ) {
        throw new DomainError('تغير رقم الإصدار الحالي للتقرير قبل فتح التعديل؛ يرجى تحديث البيانات.', 409);
      }
      if (!comment.trim()) {
        throw new DomainError('يرجى إدخال سبب تعديل التقرير المعتمد', 400);
      }
      toStatus = REPORT_STATUSES.DRAFT;
      recordedVersion = report.currentVersion + 1;
    } else if (action === 'cancel_revision') {
      if (!isAuthorizedPostApprovalOwner(user, report)) {
        throw new DomainError('ليس لديك صلاحية إلغاء مسودة التعديل لهذا التقرير المعتمد', 403);
      }
      if (
        !report.isPostApprovalRevision ||
        !report.sourceApprovedVersion ||
        fromStatus === REPORT_STATUSES.APPROVED ||
        fromStatus === REPORT_STATUSES.ARCHIVED
      ) {
        throw new DomainError('لا توجد مسودة تعديل نشطة بعد الاعتماد لإلغائها', 400);
      }
      toStatus = REPORT_STATUSES.APPROVED;
      recordedVersion = report.sourceApprovedVersion;
    }

    const sigToken = createSignatureToken(user.id, report.id, recordedVersion, action);

    if (action === 'submit_review') {
      const effectivePreparedAt = report.preparedAt || now;
      db.prepare(
        `UPDATE monthly_reports
         SET status = ?,
             preparer_id = COALESCE(NULLIF(TRIM(preparer_id), ''), ?),
             prepared_at = ?,
             preparer_signature_hash = ?,
             lock_version = COALESCE(lock_version, 1) + 1,
             updated_at = ?
         WHERE id = ?`
      ).run(toStatus, user.id, effectivePreparedAt, sigToken, now, report.id);
    } else if (action === 'start_review' || action === 'forward_approval') {
      db.prepare(
        'UPDATE monthly_reports SET status = ?, reviewer_id = ?, reviewer_name = ?, reviewer_title = ?, reviewed_at = ?, lock_version = COALESCE(lock_version, 1) + 1, updated_at = ? WHERE id = ?'
      ).run(toStatus, user.id, user.fullName, user.jobTitle, now, now, report.id);
    } else if (action === 'return_revision') {
      db.prepare(
        'UPDATE monthly_reports SET status = ?, lock_version = COALESCE(lock_version, 1) + 1, updated_at = ? WHERE id = ?'
      ).run(toStatus, now, report.id);
    } else if (action === 'approve') {
      const effectiveApprovedAt = report.approvedAt || now;
      const effectiveApproverName = (params.approverName ?? report.approverName).trim() || user.fullName;
      const effectiveApproverTitle = (params.approverTitle ?? report.approverTitle).trim() || user.jobTitle;
      const updRes = db
        .prepare(
          `UPDATE monthly_reports
           SET status = ?,
               approver_id = ?,
               approver_name = ?,
               approver_title = ?,
               approved_at = ?,
               approver_signature_hash = ?,
               is_post_approval_revision = 0,
               lock_version = COALESCE(lock_version, 1) + 1,
               updated_at = ?
           WHERE id = ? AND status IN ('pending_approval', 'ready_for_review', 'under_review')`
        )
        .run(
          toStatus,
          user.id,
          effectiveApproverName,
          effectiveApproverTitle,
          effectiveApprovedAt,
          sigToken,
          now,
          report.id
        );
      if (Number(updRes.changes) === 0) {
        throw new DomainError('تغيرت حالة التقرير أثناء التنفيذ ولا يمكن إتمام الاعتماد المكرر', 409);
      }

      // Build immutable official snapshot preserving BOTH fresh electronic signatures & revision origin metadata
      const updatedForSnapshot = getReportById(report.id)!;
      const sites = getAllSites();
      const categories = getAllCategories();
      const thresholds = getThresholds();
      const snapshotPayload = {
        report: updatedForSnapshot,
        sites,
        categories,
        thresholds,
        approvedAt: effectiveApprovedAt,
        preparerSignedAt: updatedForSnapshot.preparerSignedAt ?? updatedForSnapshot.preparedAt,
        approverSignedAt: updatedForSnapshot.approverSignedAt ?? effectiveApprovedAt,
        approvedBy: { id: user.id, fullName: effectiveApproverName, jobTitle: effectiveApproverTitle },
        signatureToken: sigToken,
        revisionReason: report.revisionReason ?? null,
        sourceApprovedVersion: report.sourceApprovedVersion ?? null,
      };
      db.prepare(
        `INSERT INTO report_versions
          (id, report_id, version_number, snapshot_json, approved_by_id, approved_by_name, signature_token, created_at, revision_reason, source_approved_version, edited_by_name)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        crypto.randomUUID(),
        report.id,
        report.currentVersion,
        JSON.stringify(snapshotPayload),
        user.id,
        effectiveApproverName,
        sigToken,
        now,
        report.revisionReason ?? null,
        report.sourceApprovedVersion ?? null,
        report.revisionStartedByName ?? report.preparerName ?? null
      );
    } else if (action === 'archive') {
      db.prepare(
        'UPDATE monthly_reports SET status = ?, lock_version = COALESCE(lock_version, 1) + 1, updated_at = ? WHERE id = ?'
      ).run(toStatus, now, report.id);
    } else if (action === 'create_revision') {
      // Preserve immutable approved snapshot BEFORE opening new revision draft
      ensureImmutableApprovedSnapshot(report, user);

      // Reset BOTH preparer AND approver signatures & dates on the new active revision draft
      db.prepare(
        `UPDATE monthly_reports
         SET status = ?,
             current_version = current_version + 1,
             is_post_approval_revision = 1,
             revision_reason = ?,
             revision_started_by_id = ?,
             revision_started_by_name = ?,
             revision_started_by_role = ?,
             revision_started_at = ?,
             source_approved_version = ?,
             preparer_signature_hash = NULL,
             preparer_signature_image = NULL,
             preparer_signed_at = NULL,
             preparer_signed_by_id = NULL,
             preparer_signed_by_name = NULL,
             preparer_signature_status = 'valid',
             reviewer_id = NULL,
             reviewer_name = '',
             reviewer_title = '',
             reviewed_at = NULL,
             approved_at = NULL,
             approver_signature_hash = NULL,
             approver_signature_image = NULL,
             approver_signed_at = NULL,
             approver_signed_by_id = NULL,
             approver_signed_by_name = NULL,
             approver_signature_status = 'valid',
             lock_version = COALESCE(lock_version, 1) + 1,
             updated_at = ?
         WHERE id = ?`
      ).run(
        toStatus,
        comment.trim(),
        user.id,
        user.fullName,
        user.role,
        now,
        report.currentVersion,
        now,
        report.id
      );
    } else if (action === 'cancel_revision') {
      const snapRow = db
        .prepare('SELECT snapshot_json FROM report_versions WHERE report_id = ? AND version_number = ?')
        .get(report.id, report.sourceApprovedVersion!) as { snapshot_json: string } | undefined;
      if (!snapRow) {
        throw new DomainError('تعذر العثور على النسخة المعتمدة المرجعية لاستعادتها', 404);
      }
      const parsed = JSON.parse(snapRow.snapshot_json) as { report: MonthlyReportFull };
      const snapReport = parsed.report;
      toStatus = snapReport.status === REPORT_STATUSES.ARCHIVED ? REPORT_STATUSES.ARCHIVED : REPORT_STATUSES.APPROVED;
      recordedVersion = snapReport.currentVersion;

      db.prepare(
        `UPDATE monthly_reports
         SET status = ?,
             current_version = ?,
             classification = ?,
             preparer_id = ?,
             preparer_name = ?,
             preparer_title = ?,
             prepared_at = ?,
             preparer_signature_hash = ?,
             preparer_signature_image = ?,
             preparer_signed_at = ?,
             preparer_signed_by_id = ?,
             preparer_signed_by_name = ?,
             preparer_signature_status = ?,
             reviewer_id = ?,
             reviewer_name = ?,
             reviewer_title = ?,
             reviewed_at = ?,
             approver_id = ?,
             approver_name = ?,
             approver_title = ?,
             approved_at = ?,
             approver_signature_hash = ?,
             approver_signature_image = ?,
             approver_signed_at = ?,
             approver_signed_by_id = ?,
             approver_signed_by_name = ?,
             approver_signature_status = ?,
             maint_from_facilities = ?,
             maint_from_other = ?,
             is_post_approval_revision = 0,
             revision_reason = ?,
             revision_started_by_id = ?,
             revision_started_by_name = ?,
             revision_started_by_role = ?,
             revision_started_at = ?,
             source_approved_version = ?,
             lock_version = COALESCE(lock_version, 1) + 1,
             updated_at = ?
         WHERE id = ?`
      ).run(
        toStatus,
        snapReport.currentVersion,
        snapReport.classification || 'Public',
        snapReport.preparerId,
        snapReport.preparerName,
        snapReport.preparerTitle,
        snapReport.preparedAt,
        snapReport.preparerSignatureHash,
        snapReport.preparerSignatureImage,
        snapReport.preparerSignedAt ?? null,
        snapReport.preparerSignedById ?? null,
        snapReport.preparerSignedByName ?? null,
        snapReport.preparerSignatureStatus ?? 'valid',
        snapReport.reviewerId,
        snapReport.reviewerName,
        snapReport.reviewerTitle,
        snapReport.reviewedAt,
        snapReport.approverId,
        snapReport.approverName,
        snapReport.approverTitle,
        snapReport.approvedAt,
        snapReport.approverSignatureHash,
        snapReport.approverSignatureImage,
        snapReport.approverSignedAt ?? null,
        snapReport.approverSignedById ?? null,
        snapReport.approverSignedByName ?? null,
        snapReport.approverSignatureStatus ?? 'valid',
        Math.max(0, Math.round(Number(snapReport.maintenanceServices?.fromFacilitiesDept) || 0)),
        Math.max(0, Math.round(Number(snapReport.maintenanceServices?.fromOtherDepts) || 0)),
        snapReport.revisionReason ?? null,
        snapReport.revisionStartedById ?? null,
        snapReport.revisionStartedByName ?? null,
        snapReport.revisionStartedByRole ?? null,
        snapReport.revisionStartedAt ?? null,
        snapReport.sourceApprovedVersion ?? null,
        now,
        report.id
      );

      restoreReportChildrenFromSnapshot(report.id, snapReport);
    }

    db.prepare(
      'INSERT INTO approval_records (id, report_id, version_number, action, from_status, to_status, actor_id, actor_name, actor_role, comment, signature_token, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(
      crypto.randomUUID(),
      report.id,
      recordedVersion,
      action,
      fromStatus,
      toStatus,
      user.id,
      user.fullName,
      user.role,
      comment,
      sigToken,
      now
    );

    const actionLabels: Record<string, string> = {
      submit_review: 'إرسال التقرير للاعتماد',
      start_review: 'بدء المراجعة الرسمية',
      forward_approval: 'رفع التقرير للاعتماد',
      return_revision: 'إرجاع التقرير للتعديل',
      approve: 'اعتماد التقرير رسمياً',
      archive: 'أرشفة التقرير',
      create_revision: 'فتح تحرير التقرير بعد الاعتماد',
      cancel_revision: 'إلغاء مسودة التعديل بعد الاعتماد',
    };

    db.prepare(
      'INSERT INTO audit_logs (id, report_id, user_id, user_name, user_role, action, field_path, previous_value, new_value, reason, version_number, report_status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(
      crypto.randomUUID(),
      report.id,
      user.id,
      user.fullName,
      user.role,
      actionLabels[action] || `تغيير حالة التقرير (${action})`,
      action === 'create_revision' ? 'post_approval_edit' : 'status',
      action === 'create_revision' ? `v${report.currentVersion} (${fromStatus})` : fromStatus,
      action === 'create_revision'
        ? `v${recordedVersion} (قيد تعديل تقرير معتمد)`
        : action === 'cancel_revision'
          ? `v${recordedVersion} (${toStatus})`
          : toStatus,
      comment || `توقيع إلكتروني موثق: ${sigToken}`,
      recordedVersion,
      action === 'create_revision' ? 'post_approval_revision' : toStatus,
      now
    );

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  return getReportById(params.reportId)!;
}

export function linkReportPreparerOwnership(params: {
  reportId: string;
  preparerId: string;
  adminUser: AuthUser;
}): MonthlyReportFull {
  if (params.adminUser.role !== USER_ROLES.ADMIN) {
    throw new DomainError('صلاحية ربط ملكية معد التقرير مخصصة لمدير النظام فقط', 403);
  }
  const targetUser = db
    .prepare('SELECT id, full_name, job_title, role_key, is_active FROM users WHERE id = ?')
    .get(params.preparerId) as
    | { id: string; full_name: string; job_title: string; role_key: string; is_active: number }
    | undefined;
  if (!targetUser || targetUser.is_active !== 1) {
    throw new DomainError('حساب معد التقرير المحدد غير موجود أو موقوف', 404);
  }

  const now = new Date().toISOString();
  db.exec('BEGIN IMMEDIATE');
  try {
    const existing = getReportById(params.reportId);
    if (!existing) throw new DomainError('التقرير غير موجود', 404);

    db.prepare(
      `UPDATE monthly_reports
       SET preparer_id = ?,
           lock_version = COALESCE(lock_version, 1) + 1,
           updated_at = ?
       WHERE id = ?`
    ).run(targetUser.id, now, params.reportId);

    db.prepare(
      'INSERT INTO audit_logs (id, report_id, user_id, user_name, user_role, action, field_path, previous_value, new_value, reason, version_number, report_status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(
      crypto.randomUUID(),
      params.reportId,
      params.adminUser.id,
      params.adminUser.fullName,
      params.adminUser.role,
      'ربط ملكية معد التقرير (UID)',
      'preparerId',
      existing.preparerId || 'غير مرتبط',
      `${targetUser.id} (${targetUser.full_name})`,
      'توثيق معرف معد التقرير من قبل مدير النظام',
      existing.currentVersion,
      existing.status,
      now
    );

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  return getReportById(params.reportId)!;
}

export function getReportHistory(reportId: string): {
  approvals: ApprovalRecord[];
  auditLogs: AuditLogEntry[];
  versions: ReportVersionSummary[];
} {
  const approvals = (
    db.prepare('SELECT * FROM approval_records WHERE report_id = ? ORDER BY created_at DESC').all(reportId) as Array<
      Record<string, unknown>
    >
  ).map((a) => ({
    id: String(a.id),
    reportId: String(a.report_id),
    versionNumber: Number(a.version_number),
    action: String(a.action),
    fromStatus: String(a.from_status),
    toStatus: String(a.to_status),
    actorId: String(a.actor_id),
    actorName: String(a.actor_name),
    actorRole: String(a.actor_role),
    comment: String(a.comment || ''),
    signatureToken: String(a.signature_token),
    createdAt: String(a.created_at),
  }));

  const auditLogs = (
    db.prepare('SELECT * FROM audit_logs WHERE report_id = ? ORDER BY created_at DESC LIMIT 250').all(reportId) as Array<
      Record<string, unknown>
    >
  ).map((l) => ({
    id: String(l.id),
    reportId: String(l.report_id),
    userId: String(l.user_id),
    userName: String(l.user_name),
    userRole: String(l.user_role),
    action: String(l.action),
    fieldPath: String(l.field_path),
    previousValue: String(l.previous_value || ''),
    newValue: String(l.new_value || ''),
    reason: String(l.reason || ''),
    versionNumber: Number(l.version_number),
    reportStatus: String(l.report_status),
    createdAt: String(l.created_at),
  }));

  const versions = (
    db
      .prepare(
        'SELECT id, report_id, version_number, approved_by_id, approved_by_name, signature_token, created_at, revision_reason, source_approved_version, edited_by_name FROM report_versions WHERE report_id = ? ORDER BY version_number DESC'
      )
      .all(reportId) as Array<Record<string, unknown>>
  ).map((v) => ({
    id: String(v.id),
    reportId: String(v.report_id),
    versionNumber: Number(v.version_number),
    approvedById: String(v.approved_by_id),
    approvedByName: String(v.approved_by_name),
    signatureToken: String(v.signature_token),
    createdAt: String(v.created_at),
    revisionReason: v.revision_reason ? String(v.revision_reason) : null,
    sourceApprovedVersion:
      v.source_approved_version !== null && v.source_approved_version !== undefined
        ? Number(v.source_approved_version)
        : null,
    editedByName: v.edited_by_name ? String(v.edited_by_name) : null,
  }));

  return { approvals, auditLogs, versions };
}
