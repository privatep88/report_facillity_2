import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api, getStoredToken, onApiUnauthorized } from './api/client.ts';
import { AnalyticsTab } from './components/AnalyticsTab.tsx';
import { ApprovedArchiveTab } from './components/ApprovedArchiveTab.tsx';
import { CorporateFooter } from './components/CorporateFooter.tsx';
import { ExecutiveHeroHeader, ReportSilverInfoStrip } from './components/ExecutiveHeroHeader.tsx';
import type { AppTab } from './components/ExecutiveHeroHeader.tsx';
import { ExecutivePreviewModal } from './components/ExecutivePreviewModal.tsx';
import { ExecutiveSidebar } from './components/ExecutiveSidebar.tsx';
import { MonthlyReportTab } from './components/MonthlyReportTab.tsx';
import {
  AdminSettingsModal,
  AuditHistoryModal,
  AuthModal,
  ConfirmModal,
  NewReportModal,
  SitesCategoriesModal,
  ToastContainer,
  WorkflowActionModal,
} from './components/ToastAndModals.tsx';
import type { ToastMessage } from './components/ToastAndModals.tsx';
import type {
  ApprovalRecord,
  AuditLogEntry,
  AuthUser,
  MaintenanceCategory,
  MaintenanceSite,
  MonthlyReportFull,
  PerformanceThresholds,
  ReportListSummary,
  ReportVersionSummary,
} from './types/report.ts';
import { DEFAULT_THRESHOLDS, REPORT_STATUSES } from './types/report.ts';
import { syncReceptionServiceWithSecurity } from './utils/calculations.ts';

