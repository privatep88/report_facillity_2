import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import crypto from 'node:crypto';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';
import {
  createBlankMonthlyReport,
  db,
  getAllCategories,
  getAllSites,
  getReportById,
  getReportHistory,
  getThresholds,
  hashPassword,
  initSchemaAndSeed,
  listReportsSummary,
  saveReportData,
  saveReportDate,
  saveReportSignature,
  signToken,
  transitionWorkflow,
  verifyPassword,
  verifyToken,
} from './server/db.ts';
import { generateMonthlyReportExcel } from './server/excelExport.ts';
import { generateExecutiveAnalyticsExcel } from './server/analyticsExcelExport.ts';
import { generateMonthlyReportPdf } from './server/pdfExport.ts';
import { generateExecutiveAnalyticsPdf } from './server/analyticsPdfExport.ts';
import { DEFAULT_ANALYTICS_FILTERS, type AnalyticsFilters } from './src/services/AnalyticsEngineService.ts';
import type { AuthUser, MonthlyReportFull, PerformanceThresholds, UserRole } from './src/types/report.ts';
import { USER_ROLES } from './src/types/report.ts';

initSchemaAndSeed();

interface AuthedRequest extends Request {
  authUser?: AuthUser | null;
}

function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!cookieHeader) return out;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = decodeURIComponent(part.slice(idx + 1).trim());
    out[k] = v;
  }
  return out;
}

function getUserFromRequest(req: Request): AuthUser | null {
  const cookies = parseCookies(req.headers.cookie);
  const authHeader = req.headers.authorization;
  const bearer = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  const token = bearer || cookies['saaed_session'];

  let userId: string | null = null;
  if (token) {
    const payload = verifyToken(token);
    if (payload && typeof payload.userId === 'string') {
      userId = payload.userId;
    }
  } else if (cookies['saaed_logged_out'] !== '1') {
    userId = 'usr_admin';
  }

  if (!userId) return null;

  const row = db
    .prepare('SELECT id, email, full_name, job_title, role_key, is_active FROM users WHERE id = ?')
    .get(userId) as
    | { id: string; email: string; full_name: string; job_title: string; role_key: string; is_active: number }
    | undefined;

  if (!row || row.is_active !== 1) return null;
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    jobTitle: row.job_title,
    role: row.role_key as UserRole,
    isActive: row.is_active === 1,
  };
}

function attachAuth(req: AuthedRequest, _res: Response, next: NextFunction) {
  req.authUser = getUserFromRequest(req);
  next();
}

function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  if (!req.authUser) {
    res.status(401).json({ error: 'يرجى تسجيل الدخول أولاً لتنفيذ هذا الإجراء' });
    return;
  }
  next();
}

function requireRole(allowed: UserRole[]) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.authUser) {
      res.status(401).json({ error: 'يرجى تسجيل الدخول أولاً' });
      return;
    }
    if (!allowed.includes(req.authUser.role)) {
      res.status(403).json({ error: 'ليس لديك الصلاحية المطلوبة لتنفيذ هذه العملية' });
      return;
    }
    next();
  };
}

