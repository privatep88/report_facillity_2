import React, { useEffect, useState } from 'react';
import {
  Building2,
  FilePlus2,
  History,
  KeyRound,
  Plus,
  Settings,
  Shield,
  UserCheck,
} from 'lucide-react';
import type {
  ApprovalRecord,
  AuditLogEntry,
  AuthUser,
  MaintenanceCategory,
  MaintenanceSite,
  PerformanceThresholds,
  ReportVersionSummary,
  UserRole,
} from '../types/report.ts';
import { ARABIC_MONTHS, ROLE_LABELS_AR, STATUS_LABELS_AR, USER_ROLES } from '../types/report.ts';
import type { DemoAccount } from '../api/client.ts';
import { api } from '../api/client.ts';
import { exportReportExcel } from '../services/ReportExportService.ts';
import { formatDateTimeWestern, formatNumber } from '../utils/calculations.ts';
import { SaaedModalFrame } from '../notifications/NotificationDialogs.tsx';
import type { NotificationContextKey } from '../notifications/types.ts';
import { NumericInput } from './NumericInput.tsx';

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message?: string;
}

export const AuthModal: React.FC<{
  open: boolean;
  currentUser: AuthUser | null;
  onClose: () => void;
  onSuccess: (user: AuthUser) => void;
  onError: (msg: string) => void;
}> = ({ open, currentUser, onClose, onSuccess, onError }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [demoAccounts, setDemoAccounts] = useState<DemoAccount[]>([]);

  useEffect(() => {
    if (open) {
      api
        .getDemoAccounts()
        .then((res) => setDemoAccounts(res.accounts))
        .catch(() => {});
    }
  }, [open]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    try {
      const res = await api.login(email, password);
      onSuccess(res.user);
      onClose();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'فشل تسجيل الدخول');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickLogin = async (accEmail: string) => {
    if (loading) return;
    setLoading(true);
    try {
      const res = await api.login(accEmail, 'Saaed@2027');
      onSuccess(res.user);
      onClose();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'تعذر تبديل الحساب');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SaaedModalFrame
      open={open}
      onClose={() => {
        if (!loading) onClose();
      }}
      disableBackdropClose={loading}
      titleAr="المصادقة والصلاحيات المؤسسية"
      subtitleAr="نظام ساعد لإدارة المرافق · التوقيع الإلكتروني الموثق"
      context="auth"
      accentColor="gold"
      size="md"
      icon={<KeyRound className="w-4 h-4 text-[#D5AD5D]" />}
    >
      {currentUser && (
        <div className="mb-4 p-3 rounded-xl bg-[#EFF6FC] border border-[#10518C]/20 flex items-center justify-between text-xs">
          <div>
            <span className="text-slate-600">الجلسة النشطة: </span>
            <span className="font-bold text-[#082D56]">{currentUser.fullName}</span>
            <span className="mx-1.5 text-slate-400">·</span>
            <span className="font-semibold text-[#10518C]">{ROLE_LABELS_AR[currentUser.role]}</span>
          </div>
        </div>
      )}

      <form onSubmit={handleLogin} className="space-y-3">
        <div>
          <label className="block text-xs font-bold text-[#082D56] mb-1">البريد الإلكتروني المؤسسي</label>
          <input
            type="email"
            required
            dir="ltr"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@saaed.ae"
            className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm focus:border-[#10518C] focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-[#082D56] mb-1">كلمة المرور</label>
          <input
            type="password"
            required
            dir="ltr"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm focus:border-[#10518C] focus:outline-none"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="w-full py-2.5 rounded-xl bg-[#082D56] hover:bg-[#10518C] text-white text-sm font-extrabold transition-colors disabled:opacity-60 cursor-pointer"
        >
          {loading ? 'جاري التحقق...' : 'تسجيل الدخول'}
        </button>
      </form>

      <div className="mt-5 pt-4 border-t border-slate-100">
        <p className="text-xs font-bold text-[#082D56] mb-2.5">حسابات الأدوار المعتمدة للتجربة السريعة (مصادقة فعلية):</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {demoAccounts.map((acc) => (
            <button
              key={acc.id}
              type="button"
              disabled={loading}
              onClick={() => handleQuickLogin(acc.email)}
              className={`text-start p-2.5 rounded-xl border transition-all cursor-pointer ${
                currentUser?.id === acc.id
                  ? 'border-[#07976E] bg-emerald-50/50'
                  : 'border-slate-200 hover:border-[#10518C] hover:bg-[#EFF6FC]'
              }`}
            >
              <div className="flex items-center justify-between gap-1">
                <span className="text-xs font-extrabold text-[#082D56] truncate">{acc.fullName}</span>
                <span className="text-[11px] font-bold text-[#10518C] shrink-0">
                  {ROLE_LABELS_AR[acc.role]}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 truncate mt-0.5">{acc.jobTitle}</p>
            </button>
          ))}
        </div>
      </div>
    </SaaedModalFrame>
  );
};

export const NewReportModal: React.FC<{
  open: boolean;
  onClose: () => void;
  onCreate: (year: number, month: number, department: string) => Promise<void>;
}> = ({ open, onClose, onCreate }) => {
  const [year, setYear] = useState(2027);
  const [month, setMonth] = useState(2);
  const [department, setDepartment] = useState('إدارة الخدمات العامة');
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (open) setErrorMsg(null);
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setErrorMsg(null);
    try {
      await onCreate(year, month, department);
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'تعذر إنشاء التقرير');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SaaedModalFrame
      open={open}
      onClose={() => {
        if (!saving) onClose();
      }}
      disableBackdropClose={saving}
      titleAr="إنشاء تقرير شهري مستقل جديد"
      titleEn="Create New Monthly Executive Report"
      context="draft_created"
      accentColor="gold"
      size="md"
      icon={<FilePlus2 className="w-4 h-4 text-[#D5AD5D]" />}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {errorMsg && (
          <div className="p-3 rounded-xl bg-red-50 border border-[#C94444]/35 text-xs font-bold text-[#C94444]">
            {errorMsg}
          </div>
        )}
        <div className="p-3 rounded-xl bg-[#EFF6FC] border border-[#10518C]/20 text-xs text-[#082D56] leading-relaxed">
          يُنشأ التقرير ببيانات صفرية مستقلة للشهر المحدد مع الاحتفاظ باسم المعد والمعتمد من التقرير السابق، وبترقيم فريد.
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-[#082D56] mb-1">السنة</label>
            <NumericInput
              min={2024}
              max={2050}
              value={year}
              onChangeValue={setYear}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm tabular-nums focus:border-[#10518C] focus:outline-none"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-[#082D56] mb-1">الشهر</label>
            <select
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:border-[#10518C] focus:outline-none"
            >
              {ARABIC_MONTHS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.value} - {m.nameAr}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-[#082D56] mb-1">الإدارة</label>
          <input
            type="text"
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
            className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:border-[#10518C] focus:outline-none"
            required
          />
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
          <button
            type="button"
            disabled={saving}
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 cursor-pointer"
          >
            إلغاء
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-5 py-2 rounded-xl bg-[#082D56] hover:bg-[#10518C] text-white text-xs font-extrabold disabled:opacity-60 cursor-pointer"
          >
            {saving ? 'جاري الإنشاء...' : 'إنشاء المسودة'}
          </button>
        </div>
      </form>
    </SaaedModalFrame>
  );
};

export const WorkflowActionModal: React.FC<{
  open: boolean;
  action:
    | 'submit_review'
    | 'start_review'
    | 'return_revision'
    | 'forward_approval'
    | 'approve'
    | 'archive'
    | 'create_revision'
    | null;
  reportNumber: string;
  user: AuthUser | null;
  onClose: () => void;
  onConfirm: (comment: string) => Promise<void>;
}> = ({ open, action, reportNumber, user, onClose, onConfirm }) => {
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    setComment('');
    setErrorMsg(null);
  }, [open, action]);

  if (!open || !action) return null;

  const meta: Record<
    string,
    {
      title: string;
      desc: string;
      requireComment: boolean;
      btnLabel: string;
      tone: string;
      accent: 'navy' | 'gold' | 'green' | 'amber' | 'red';
      context: NotificationContextKey;
    }
  > = {
    submit_review: {
      title: 'تأكيد إرسال التقرير للاعتماد',
      desc: `سيتم توثيق توقيع الإعداد الإلكتروني وإرسال التقرير (${reportNumber}) إلى مرحلة بانتظار الاعتماد.`,
      requireComment: false,
      btnLabel: 'إرسال للاعتماد',
      tone: 'bg-[#10518C] hover:bg-[#082D56] text-white',
      accent: 'gold',
      context: 'submitted',
    },
    start_review: {
      title: 'بدء المراجعة الرسمية',
      desc: `تحويل حالة التقرير (${reportNumber}) إلى «بانتظار الاعتماد» وتسجيل المراجع في سجل التدقيق.`,
      requireComment: false,
      btnLabel: 'بدء المراجعة',
      tone: 'bg-[#10518C] hover:bg-[#082D56] text-white',
      accent: 'navy',
      context: 'submitted',
    },
    forward_approval: {
      title: 'اكتمال المراجعة والرفع للاعتماد',
      desc: `تأكيد مراجعة كافة البنود ورفع التقرير (${reportNumber}) لصاحب صلاحية الاعتماد النهائي.`,
      requireComment: false,
      btnLabel: 'رفع للاعتماد',
      tone: 'bg-[#07976E] hover:bg-[#05805d] text-white',
      accent: 'green',
      context: 'approval',
    },
    return_revision: {
      title: 'إرجاع التقرير للتعديل',
      desc: `سيتم إعادة التقرير (${reportNumber}) إلى حالة «مسودة» مع إلزامية توثيق سبب الإرجاع في سجل التدقيق.`,
      requireComment: true,
      btnLabel: 'تأكيد الإرجاع',
      tone: 'bg-[#C94444] hover:bg-[#ad3636] text-white',
      accent: 'red',
      context: 'returned',
    },
    approve: {
      title: 'الاعتماد الرسمي والتوقيع الإلكتروني',
      desc: `سيتم اعتماد التقرير (${reportNumber}) وتوليد نسخة رسمية ثابتة محمية من التعديل بتوقيع إلكتروني موثق.`,
      requireComment: false,
      btnLabel: 'اعتماد التقرير نهائياً',
      tone: 'bg-[#07976E] hover:bg-[#05805d] text-white',
      accent: 'green',
      context: 'approval',
    },
    archive: {
      title: 'نقل التقرير إلى الأرشيف الرسمي',
      desc: `تأكيد أرشفة التقرير المعتمد (${reportNumber}) وحفظه في سجل التقارير المعتمدة الدائم.`,
      requireComment: false,
      btnLabel: 'أرشفة التقرير',
      tone: 'bg-[#082D56] hover:bg-[#10518C] text-white',
      accent: 'gold',
      context: 'archive',
    },
    create_revision: {
      title: 'إنشاء إصدار جديد للتصحيح',
      desc: `النسخة المعتمدة محمية من التعديل المباشر. سيتم فتح إصدار جديد يخضع لدورة اعتماد مستقلة مع حفظ النسخة السابقة.`,
      requireComment: true,
      btnLabel: 'فتح إصدار جديد',
      tone: 'bg-[#D99A22] hover:bg-[#b88119] text-[#082D56]',
      accent: 'amber',
      context: 'revision',
    },
  };

  const info = meta[action];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setErrorMsg(null);
    try {
      await onConfirm(comment);
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'تعذر تنفيذ الإجراء');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SaaedModalFrame
      open={open}
      onClose={() => {
        if (!submitting) onClose();
      }}
      disableBackdropClose={submitting}
      titleAr={info.title}
      subtitleAr={`رقم التقرير: ${reportNumber}`}
      context={info.context}
      accentColor={info.accent}
      size="md"
      icon={<UserCheck className="w-4 h-4 text-[#D5AD5D]" />}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {errorMsg && (
          <div className="p-3 rounded-xl bg-red-50 border border-[#C94444]/35 text-xs font-bold text-[#C94444]">
            {errorMsg}
          </div>
        )}
        <p className="text-sm text-[#142D4C] leading-relaxed font-semibold">{info.desc}</p>

        {user && (
          <div className="p-3 rounded-xl bg-[#EFF6FC] border border-[#10518C]/20 text-xs space-y-1">
            <div>
              <span className="text-slate-500">المسؤول الموثق: </span>
              <span className="font-bold text-[#082D56]">{user.fullName}</span>
            </div>
            <div>
              <span className="text-slate-500">الدور والصلاحية: </span>
              <span className="font-semibold text-[#10518C]">{ROLE_LABELS_AR[user.role]}</span>
            </div>
          </div>
        )}

        <div>
          <label className="block text-xs font-bold text-[#082D56] mb-1">
            {info.requireComment ? 'السبب / الملاحظات (إلزامي)' : 'ملاحظات الاعتماد / المراجعة (اختياري)'}
          </label>
          <textarea
            rows={3}
            required={info.requireComment}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder={
              info.requireComment
                ? 'يرجى كتابة سبب الإرجاع أو التصحيح بوضوح...'
                : 'أضف ملاحظة توثيقية إن وجدت...'
            }
            className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:border-[#10518C] focus:outline-none"
          />
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
          <button
            type="button"
            disabled={submitting}
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 cursor-pointer"
          >
            إلغاء
          </button>
          <button
            type="submit"
            disabled={submitting}
            className={`px-5 py-2 rounded-xl text-xs font-extrabold disabled:opacity-60 cursor-pointer ${info.tone}`}
          >
            {submitting ? 'جاري التنفيذ...' : info.btnLabel}
          </button>
        </div>
      </form>
    </SaaedModalFrame>
  );
};

export const SitesCategoriesModal: React.FC<{
  open: boolean;
  sites: MaintenanceSite[];
  categories: MaintenanceCategory[];
  onClose: () => void;
  onAddSite: (nameAr: string, nameEn: string) => Promise<void>;
  onUpdateSite: (id: string, payload: { nameAr?: string; isActive?: boolean }) => Promise<void>;
  onAddCategory: (nameAr: string, nameEn: string) => Promise<void>;
}> = ({ open, sites, categories, onClose, onAddSite, onUpdateSite, onAddCategory }) => {
  const [newSiteAr, setNewSiteAr] = useState('');
  const [newSiteEn, setNewSiteEn] = useState('');
  const [newCatAr, setNewCatAr] = useState('');
  const [newCatEn, setNewCatEn] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  return (
    <SaaedModalFrame
      open={open}
      onClose={onClose}
      titleAr="إدارة المقرات وفئات الصيانة"
      titleEn="Sites & Maintenance Categories Management"
      context="maintenance"
      accentColor="gold"
      size="lg"
      icon={<Building2 className="w-4 h-4 text-[#D5AD5D]" />}
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Sites */}
        <div>
          <h4 className="text-sm font-extrabold text-[#082D56] mb-2.5">
            المقرات المسجلة (<span dir="ltr" className="tabular-nums">{formatNumber(sites.length)}</span>)
          </h4>
          <div className="space-y-2 max-h-60 overflow-y-auto fm-scroll pr-1">
            {sites.map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between gap-2 p-2.5 rounded-xl border border-slate-200 bg-[#EFF6FC]/60"
              >
                {editingId === s.id ? (
                  <div className="flex items-center gap-1.5 flex-1">
                    <input
                      type="text"
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      className="flex-1 px-2 py-1 text-xs rounded border border-[#10518C] bg-white"
                    />
                    <button
                      type="button"
                      onClick={async () => {
                        if (editingName.trim()) {
                          await onUpdateSite(s.id, { nameAr: editingName.trim() });
                        }
                        setEditingId(null);
                      }}
                      className="px-2 py-1 rounded bg-[#07976E] text-white text-[11px] font-bold cursor-pointer"
                    >
                      حفظ
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="min-w-0">
                      <p
                        className={`text-xs font-bold truncate ${
                          s.isActive ? 'text-[#082D56]' : 'text-slate-400 line-through'
                        }`}
                      >
                        {s.nameAr}
                      </p>
                      <p className="text-[10px] text-slate-500">{s.nameEn}</p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(s.id);
                          setEditingName(s.nameAr);
                        }}
                        className="px-2 py-1 rounded border border-slate-200 bg-white text-[11px] font-semibold text-slate-600 hover:text-[#10518C] cursor-pointer"
                      >
                        تعديل
                      </button>
                      <button
                        type="button"
                        onClick={() => onUpdateSite(s.id, { isActive: !s.isActive })}
                        className={`px-2 py-1 rounded text-[11px] font-semibold cursor-pointer ${
                          s.isActive ? 'bg-emerald-50 text-[#07976E]' : 'bg-slate-200 text-slate-600'
                        }`}
                      >
                        {s.isActive ? 'فعّال' : 'موقوف'}
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>

          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!newSiteAr.trim()) return;
              await onAddSite(newSiteAr.trim(), newSiteEn.trim() || newSiteAr.trim());
              setNewSiteAr('');
              setNewSiteEn('');
            }}
            className="mt-3 space-y-2 pt-3 border-t border-slate-100"
          >
            <input
              type="text"
              placeholder="اسم المقر الجديد (بالعربية)"
              value={newSiteAr}
              onChange={(e) => setNewSiteAr(e.target.value)}
              className="w-full px-3 py-1.5 rounded-lg border border-slate-200 text-xs"
              required
            />
            <input
              type="text"
              placeholder="Site Name (English - optional)"
              value={newSiteEn}
              onChange={(e) => setNewSiteEn(e.target.value)}
              className="w-full px-3 py-1.5 rounded-lg border border-slate-200 text-xs"
            />
            <button
              type="submit"
              className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg bg-[#082D56] hover:bg-[#10518C] text-white text-xs font-bold cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>إضافة مقر جديد</span>
            </button>
          </form>
        </div>

        {/* Categories */}
        <div>
          <h4 className="text-sm font-extrabold text-[#082D56] mb-2.5">
            فئات الصيانة (<span dir="ltr" className="tabular-nums">{formatNumber(categories.length)}</span>)
          </h4>
          <div className="space-y-1.5 max-h-60 overflow-y-auto fm-scroll pr-1">
            {categories.map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between p-2 rounded-lg border border-slate-200 bg-white text-xs"
              >
                <span className="font-semibold text-[#082D56]">{c.nameAr}</span>
                <span className="text-[11px] text-slate-400">{c.nameEn}</span>
              </div>
            ))}
          </div>

          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!newCatAr.trim()) return;
              await onAddCategory(newCatAr.trim(), newCatEn.trim() || newCatAr.trim());
              setNewCatAr('');
              setNewCatEn('');
            }}
            className="mt-3 space-y-2 pt-3 border-t border-slate-100"
          >
            <input
              type="text"
              placeholder="اسم فئة الصيانة الجديدة"
              value={newCatAr}
              onChange={(e) => setNewCatAr(e.target.value)}
              className="w-full px-3 py-1.5 rounded-lg border border-slate-200 text-xs"
              required
            />
            <input
              type="text"
              placeholder="Category Name (English - optional)"
              value={newCatEn}
              onChange={(e) => setNewCatEn(e.target.value)}
              className="w-full px-3 py-1.5 rounded-lg border border-slate-200 text-xs"
            />
            <button
              type="submit"
              className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg bg-[#10518C] hover:bg-[#082D56] text-white text-xs font-bold cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>إضافة فئة صيانة</span>
            </button>
          </form>
        </div>
      </div>
    </SaaedModalFrame>
  );
};

export const AdminSettingsModal: React.FC<{
  open: boolean;
  thresholds: PerformanceThresholds;
  onClose: () => void;
  onSaveThresholds: (t: PerformanceThresholds) => Promise<void>;
  onNotify: (t: Omit<ToastMessage, 'id'>) => void;
}> = ({ open, thresholds, onClose, onSaveThresholds, onNotify }) => {
  const [form, setForm] = useState<PerformanceThresholds>(thresholds);
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newRole, setNewRole] = useState<UserRole>(USER_ROLES.PREPARER);
  const [newPassword, setNewPassword] = useState('');

  useEffect(() => {
    setForm(thresholds);
    if (open) {
      api
        .getAdminUsers()
        .then((res) => setUsers(res.users))
        .catch(() => {});
    }
  }, [open, thresholds]);

  return (
    <SaaedModalFrame
      open={open}
      onClose={onClose}
      titleAr="إعدادات مدير النظام ومعايير الأداء"
      titleEn="System Settings & RBAC Access"
      context="admin"
      accentColor="gold"
      size="xl"
      icon={<Settings className="w-4 h-4 text-[#D5AD5D]" />}
    >
      <div className="space-y-6">
        {/* Configurable KPI Thresholds */}
        <div className="p-4 rounded-xl bg-[#EFF6FC] border border-[#10518C]/20">
          <h4 className="text-sm font-extrabold text-[#082D56] mb-3">
            حدود تصنيف مستويات الأداء القابلة للإعداد (%)
          </h4>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">ممتاز ≥</label>
              <NumericInput
                min={1}
                max={100}
                value={form.excellentMin}
                onChangeValue={(v) => setForm({ ...form, excellentMin: v })}
                className="w-full px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-sm tabular-nums"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">جيد جداً ≥</label>
              <NumericInput
                min={1}
                max={99}
                value={form.veryGoodMin}
                onChangeValue={(v) => setForm({ ...form, veryGoodMin: v })}
                className="w-full px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-sm tabular-nums"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">جيد ≥</label>
              <NumericInput
                min={1}
                max={98}
                value={form.goodMin}
                onChangeValue={(v) => setForm({ ...form, goodMin: v })}
                className="w-full px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-sm tabular-nums"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">يحتاج تحسين ≥</label>
              <NumericInput
                min={0}
                max={97}
                value={form.needsImprovementMin}
                onChangeValue={(v) => setForm({ ...form, needsImprovementMin: v })}
                className="w-full px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-sm tabular-nums"
              />
            </div>
          </div>
          <div className="mt-3 flex justify-end">
            <button
              type="button"
              onClick={() => onSaveThresholds(form)}
              className="px-4 py-1.5 rounded-lg bg-[#082D56] hover:bg-[#10518C] text-white text-xs font-bold cursor-pointer"
            >
              حفظ حدود التقييم
            </button>
          </div>
        </div>

        {/* Users & RBAC Management */}
        <div>
          <div className="flex items-center gap-2 mb-2.5">
            <Shield className="w-4 h-4 text-[#10518C]" />
            <h4 className="text-sm font-extrabold text-[#082D56]">المستخدمون والصلاحيات</h4>
          </div>
          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-xs">
              <thead className="bg-[#082D56] text-white">
                <tr>
                  <th className="py-2 px-3 text-start">الاسم</th>
                  <th className="py-2 px-3 text-start">البريد الإلكتروني</th>
                  <th className="py-2 px-3 text-start">الصلاحية</th>
                  <th className="py-2 px-3 text-center">الحالة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50">
                    <td className="py-2 px-3 font-semibold text-[#082D56]">
                      {u.fullName}
                      <div className="text-[11px] font-normal text-slate-500">{u.jobTitle}</div>
                    </td>
                    <td className="py-2 px-3 font-mono text-[11px]" dir="ltr">
                      {u.email}
                    </td>
                    <td className="py-2 px-3">
                      <select
                        value={u.role}
                        onChange={async (e) => {
                          const role = e.target.value as UserRole;
                          try {
                            await api.updateAdminUser(u.id, { role });
                            setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, role } : x)));
                            onNotify({ type: 'success', title: 'تم تحديث الصلاحية' });
                          } catch (err) {
                            onNotify({
                              type: 'error',
                              title: 'فشل التحديث',
                              message: err instanceof Error ? err.message : '',
                            });
                          }
                        }}
                        className="px-2 py-1 rounded border border-slate-200 bg-white text-xs"
                      >
                        {Object.entries(ROLE_LABELS_AR).map(([k, lbl]) => (
                          <option key={k} value={k}>
                            {lbl}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2 px-3 text-center">
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            const nextActive = !u.isActive;
                            await api.updateAdminUser(u.id, { isActive: nextActive });
                            setUsers((prev) =>
                              prev.map((x) => (x.id === u.id ? { ...x, isActive: nextActive } : x))
                            );
                            onNotify({
                              type: 'success',
                              title: nextActive ? 'تم تفعيل حساب المستخدم' : 'تم إيقاف حساب المستخدم',
                              message: u.fullName,
                            });
                          } catch (err) {
                            onNotify({
                              type: 'error',
                              title: 'تعذر تحديث حالة الحساب',
                              message: err instanceof Error ? err.message : '',
                            });
                          }
                        }}
                        className={`px-2.5 py-1 rounded text-[11px] font-semibold cursor-pointer ${
                          u.isActive ? 'bg-emerald-50 text-[#07976E]' : 'bg-red-50 text-[#C94444]'
                        }`}
                      >
                        {u.isActive ? 'نشط' : 'موقوف'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <form
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await api.createAdminUser({
                  email: newEmail,
                  fullName: newName,
                  jobTitle: newTitle,
                  role: newRole,
                  password: newPassword,
                });
                const res = await api.getAdminUsers();
                setUsers(res.users);
                setNewEmail('');
                setNewName('');
                setNewTitle('');
                setNewPassword('');
                onNotify({ type: 'success', title: 'تمت إضافة المستخدم بنجاح' });
              } catch (err) {
                onNotify({
                  type: 'error',
                  title: 'تعذر الإضافة',
                  message: err instanceof Error ? err.message : '',
                });
              }
            }}
            className="mt-3 grid grid-cols-1 sm:grid-cols-5 gap-2"
          >
            <input
              type="text"
              placeholder="الاسم الكامل"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              required
              className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs"
            />
            <input
              type="email"
              placeholder="البريد الإلكتروني"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              required
              className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs"
            />
            <input
              type="text"
              placeholder="المسمى الوظيفي"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs"
            />
            <select
              value={newRole}
              onChange={(e) => setNewRole(e.target.value as UserRole)}
              className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs"
            >
              {Object.entries(ROLE_LABELS_AR).map(([k, lbl]) => (
                <option key={k} value={k}>
                  {lbl}
                </option>
              ))}
            </select>
            <div className="flex gap-1.5">
              <input
                type="password"
                placeholder="كلمة المرور"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs"
              />
              <button
                type="submit"
                className="px-3 py-1.5 rounded-lg bg-[#082D56] text-white text-xs font-bold shrink-0 cursor-pointer"
              >
                إضافة
              </button>
            </div>
          </form>
        </div>
      </div>
    </SaaedModalFrame>
  );
};