export default function App() {
  const [activeTab, setActiveTab] = useState<AppTab>('report');
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [sites, setSites] = useState<MaintenanceSite[]>([]);
  const [categories, setCategories] = useState<MaintenanceCategory[]>([]);
  const [thresholds, setThresholds] = useState<PerformanceThresholds>(DEFAULT_THRESHOLDS);
  const [reportsList, setReportsList] = useState<ReportListSummary[]>([]);

  const [activeReport, setActiveReport] = useState<MonthlyReportFull | null>(null);
  const [history, setHistory] = useState<{
    approvals: ApprovalRecord[];
    auditLogs: AuditLogEntry[];
    versions: ReportVersionSummary[];
  }>({ approvals: [], auditLogs: [], versions: [] });

  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // Modals
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [newReportModalOpen, setNewReportModalOpen] = useState(false);
  const [sitesModalOpen, setSitesModalOpen] = useState(false);
  const [adminModalOpen, setAdminModalOpen] = useState(false);
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [snapshotPreview, setSnapshotPreview] = useState<{
    report: MonthlyReportFull;
    sites: MaintenanceSite[];
    categories: MaintenanceCategory[];
    thresholds: PerformanceThresholds;
    versionNumber: number;
  } | null>(null);

  const [workflowAction, setWorkflowAction] = useState<
    | 'submit_review'
    | 'start_review'
    | 'return_revision'
    | 'forward_approval'
    | 'approve'
    | 'archive'
    | 'create_revision'
    | null
  >(null);

  const [pendingReportSwitch, setPendingReportSwitch] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const notify = useCallback((toast: Omit<ToastMessage, 'id'>) => {
    const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    setToasts((prev) => [...prev, { ...toast, id }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
  }, []);

  const loadReportDetails = useCallback(
    async (id: string) => {
      try {
        const res = await api.getReport(id);
        const normalizedReport =
          res.report.status === REPORT_STATUSES.DRAFT
            ? syncReceptionServiceWithSecurity(res.report)
            : res.report;
        setActiveReport(normalizedReport);
        setHistory(res.history);
        setDirty(false);
      } catch (err) {
        notify({
          type: 'error',
          title: 'تعذر تحميل التقرير',
          message: err instanceof Error ? err.message : '',
        });
      }
    },
    [notify]
  );

  const refreshBootstrap = useCallback(
    async (selectId?: string) => {
      try {
        const boot = await api.bootstrap();
        setUser(boot.user);
        setSites(boot.sites);
        setCategories(boot.categories);
        setThresholds(boot.thresholds);
        setReportsList(boot.reports);

        const targetId = selectId || activeReport?.id || boot.reports[0]?.id;
        if (targetId) {
          await loadReportDetails(targetId);
        }
      } catch (err) {
        notify({
          type: 'error',
          title: 'خطأ في الاتصال بالخادم',
          message: err instanceof Error ? err.message : '',
        });
      } finally {
        setLoading(false);
      }
    },
    [activeReport?.id, loadReportDetails, notify]
  );

  useEffect(() => {
    refreshBootstrap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return onApiUnauthorized(() => {
      setUser(null);
      setWorkflowAction(null);
      setAuthModalOpen(true);
    });
  }, []);

  const approvedCount = useMemo(
    () =>
      reportsList.filter(
        (r) => r.status === REPORT_STATUSES.APPROVED || r.status === REPORT_STATUSES.ARCHIVED
      ).length,
    [reportsList]
  );

  const handleSelectReport = (id: string) => {
    if (id === activeReport?.id) return;
    if (dirty) {
      setPendingReportSwitch(id);
      return;
    }
    loadReportDetails(id);
  };

  const handleSaveReport = async () => {
    if (!activeReport) return;
    setSaving(true);
    try {
      const res = await api.saveReport(activeReport.id, activeReport);
      setActiveReport(res.report);
      setHistory(res.history);
      setDirty(false);
      const listRes = await api.listReports();
      setReportsList(listRes.reports);
      notify({
        type: 'success',
        title: 'تم حفظ التقرير بنجاح',
        message: `تم تحديث بيانات التقرير ${res.report.reportNumber} وتوثيق التعديل في سجل التدقيق.`,
      });
    } catch (err) {
      notify({
        type: 'error',
        title: 'فشل حفظ البيانات',
        message: err instanceof Error ? err.message : 'تحقق من صحة المدخلات وصلاحياتك.',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveSignature = async (target: 'preparer' | 'approver', signatureImage: string | null) => {
    if (!activeReport) return;
    try {
      const res = await api.saveSignature(activeReport.id, target, signatureImage);
      setActiveReport((prev) => {
        if (!prev || prev.id !== res.report.id) return res.report;
        return {
          ...prev,
          preparerSignatureImage: res.report.preparerSignatureImage,
          approverSignatureImage: res.report.approverSignatureImage,
          updatedAt: res.report.updatedAt,
        };
      });
      setHistory(res.history);
      notify({
        type: 'success',
        title: signatureImage ? 'تم حفظ التوقيع الرسمي' : 'تم حذف التوقيع',
        message:
          target === 'preparer'
            ? 'تم تحديث التوقيع المرئي لمعد التقرير وتوثيقه في سجل التدقيق.'
            : 'تم تحديث التوقيع المرئي للاعتماد الرسمي وتوثيقه في سجل التدقيق.',
      });
    } catch (err) {
      notify({
        type: 'error',
        title: 'تعذر حفظ التوقيع',
        message: err instanceof Error ? err.message : 'تحقق من صلاحياتك وحالة التقرير.',
      });
      throw err;
    }
  };

  const handleSaveDate = async (target: 'preparedAt' | 'approvedAt', dateValue: string | null) => {
    if (!activeReport) return;
    try {
      const res = await api.saveDate(activeReport.id, target, dateValue);
      setActiveReport((prev) => {
        if (!prev || prev.id !== res.report.id) return res.report;
        return {
          ...prev,
          preparedAt: res.report.preparedAt,
          approvedAt: res.report.approvedAt,
          updatedAt: res.report.updatedAt,
        };
      });
      setHistory(res.history);
      notify({
        type: 'success',
        title: target === 'preparedAt' ? 'تم حفظ تاريخ التقديم' : 'تم حفظ تاريخ الاعتماد',
        message: 'تم تحديث التاريخ وتوثيقه في سجل التدقيق.',
      });
    } catch (err) {
      notify({
        type: 'error',
        title: 'تعذر حفظ التاريخ',
        message: err instanceof Error ? err.message : 'تحقق من صلاحياتك وحالة التقرير.',
      });
    }
  };

  const handleCreateReport = async (year: number, month: number, department: string) => {
    try {
      const res = await api.createReport({ year, month, department });
      const listRes = await api.listReports();
      setReportsList(listRes.reports);
      await loadReportDetails(res.report.id);
      setActiveTab('report');
      notify({
        type: 'success',
        title: 'تم إنشاء التقرير الشهري الجديد',
        message: `تم فتح مسودة مستقلة برقم ${res.report.reportNumber}.`,
      });
    } catch (err) {
      notify({
        type: 'error',
        title: 'تعذر إنشاء التقرير',
        message: err instanceof Error ? err.message : '',
      });
      throw err;
    }
  };

  const handleWorkflowConfirm = async (comment: string) => {
    if (!activeReport || !workflowAction) return;
    try {
      // Save unsaved edits first if submitting draft
      if (dirty && workflowAction === 'submit_review') {
        await api.saveReport(activeReport.id, activeReport);
      }
      const res = await api.workflowAction(activeReport.id, workflowAction, comment);
      setActiveReport(res.report);
      setHistory(res.history);
      setDirty(false);
      const listRes = await api.listReports();
      setReportsList(listRes.reports);

      const successTitles: Record<string, string> = {
        submit_review: 'تم إرسال التقرير للمراجعة',
        start_review: 'تم بدء مرحلة المراجعة',
        forward_approval: 'اكتملت المراجعة ورُفع للاعتماد',
        return_revision: 'تم إرجاع التقرير للتعديل',
        approve: 'تم اعتماد التقرير رسمياً وتوليد النسخة الثابتة',
        archive: 'تمت أرشفة التقرير بنجاح',
        create_revision: 'تم فتح إصدار جديد للتصحيح',
      };
      notify({
        type: 'success',
        title: successTitles[workflowAction] || 'تم تنفيذ الإجراء',
        message: `رقم التقرير: ${res.report.reportNumber} · الإصدار v${res.report.currentVersion}`,
      });
    } catch (err) {
      notify({
        type: 'error',
        title: 'تعذر تنفيذ إجراء الاعتماد',
        message: err instanceof Error ? err.message : '',
      });
      throw err;
    }
  };

  const handleExportExcel = async (reportId: string, versionNumber?: number) => {
    try {
      const url = versionNumber
        ? `/api/reports/${encodeURIComponent(reportId)}/export/excel?version=${versionNumber}`
        : `/api/reports/${encodeURIComponent(reportId)}/export/excel`;
      const token = getStoredToken();
      const res = await fetch(url, {
        credentials: 'include',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (!res.ok) throw new Error('فشل توليد ملف Excel');
      const blob = await res.blob();
      const disposition = res.headers.get('Content-Disposition') || '';
      const match = disposition.match(/filename="([^"]+)"/);
      const filename = match ? match[1] : `SAAED_FM_Report_${reportId}.xlsx`;

      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);

      notify({
        type: 'success',
        title: 'نجاح تصدير ملف Excel',
        message: `تم تنزيل المصنف الاحترافي ${filename} بصيغة .xlsx شاملة المعادلات والصور.`,
      });
    } catch (err) {
      notify({
        type: 'error',
        title: 'فشل تصدير Excel',
        message: err instanceof Error ? err.message : '',
      });
    }
  };

  const handleOpenSnapshotPreview = async (reportId: string, versionNumber: number) => {
    try {
      const res = await api.getReportVersionSnapshot(reportId, versionNumber);
      setSnapshotPreview({
        report: res.snapshot.report,
        sites: res.snapshot.sites,
        categories: res.snapshot.categories,
        thresholds: res.snapshot.thresholds,
        versionNumber,
      });
      setPreviewOpen(true);
    } catch (err) {
      // Fallback to live report if snapshot not found
      const rep = await api.getReport(reportId);
      setSnapshotPreview({
        report: rep.report,
        sites,
        categories,
        thresholds,
        versionNumber,
      });
      setPreviewOpen(true);
      void err;
    }
  };

  const handleDownloadJsonArchive = async (reportId: string, versionNumber: number) => {
    try {
      const res = await api.getReportVersionSnapshot(reportId, versionNumber);
      const blob = new Blob([JSON.stringify(res, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${res.snapshot.report.reportNumber}_v${versionNumber}_official.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      notify({ type: 'success', title: 'تم تنزيل النسخة الأرشيفية الموثقة' });
    } catch (err) {
      notify({ type: 'error', title: 'تعذر تنزيل النسخة', message: err instanceof Error ? err.message : '' });
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#EEF3F9]">
      <ExecutiveHeroHeader
        activeTab={activeTab}
        onSelectTab={(tab) => setActiveTab(tab)}
        user={user}
        activeReport={activeReport}
        reportsList={reportsList}
        onSelectReport={handleSelectReport}
        onOpenNewReport={() => setNewReportModalOpen(true)}
        onOpenAuthModal={() => setAuthModalOpen(true)}
        onLogout={async () => {
          await api.logout();
          setUser(null);
          notify({ type: 'info', title: 'تم تسجيل الخروج بنجاح' });
        }}
        onOpenAdminSettings={() => setAdminModalOpen(true)}
        approvedCount={approvedCount}
        onOpenMobileMenu={() => setMobileSidebarOpen(true)}
      />

      {/* Shell Body: dir="rtl" places ExecutiveSidebar (first child) unconditionally on visual RIGHT edge */}
      <div
        dir="rtl"
        className="flex-1 flex items-stretch min-w-0 bg-[radial-gradient(ellipse_at_top,_#F7FAFF_0%,_#ECF2FA_55%,_#E2ECF7_100%)]"
      >
        <ExecutiveSidebar
          activeTab={activeTab}
          onSelectTab={(tab) => setActiveTab(tab)}
          approvedCount={approvedCount}
          mobileOpen={mobileSidebarOpen}
          onCloseMobile={() => setMobileSidebarOpen(false)}
        />

        <main className="relative flex-1 min-w-0 overflow-x-hidden">
          {/* Subtle non-intrusive executive architectural ambience matching MASTER_VISUAL_REFERENCE */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-gradient-to-b from-[#1769AA]/[0.05] via-transparent to-transparent"
          />
          {loading ? (
            <div className="relative z-10 max-w-[1440px] mx-auto px-4 sm:px-6 py-8 space-y-4">
              <div className="h-14 bg-white rounded-xl border border-slate-200 animate-pulse" />
              <div className="h-40 bg-white rounded-xl border border-slate-200 animate-pulse" />
              <div className="h-72 bg-white rounded-xl border border-slate-200 animate-pulse" />
            </div>
          ) : activeTab === 'report' && activeReport ? (
            <div className="relative z-10 max-w-[1480px] mx-auto px-3 sm:px-5 lg:px-6 py-3.5 space-y-3.5">
              <ReportSilverInfoStrip
                activeReport={activeReport}
                reportsList={reportsList}
                onSelectReport={handleSelectReport}
                onOpenNewReport={() => setNewReportModalOpen(true)}
                canCreate={!!user && (user.role === 'admin' || user.role === 'preparer')}
              />
              <MonthlyReportTab
                report={activeReport}
                sites={sites}
                categories={categories}
                thresholds={thresholds}
                user={user}
                dirty={dirty}
                saving={saving}
                onChangeReport={(updater) => {
                  setActiveReport((prev) => (prev ? syncReceptionServiceWithSecurity(updater(prev)) : prev));
                  setDirty(true);
                }}
                onSave={handleSaveReport}
                onSaveSignature={handleSaveSignature}
                onSaveDate={handleSaveDate}
                onOpenPreview={() => {
                  setSnapshotPreview(null);
                  setPreviewOpen(true);
                }}
                onExportExcel={() => handleExportExcel(activeReport.id)}
                onOpenHistory={() => setHistoryModalOpen(true)}
                onOpenSitesModal={() => setSitesModalOpen(true)}
                onTriggerWorkflow={(action) => {
                  if (!user) {
                    setAuthModalOpen(true);
                    return;
                  }
                  setWorkflowAction(action);
                }}
                onOpenAuthModal={() => setAuthModalOpen(true)}
              />
            </div>
          ) : activeTab === 'analytics' ? (
            <AnalyticsTab />
          ) : (
            <ApprovedArchiveTab
              reports={reportsList}
              onPreviewSnapshot={handleOpenSnapshotPreview}
              onViewHistory={async (id) => {
                const res = await api.getReport(id);
                setHistory(res.history);
                setHistoryModalOpen(true);
              }}
              onExportExcel={(id, ver) => handleExportExcel(id, ver)}
              onDownloadJson={handleDownloadJsonArchive}
            />
          )}
        </main>
      </div>

      <CorporateFooter />

      {/* Modals & Toasts */}
      <ToastContainer
        toasts={toasts}
        onDismiss={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))}
      />

      <ConfirmModal
        open={!!pendingReportSwitch}
        title="تعديلات غير محفوظة"
        message="لديك تعديلات غير محفوظة في التقرير الحالي. هل ترغب في تجاهلها والانتقال إلى التقرير المحدد؟"
        confirmLabel="الانتقال وتجاهل التعديلات"
        tone="danger"
        onConfirm={() => {
          const target = pendingReportSwitch;
          setPendingReportSwitch(null);
          if (target) loadReportDetails(target);
        }}
        onCancel={() => setPendingReportSwitch(null)}
      />

      <AuthModal
        open={authModalOpen}
        currentUser={user}
        onClose={() => setAuthModalOpen(false)}
        onSuccess={(u) => {
          setUser(u);
          notify({
            type: 'success',
            title: `مرحباً ${u.fullName}`,
            message: `تم تسجيل الدخول بصلاحية: ${u.jobTitle}`,
          });
        }}
        onError={(msg) => notify({ type: 'error', title: 'تعذر تسجيل الدخول', message: msg })}
      />

      <NewReportModal
        open={newReportModalOpen}
        onClose={() => setNewReportModalOpen(false)}
        onCreate={handleCreateReport}
      />

      <WorkflowActionModal
        open={!!workflowAction}
        action={workflowAction}
        reportNumber={activeReport?.reportNumber || ''}
        user={user}
        onClose={() => setWorkflowAction(null)}
        onConfirm={handleWorkflowConfirm}
      />

      <SitesCategoriesModal
        open={sitesModalOpen}
        sites={sites}
        categories={categories}
        onClose={() => setSitesModalOpen(false)}
        onAddSite={async (nameAr, nameEn) => {
          const res = await api.addSite(nameAr, nameEn);
          setSites(res.sites);
          notify({ type: 'success', title: 'تمت إضافة المقر بنجاح' });
        }}
        onUpdateSite={async (id, payload) => {
          const res = await api.updateSite(id, payload);
          setSites(res.sites);
          notify({ type: 'success', title: 'تم تحديث بيانات المقر' });
        }}
        onAddCategory={async (nameAr, nameEn) => {
          const res = await api.addCategory(nameAr, nameEn);
          setCategories(res.categories);
          notify({ type: 'success', title: 'تمت إضافة فئة الصيانة' });
        }}
      />

      <AdminSettingsModal
        open={adminModalOpen}
        thresholds={thresholds}
        onClose={() => setAdminModalOpen(false)}
        onSaveThresholds={async (t) => {
          try {
            const res = await api.updateThresholds(t);
            setThresholds(res.thresholds);
            notify({ type: 'success', title: 'تم حفظ حدود تقييم الأداء' });
          } catch (err) {
            notify({
              type: 'error',
              title: 'فشل حفظ الحدود',
              message: err instanceof Error ? err.message : '',
            });
          }
        }}
        onNotify={notify}
      />

      <AuditHistoryModal
        open={historyModalOpen}
        onClose={() => setHistoryModalOpen(false)}
        approvals={history.approvals}
        auditLogs={history.auditLogs}
        versions={history.versions}
        onLoadVersion={(ver) => {
          if (activeReport) {
            setHistoryModalOpen(false);
            handleOpenSnapshotPreview(activeReport.id, ver);
          }
        }}
      />

      {(snapshotPreview || activeReport) && (
        <ExecutivePreviewModal
          open={previewOpen}
          report={snapshotPreview ? snapshotPreview.report : activeReport!}
          sites={snapshotPreview ? snapshotPreview.sites : sites}
          categories={snapshotPreview ? snapshotPreview.categories : categories}
          thresholds={snapshotPreview ? snapshotPreview.thresholds : thresholds}
          snapshotVersion={snapshotPreview ? snapshotPreview.versionNumber : null}
          onClose={() => {
            setPreviewOpen(false);
            setSnapshotPreview(null);
          }}
          onExportExcel={() =>
            handleExportExcel(
              snapshotPreview ? snapshotPreview.report.id : activeReport!.id,
              snapshotPreview ? snapshotPreview.versionNumber : undefined
            )
          }
        />
      )}
    </div>
  );
}