async function startServer() {
  const app = express();

  // Safe CORS support for separate frontend deployments (e.g. GitHub Pages -> Express API)
  app.use('/api', (req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin;
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
    }
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  app.get(['/favicon.ico', '/report_facillity_2/favicon.ico'], (_req: Request, res: Response) => {
    res.redirect(302, '/favicon.svg');
  });

  app.get(['/favicon.svg', '/report_facillity_2/favicon.svg'], (_req: Request, res: Response) => {
    res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.sendFile(path.resolve(process.cwd(), 'public', 'favicon.svg'));
  });

  app.use(express.json({ limit: '5mb' }));
  app.use(attachAuth);

  // === Auth Endpoints ===
  app.get('/api/auth/me', (req: AuthedRequest, res: Response) => {
    res.json({ user: req.authUser ?? null });
  });

  app.get('/api/auth/demo-accounts', (_req: Request, res: Response) => {
    const rows = db
      .prepare('SELECT id, email, full_name, job_title, role_key FROM users WHERE is_active = 1 ORDER BY created_at ASC')
      .all() as Array<{ id: string; email: string; full_name: string; job_title: string; role_key: string }>;
    res.json({
      accounts: rows.map((r) => ({
        id: r.id,
        email: r.email,
        fullName: r.full_name,
        jobTitle: r.job_title,
        role: r.role_key as UserRole,
      })),
    });
  });

  app.post('/api/auth/login', (req: Request, res: Response) => {
    const { email, password } = req.body as { email?: string; password?: string };
    if (!email || !password) {
      res.status(400).json({ error: 'يرجى إدخال البريد الإلكتروني وكلمة المرور' });
      return;
    }

    const row = db
      .prepare('SELECT * FROM users WHERE LOWER(email) = LOWER(?)')
      .get(email.trim()) as
      | {
          id: string;
          email: string;
          full_name: string;
          job_title: string;
          role_key: string;
          password_hash: string;
          is_active: number;
        }
      | undefined;

    if (!row || !verifyPassword(password, row.password_hash)) {
      res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
      return;
    }

    if (row.is_active !== 1) {
      res.status(403).json({ error: 'هذا الحساب موقوف حالياً' });
      return;
    }

    const token = signToken({
      userId: row.id,
      role: row.role_key,
      exp: Date.now() + 7 * 24 * 60 * 60 * 1000,
    });

    const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https' || req.protocol === 'https';
    const cookieFlags = isHttps
      ? `HttpOnly; Path=/; SameSite=None; Secure; Max-Age=${7 * 24 * 60 * 60}`
      : `HttpOnly; Path=/; SameSite=Lax; Max-Age=${7 * 24 * 60 * 60}`;

    res.setHeader(
      'Set-Cookie',
      `saaed_session=${encodeURIComponent(token)}; ${cookieFlags}`
    );

    res.json({
      token,
      user: {
        id: row.id,
        email: row.email,
        fullName: row.full_name,
        jobTitle: row.job_title,
        role: row.role_key as UserRole,
        isActive: true,
      },
    });
  });

  app.post('/api/auth/logout', (req: Request, res: Response) => {
    const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https' || req.protocol === 'https';
    const clearFlags = isHttps
      ? 'HttpOnly; Path=/; SameSite=None; Secure; Max-Age=0'
      : 'HttpOnly; Path=/; SameSite=Lax; Max-Age=0';
    res.setHeader('Set-Cookie', `saaed_session=; ${clearFlags}`);
    res.json({ ok: true });
  });

  // === Bootstrap & Read Endpoints ===
  app.get('/api/bootstrap', (req: AuthedRequest, res: Response) => {
    const sites = getAllSites();
    const categories = getAllCategories();
    const thresholds = getThresholds();
    const reports = listReportsSummary();
    res.json({
      user: req.authUser ?? null,
      sites,
      categories,
      thresholds,
      reports,
    });
  });

  app.get('/api/reports', (_req: Request, res: Response) => {
    res.json({ reports: listReportsSummary() });
  });

  app.get('/api/analytics/all', (_req: Request, res: Response) => {
    const summaries = listReportsSummary();
    const fullReports: MonthlyReportFull[] = [];
    for (const s of summaries) {
      const full = getReportById(s.id);
      if (full) fullReports.push(full);
    }
    res.json({
      reports: fullReports,
      sites: getAllSites(),
      categories: getAllCategories(),
      thresholds: getThresholds(),
    });
  });

  app.post('/api/analytics/export/excel', async (req: Request, res: Response) => {
    try {
      const body = (req.body || {}) as { filters?: Partial<AnalyticsFilters> };
      const filters: AnalyticsFilters = {
        ...DEFAULT_ANALYTICS_FILTERS,
        ...(body.filters || {}),
      };
      const summaries = listReportsSummary();
      const fullReports: MonthlyReportFull[] = [];
      for (const s of summaries) {
        const full = getReportById(s.id);
        if (full) fullReports.push(full);
      }

      const xlsxBuffer = await generateExecutiveAnalyticsExcel({
        reports: fullReports,
        sites: getAllSites(),
        categories: getAllCategories(),
        thresholds: getThresholds(),
        filters,
      });

      const stamp = new Date().toISOString().slice(0, 10);
      const fileName = `SAAED_FM_Executive_Analytics_${stamp}.xlsx`;
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      res.send(xlsxBuffer);
    } catch (err) {
      console.error('Analytics Excel export failed:', err);
      res.status(500).json({ error: 'تعذر إنشاء ملف التحليلات التنفيذية بصيغة Excel' });
    }
  });

  app.post('/api/analytics/export/pdf', async (req: Request, res: Response) => {
    try {
      const body = (req.body || {}) as {
        filters?: Partial<AnalyticsFilters>;
        orientation?: 'landscape' | 'portrait';
      };
      const filters: AnalyticsFilters = {
        ...DEFAULT_ANALYTICS_FILTERS,
        ...(body.filters || {}),
      };
      const orientation = body.orientation === 'portrait' ? 'portrait' : 'landscape';

      const summaries = listReportsSummary();
      const fullReports: MonthlyReportFull[] = [];
      for (const s of summaries) {
        const full = getReportById(s.id);
        if (full) fullReports.push(full);
      }

      const pdfBuffer = await generateExecutiveAnalyticsPdf({
        reports: fullReports,
        sites: getAllSites(),
        categories: getAllCategories(),
        thresholds: getThresholds(),
        filters,
        orientation,
      });

      const stamp = new Date().toISOString().slice(0, 10);
      const fileName = `SAAED_FM_Executive_Analytics_${stamp}.pdf`;
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      res.send(pdfBuffer);
    } catch (err) {
      console.error('Analytics PDF export failed:', err);
      res.status(500).json({ error: 'تعذر إنشاء ملف التحليلات التنفيذية بصيغة PDF' });
    }
  });

  app.get('/api/reports/:id', (req: Request, res: Response) => {
    const report = getReportById(req.params.id);
    if (!report) {
      res.status(404).json({ error: 'التقرير غير موجود' });
      return;
    }
    const history = getReportHistory(report.id);
    res.json({ report, history });
  });

  app.get('/api/reports/:id/versions/:versionNumber', (req: Request, res: Response) => {
    const ver = Number(req.params.versionNumber);
    const row = db
      .prepare('SELECT snapshot_json, created_at, signature_token, approved_by_name FROM report_versions WHERE report_id = ? AND version_number = ?')
      .get(req.params.id, ver) as
      | { snapshot_json: string; created_at: string; signature_token: string; approved_by_name: string }
      | undefined;

    if (!row) {
      res.status(404).json({ error: 'الإصدار المعتمد غير موجود' });
      return;
    }

    res.json({
      snapshot: JSON.parse(row.snapshot_json),
      createdAt: row.created_at,
      signatureToken: row.signature_token,
      approvedByName: row.approved_by_name,
    });
  });

  // === Report Mutations (Auth & RBAC Protected) ===
  app.post('/api/reports', requireRole([USER_ROLES.ADMIN, USER_ROLES.PREPARER]), (req: AuthedRequest, res: Response) => {
    try {
      const { year, month, department } = req.body as { year?: number; month?: number; department?: string };
      if (!year || !month || month < 1 || month > 12 || year < 2020 || year > 2100) {
        res.status(400).json({ error: 'يرجى تحديد سنة وشهر صحيحين' });
        return;
      }
      const created = createBlankMonthlyReport({
        year: Number(year),
        month: Number(month),
        department: (department || 'إدارة الخدمات العامة').trim(),
        user: req.authUser!,
      });
      res.status(201).json({ report: created });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'تعذر إنشاء التقرير' });
    }
  });

  app.put('/api/reports/:id', requireRole([USER_ROLES.ADMIN, USER_ROLES.PREPARER]), (req: AuthedRequest, res: Response) => {
    try {
      const updated = saveReportData(req.params.id, req.body as MonthlyReportFull, req.authUser!);
      const history = getReportHistory(updated.id);
      res.json({ report: updated, history });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'فشل حفظ التقرير' });
    }
  });

  app.put('/api/reports/:id/signature', requireAuth, (req: AuthedRequest, res: Response) => {
    try {
      const { target, signatureImage } = req.body as {
        target?: 'preparer' | 'approver';
        signatureImage?: string | null;
      };
      if (target !== 'preparer' && target !== 'approver') {
        res.status(400).json({ error: 'يرجى تحديد نوع التوقيع (معد التقرير أو المعتمد)' });
        return;
      }
      const updated = saveReportSignature({
        reportId: req.params.id,
        target,
        signatureImage: signatureImage ?? null,
        user: req.authUser!,
      });
      const history = getReportHistory(updated.id);
      res.json({ report: updated, history });
    } catch (err) {
      const domainErr = err as { statusCode?: number; validation?: unknown };
      const status = domainErr.statusCode || 400;
      res.status(status).json({
        error: err instanceof Error ? err.message : 'تعذر حفظ التوقيع',
        validation: domainErr.validation,
      });
    }
  });

  app.put('/api/reports/:id/date', requireAuth, (req: AuthedRequest, res: Response) => {
    try {
      const { target, dateValue } = req.body as {
        target?: 'preparedAt' | 'approvedAt';
        dateValue?: string | null;
      };
      if (target !== 'preparedAt' && target !== 'approvedAt') {
        res.status(400).json({ error: 'يرجى تحديد حقل التاريخ المطلوب' });
        return;
      }
      const updated = saveReportDate({
        reportId: req.params.id,
        target,
        dateValue: dateValue ?? null,
        user: req.authUser!,
      });
      const history = getReportHistory(updated.id);
      res.json({ report: updated, history });
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode || 400;
      res.status(status).json({ error: err instanceof Error ? err.message : 'تعذر حفظ التاريخ' });
    }
  });

  app.post('/api/reports/:id/workflow', requireAuth, (req: AuthedRequest, res: Response) => {
    try {
      const { action, comment, approverName, approverTitle } = req.body as {
        action:
          | 'submit_review'
          | 'start_review'
          | 'return_revision'
          | 'forward_approval'
          | 'approve'
          | 'archive'
          | 'create_revision';
        comment?: string;
        approverName?: string;
        approverTitle?: string;
      };
      const updated = transitionWorkflow({
        reportId: req.params.id,
        action,
        user: req.authUser!,
        comment,
        approverName,
        approverTitle,
      });
      const history = getReportHistory(updated.id);
      res.json({ report: updated, history });
    } catch (err) {
      const domainErr = err as { statusCode?: number; validation?: unknown };
      const status = domainErr.statusCode || 400;
      res.status(status).json({
        error: err instanceof Error ? err.message : 'تعذر تنفيذ إجراء الاعتماد',
        validation: domainErr.validation,
      });
    }
  });

  // === Excel Export Engine ===
  app.get('/api/reports/:id/export/excel', async (req: Request, res: Response) => {
    try {
      const versionParam = req.query.version ? Number(req.query.version) : null;
      let reportData: MonthlyReportFull | null = null;
      let sites = getAllSites();
      let categories = getAllCategories();
      let thresholds = getThresholds();

      if (versionParam && Number.isFinite(versionParam)) {
        const verRow = db
          .prepare('SELECT snapshot_json FROM report_versions WHERE report_id = ? AND version_number = ?')
          .get(req.params.id, versionParam) as { snapshot_json: string } | undefined;
        if (verRow) {
          const snap = JSON.parse(verRow.snapshot_json) as {
            report: MonthlyReportFull;
            sites?: typeof sites;
            categories?: typeof categories;
            thresholds?: typeof thresholds;
          };
          reportData = snap.report;
          if (snap.sites) sites = snap.sites;
          if (snap.categories) categories = snap.categories;
          if (snap.thresholds) thresholds = snap.thresholds;
        }
      }

      if (!reportData) {
        reportData = getReportById(req.params.id);
      }
      if (!reportData) {
        res.status(404).json({ error: 'التقرير غير موجود' });
        return;
      }

      const xlsxBuffer = await generateMonthlyReportExcel({
        report: reportData,
        sites,
        categories,
        thresholds,
      });

      const fileName = `${reportData.reportNumber}_v${reportData.currentVersion}.xlsx`;
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      res.send(xlsxBuffer);
    } catch (err) {
      console.error('Excel export failed:', err);
      res.status(500).json({ error: 'حدث خطأ أثناء إنشاء ملف Excel' });
    }
  });

  // === Official Searchable PDF Export Engine ===
  app.get('/api/reports/:id/export/pdf', async (req: Request, res: Response) => {
    try {
      const versionParam = req.query.version ? Number(req.query.version) : null;
      const orientation = req.query.orientation === 'portrait' ? 'portrait' : 'landscape';
      let reportData: MonthlyReportFull | null = null;
      let sites = getAllSites();
      let categories = getAllCategories();
      let thresholds = getThresholds();
      let resolvedVersion: number | null = null;

      if (versionParam && Number.isFinite(versionParam)) {
        const verRow = db
          .prepare('SELECT snapshot_json FROM report_versions WHERE report_id = ? AND version_number = ?')
          .get(req.params.id, versionParam) as { snapshot_json: string } | undefined;
        if (verRow) {
          const snap = JSON.parse(verRow.snapshot_json) as {
            report: MonthlyReportFull;
            sites?: typeof sites;
            categories?: typeof categories;
            thresholds?: typeof thresholds;
          };
          reportData = snap.report;
          if (snap.sites) sites = snap.sites;
          if (snap.categories) categories = snap.categories;
          if (snap.thresholds) thresholds = snap.thresholds;
          resolvedVersion = versionParam;
        }
      }

      if (!reportData) {
        reportData = getReportById(req.params.id);
      }
      if (!reportData) {
        res.status(404).json({ error: 'التقرير غير موجود' });
        return;
      }

      const pdfBuffer = await generateMonthlyReportPdf({
        report: reportData,
        sites,
        categories,
        thresholds,
        orientation,
        snapshotVersion: resolvedVersion,
      });

      const fileName = `${reportData.reportNumber}_v${resolvedVersion || reportData.currentVersion}.pdf`;
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      res.send(pdfBuffer);
    } catch (err) {
      console.error('PDF export failed:', err);
      res.status(500).json({ error: 'حدث خطأ أثناء إنشاء ملف PDF الرسمي' });
    }
  });

  // === Maintenance Sites & Categories Management (Admin/Preparer) ===
  app.post('/api/sites', requireRole([USER_ROLES.ADMIN, USER_ROLES.PREPARER]), (req: AuthedRequest, res: Response) => {
    const { nameAr, nameEn } = req.body as { nameAr?: string; nameEn?: string };
    if (!nameAr || !nameAr.trim()) {
      res.status(400).json({ error: 'يرجى إدخال اسم المقر' });
      return;
    }
    const id = `site_${crypto.randomUUID().slice(0, 8)}`;
    const code = `SITE_${Date.now().toString(36).toUpperCase()}`;
    const maxOrder = (db.prepare('SELECT COALESCE(MAX(sort_order), 0) as m FROM maintenance_sites').get() as { m: number }).m;
    const now = new Date().toISOString();

    db.prepare(
      'INSERT INTO maintenance_sites (id, code, name_ar, name_en, is_active, sort_order, created_at) VALUES (?, ?, ?, ?, 1, ?, ?)'
    ).run(id, code, nameAr.trim(), (nameEn || nameAr).trim(), maxOrder + 1, now);

    res.status(201).json({ sites: getAllSites() });
  });

  app.patch('/api/sites/:id', requireRole([USER_ROLES.ADMIN, USER_ROLES.PREPARER]), (req: Request, res: Response) => {
    const { nameAr, nameEn, isActive } = req.body as { nameAr?: string; nameEn?: string; isActive?: boolean };
    const existing = db.prepare('SELECT * FROM maintenance_sites WHERE id = ?').get(req.params.id) as
      | { id: string; name_ar: string; name_en: string; is_active: number }
      | undefined;
    if (!existing) {
      res.status(404).json({ error: 'المقر غير موجود' });
      return;
    }
    db.prepare('UPDATE maintenance_sites SET name_ar = ?, name_en = ?, is_active = ? WHERE id = ?').run(
      nameAr ? nameAr.trim() : existing.name_ar,
      nameEn ? nameEn.trim() : existing.name_en,
      typeof isActive === 'boolean' ? (isActive ? 1 : 0) : existing.is_active,
      req.params.id
    );
    res.json({ sites: getAllSites() });
  });

  app.post('/api/categories', requireRole([USER_ROLES.ADMIN, USER_ROLES.PREPARER]), (req: Request, res: Response) => {
    const { nameAr, nameEn } = req.body as { nameAr?: string; nameEn?: string };
    if (!nameAr || !nameAr.trim()) {
      res.status(400).json({ error: 'يرجى إدخال اسم فئة الصيانة' });
      return;
    }
    const id = `cat_${crypto.randomUUID().slice(0, 8)}`;
    const code = `CAT_${Date.now().toString(36).toUpperCase()}`;
    const maxOrder = (db.prepare('SELECT COALESCE(MAX(sort_order), 0) as m FROM maintenance_categories').get() as { m: number }).m;
    const now = new Date().toISOString();

    db.prepare(
      'INSERT INTO maintenance_categories (id, code, name_ar, name_en, is_active, sort_order, created_at) VALUES (?, ?, ?, ?, 1, ?, ?)'
    ).run(id, code, nameAr.trim(), (nameEn || nameAr).trim(), maxOrder + 1, now);

    res.status(201).json({ categories: getAllCategories() });
  });

  // === Admin Settings & Users Management ===
  app.put('/api/settings/thresholds', requireRole([USER_ROLES.ADMIN]), (req: Request, res: Response) => {
    const t = req.body as PerformanceThresholds;
    if (
      t.excellentMin <= t.veryGoodMin ||
      t.veryGoodMin <= t.goodMin ||
      t.goodMin <= t.needsImprovementMin ||
      t.needsImprovementMin < 0 ||
      t.excellentMin > 100
    ) {
      res.status(400).json({ error: 'يجب أن تكون حدود مستويات الأداء مرتبة تصاعدياً بين 0 و 100' });
      return;
    }
    const now = new Date().toISOString();
    db.prepare('UPDATE system_settings SET value_json = ?, updated_at = ? WHERE key = ?').run(
      JSON.stringify(t),
      now,
      'kpi_thresholds'
    );
    res.json({ thresholds: t });
  });

  app.get('/api/admin/users', requireRole([USER_ROLES.ADMIN]), (_req: Request, res: Response) => {
    const rows = db
      .prepare('SELECT id, email, full_name, job_title, role_key, is_active, created_at FROM users ORDER BY created_at ASC')
      .all() as Array<Record<string, unknown>>;
    res.json({
      users: rows.map((r) => ({
        id: String(r.id),
        email: String(r.email),
        fullName: String(r.full_name),
        jobTitle: String(r.job_title),
        role: String(r.role_key) as UserRole,
        isActive: Number(r.is_active) === 1,
      })),
    });
  });

  app.post('/api/admin/users', requireRole([USER_ROLES.ADMIN]), (req: Request, res: Response) => {
    const { email, fullName, jobTitle, role, password } = req.body as {
      email?: string;
      fullName?: string;
      jobTitle?: string;
      role?: UserRole;
      password?: string;
    };
    if (!email || !fullName || !role || !password) {
      res.status(400).json({ error: 'يرجى استكمال كافة بيانات المستخدم' });
      return;
    }
    const id = `usr_${crypto.randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();
    try {
      db.prepare(
        'INSERT INTO users (id, email, full_name, job_title, role_key, password_hash, is_active, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?)'
      ).run(id, email.trim(), fullName.trim(), (jobTitle || '').trim(), role, hashPassword(password), now);
      res.status(201).json({ ok: true });
    } catch {
      res.status(400).json({ error: 'البريد الإلكتروني مسجل مسبقاً' });
    }
  });

  app.patch('/api/admin/users/:id', requireRole([USER_ROLES.ADMIN]), (req: Request, res: Response) => {
    const { role, isActive, jobTitle, fullName } = req.body as {
      role?: UserRole;
      isActive?: boolean;
      jobTitle?: string;
      fullName?: string;
    };
    const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id) as Record<string, unknown> | undefined;
    if (!existing) {
      res.status(404).json({ error: 'المستخدم غير موجود' });
      return;
    }
    db.prepare('UPDATE users SET role_key = ?, is_active = ?, job_title = ?, full_name = ? WHERE id = ?').run(
      role ?? String(existing.role_key),
      typeof isActive === 'boolean' ? (isActive ? 1 : 0) : Number(existing.is_active),
      jobTitle !== undefined ? jobTitle : String(existing.job_title),
      fullName !== undefined ? fullName : String(existing.full_name),
      req.params.id
    );
    res.json({ ok: true });
  });

  // Explicit JSON 404 for any unmatched /api/* route so it never falls through to SPA index.html
  app.all('/api/*', (req: Request, res: Response) => {
    res.status(404).json({
      error: `مسار واجهة البرمجة غير موجود (${req.method} ${req.originalUrl})`,
      status: 404,
    });
  });

  // === Vite Middleware / Static Serving ===
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
        watch: null,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use('/report_facillity_2', express.static(distPath));
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const PORT = Number(process.env.PORT || 3000);
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`SAAED Facilities Management Executive System running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