export const AuditHistoryModal: React.FC<{
  open: boolean;
  onClose: () => void;
  approvals: ApprovalRecord[];
  auditLogs: AuditLogEntry[];
  versions: ReportVersionSummary[];
  onLoadVersion?: (versionNumber: number) => void;
  onExportVersionExcel?: (reportId: string, versionNumber: number) => void;
}> = ({ open, onClose, approvals, auditLogs, versions, onLoadVersion, onExportVersionExcel }) => {
  const [subTab, setSubTab] = useState<'approvals' | 'audit' | 'versions'>('approvals');
  const [exportingVersion, setExportingVersion] = useState<number | null>(null);

  return (
    <SaaedModalFrame
      open={open}
      onClose={onClose}
      titleAr="سجل الاعتمادات والتدقيق والإصدارات"
      titleEn="Approvals, Audit Trail & Versions"
      context="archive"
      accentColor="gold"
      size="xl"
      showVisualBanner={false}
      icon={<History className="w-4 h-4 text-[#D5AD5D]" />}
    >
      <div className="flex flex-wrap items-center gap-2 bg-[#EFF6FC] p-1 rounded-xl w-fit">
        <button
          type="button"
          onClick={() => setSubTab('approvals')}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer ${
            subTab === 'approvals' ? 'bg-[#082D56] text-white' : 'text-slate-600'
          }`}
        >
          سجل الاعتماد (<span dir="ltr" className="tabular-nums">{formatNumber(approvals.length)}</span>)
        </button>
        <button
          type="button"
          onClick={() => setSubTab('audit')}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer ${
            subTab === 'audit' ? 'bg-[#082D56] text-white' : 'text-slate-600'
          }`}
        >
          سجل التدقيق (<span dir="ltr" className="tabular-nums">{formatNumber(auditLogs.length)}</span>)
        </button>
        <button
          type="button"
          onClick={() => setSubTab('versions')}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer ${
            subTab === 'versions' ? 'bg-[#082D56] text-white' : 'text-slate-600'
          }`}
        >
          الإصدارات المعتمدة (<span dir="ltr" className="tabular-nums">{formatNumber(versions.length)}</span>)
        </button>
      </div>

      <div className="mt-4 max-h-[60vh] overflow-y-auto fm-scroll">
        {subTab === 'approvals' && (
          <div className="space-y-2.5">
            {approvals.length === 0 ? (
              <p className="text-sm text-slate-500 py-8 text-center">لا توجد حركات اعتماد مسجلة بعد.</p>
            ) : (
              approvals.map((a) => (
                <div
                  key={a.id}
                  className="p-3.5 rounded-xl border border-slate-200 bg-[#EFF6FC]/60 text-xs space-y-1"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-bold text-[#082D56]">
                      {a.actorName} ({ROLE_LABELS_AR[a.actorRole as UserRole] || a.actorRole})
                    </span>
                    <span className="font-mono text-slate-500 tabular-nums" dir="ltr">
                      {formatDateTimeWestern(a.createdAt)}
                    </span>
                  </div>
                  <div className="text-slate-700">
                    انتقال الحالة:{' '}
                    <span className="font-semibold">
                      {STATUS_LABELS_AR[a.fromStatus as keyof typeof STATUS_LABELS_AR] || a.fromStatus}
                    </span>{' '}
                    ←{' '}
                    <span className="font-bold text-[#07976E]">
                      {STATUS_LABELS_AR[a.toStatus as keyof typeof STATUS_LABELS_AR] || a.toStatus}
                    </span>
                    {' · '}إصدار{' '}
                    <span className="font-mono tabular-nums" dir="ltr">
                      v{a.versionNumber}
                    </span>
                  </div>
                  {a.comment && (
                    <p className="text-slate-600 bg-white p-2 rounded-lg border border-slate-100 mt-1">
                      {a.comment}
                    </p>
                  )}
                  <p className="text-[11px] font-mono text-[#10518C] tabular-nums" dir="ltr">
                    التوقيع الإلكتروني الموثق: {a.signatureToken}
                  </p>
                </div>
              ))
            )}
          </div>
        )}

        {subTab === 'audit' && (
          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-xs">
              <thead className="bg-[#082D56] text-white">
                <tr>
                  <th className="py-2 px-3 text-start">التاريخ والوقت</th>
                  <th className="py-2 px-3 text-start">المستخدم</th>
                  <th className="py-2 px-3 text-start">العملية</th>
                  <th className="py-2 px-3 text-start">التفاصيل / السبب</th>
                  <th className="py-2 px-3 text-center">الإصدار</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {auditLogs.map((l) => (
                  <tr key={l.id} className="hover:bg-slate-50">
                    <td className="py-2 px-3 font-mono text-[11px] whitespace-nowrap tabular-nums" dir="ltr">
                      {formatDateTimeWestern(l.createdAt)}
                    </td>
                    <td className="py-2 px-3 font-semibold text-[#082D56]">
                      {l.userName}
                      <span className="block text-[10px] text-slate-400">
                        {ROLE_LABELS_AR[l.userRole as UserRole] || l.userRole}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-slate-700">{l.action}</td>
                    <td className="py-2 px-3 text-slate-600">
                      {l.reason || `${l.previousValue} → ${l.newValue}`}
                    </td>
                    <td className="py-2 px-3 text-center font-mono tabular-nums" dir="ltr">
                      v{l.versionNumber}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {subTab === 'versions' && (
          <div className="space-y-2.5">
            {versions.length === 0 ? (
              <p className="text-sm text-slate-500 py-8 text-center">لم يتم اعتماد أي إصدار ثابت بعد.</p>
            ) : (
              versions.map((v) => (
                <div
                  key={v.id}
                  className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl border border-slate-200 bg-white"
                >
                  <div>
                    <p className="text-sm font-bold text-[#082D56]">
                      الإصدار المعتمد{' '}
                      <span className="font-mono text-[#07976E] tabular-nums" dir="ltr">
                        v{v.versionNumber}
                      </span>
                    </p>
                    <p className="text-xs text-slate-600 mt-0.5">
                      اعتماد: {v.approvedByName} · التوقيع:{' '}
                      <span className="font-mono text-[#10518C]" dir="ltr">
                        {v.signatureToken}
                      </span>
                    </p>
                    <p className="text-[11px] text-slate-400 font-mono tabular-nums" dir="ltr">
                      {formatDateTimeWestern(v.createdAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {onLoadVersion && (
                      <button
                        type="button"
                        onClick={() => onLoadVersion(v.versionNumber)}
                        className="px-3 py-1.5 rounded-lg bg-[#EFF6FC] hover:bg-[#10518C] hover:text-white text-[#10518C] text-xs font-bold transition-colors cursor-pointer"
                      >
                        معاينة النسخة المعتمدة
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={exportingVersion === v.versionNumber}
                      onClick={async () => {
                        if (onExportVersionExcel) {
                          onExportVersionExcel(v.reportId, v.versionNumber);
                          return;
                        }
                        setExportingVersion(v.versionNumber);
                        try {
                          await exportReportExcel({ reportId: v.reportId, versionNumber: v.versionNumber });
                        } finally {
                          setExportingVersion((cur) => (cur === v.versionNumber ? null : cur));
                        }
                      }}
                      className="px-3 py-1.5 rounded-lg bg-[#07976E] hover:bg-[#05805d] disabled:opacity-60 text-white text-xs font-bold transition-colors cursor-pointer"
                    >
                      {exportingVersion === v.versionNumber ? 'جارٍ التصدير...' : 'تصدير Excel'} (
                      <span dir="ltr">v{v.versionNumber}</span>)
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </SaaedModalFrame>
  );
};
