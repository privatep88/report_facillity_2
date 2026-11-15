import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  History,
  Info,
  KeyRound,
  Plus,
  Settings,
  Shield,
  UserCheck,
  X,
  XCircle,
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
import { formatDateTimeWestern, formatNumber } from '../utils/calculations.ts';
import { NumericInput } from './NumericInput.tsx';

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message?: string;
}

export const ToastContainer: React.FC<{
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}> = ({ toasts, onDismiss }) => {
  if (toasts.length === 0) return null;
  return (
    <div className="no-print fixed bottom-5 left-5 z-50 flex flex-col gap-2.5 max-w-sm w-full pointer-events-none">
      {toasts.map((t) => {
        const colors =
          t.type === 'success'
            ? 'border-[#069B74] bg-white text-[#0B2341]'
            : t.type === 'error'
              ? 'border-[#C43D47] bg-white text-[#0B2341]'
              : t.type === 'warning'
                ? 'border-[#C8A85D] bg-white text-[#0B2341]'
                : 'border-[#1769AA] bg-white text-[#0B2341]';

        const Icon =
          t.type === 'success'
            ? CheckCircle2
            : t.type === 'error'
              ? XCircle
              : t.type === 'warning'
                ? AlertTriangle
                : Info;

        const iconColor =
          t.type === 'success'
            ? 'text-[#069B74]'
            : t.type === 'error'
              ? 'text-[#C43D47]'
              : t.type === 'warning'
                ? 'text-[#C8A85D]'
                : 'text-[#1769AA]';

        return (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-start gap-3 p-4 rounded-xl border shadow-lg transition-all ${colors}`}
          >
            <Icon className={`w-5 h-5 shrink-0 mt-0.5 ${iconColor}`} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-[#0B2341]">{t.title}</p>
              {t.message && <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">{t.message}</p>}
            </div>
            <button
              type="button"
              onClick={() => onDismiss(t.id)}
              className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
};

export const ConfirmModal: React.FC<{
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'primary' | 'danger' | 'success';
  onConfirm: () => void;
  onCancel: () => void;
}> = ({
  open,
  title,
  message,
  confirmLabel = 'تأكيد',
  cancelLabel = 'إلغاء',
  tone = 'primary',
  onConfirm,
  onCancel,
}) => {
  if (!open) return null;
  const btnCls =
    tone === 'danger'
      ? 'bg-[#C43D47] hover:bg-[#a9323b] text-white'
      : tone === 'success'
        ? 'bg-[#069B74] hover:bg-[#058261] text-white'
        : 'bg-[#0B2341] hover:bg-[#1769AA] text-white';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full p-6">
        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-xl bg-[#EAF4FC] text-[#1769AA] shrink-0">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div className="flex-1">
            <h3 className="text-base font-bold text-[#0B2341]">{title}</h3>
            <p className="text-sm text-slate-600 mt-1.5 leading-relaxed">{message}</p>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2.5 mt-6">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
          >
            {cancelLabel}
          </button>
          <button type="button" onClick={onConfirm} className={`px-5 py-2 rounded-lg text-xs font-bold cursor-pointer ${btnCls}`}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

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

  if (!open) return null;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-lg w-full p-6 my-8">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-[#0B2341] text-[#C8A85D]">
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-[#0B2341]">المصادقة والصلاحيات المؤسسية</h3>
              <p className="text-xs text-slate-500">نظام ساعد لإدارة المرافق · التوقيع الإلكتروني الموثق</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-700 cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        {currentUser && (
          <div className="mt-4 p-3 rounded-xl bg-[#EAF4FC] border border-[#1769AA]/20 flex items-center justify-between text-xs">
            <div>
              <span className="text-slate-600">الجلسة النشطة: </span>
              <span className="font-bold text-[#0B2341]">{currentUser.fullName}</span>
              <span className="mx-1.5 text-slate-400">·</span>
              <span className="font-semibold text-[#1769AA]">{ROLE_LABELS_AR[currentUser.role]}</span>
            </div>
          </div>
        )}

        <form onSubmit={handleLogin} className="mt-4 space-y-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">البريد الإلكتروني المؤسسي</label>
            <input
              type="email"
              required
              dir="ltr"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@saaed.ae"
              className="w-full px-3.5 py-2 rounded-lg border border-slate-200 text-sm focus:border-[#1769AA] focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">كلمة المرور</label>
            <input
              type="password"
              required
              dir="ltr"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-3.5 py-2 rounded-lg border border-slate-200 text-sm focus:border-[#1769AA] focus:outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-lg bg-[#0B2341] hover:bg-[#1769AA] text-white text-sm font-bold transition-colors disabled:opacity-60 cursor-pointer"
          >
            {loading ? 'جاري التحقق...' : 'تسجيل الدخول'}
          </button>
        </form>

        <div className="mt-6 pt-4 border-t border-slate-100">
          <p className="text-xs font-bold text-slate-700 mb-2.5">حسابات الأدوار المعتمدة للتجربة السريعة (مصادقة فعلية):</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {demoAccounts.map((acc) => (
              <button
                key={acc.id}
                type="button"
                disabled={loading}
                onClick={() => handleQuickLogin(acc.email)}
                className={`text-start p-2.5 rounded-xl border transition-all cursor-pointer ${
                  currentUser?.id === acc.id
                    ? 'border-[#069B74] bg-emerald-50/50'
                    : 'border-slate-200 hover:border-[#1769AA] hover:bg-[#F4F7FB]'
                }`}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="text-xs font-bold text-[#0B2341] truncate">{acc.fullName}</span>
                  <span className="text-[11px] font-semibold text-[#1769AA] shrink-0">
                    {ROLE_LABELS_AR[acc.role]}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 truncate mt-0.5">{acc.jobTitle}</p>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
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

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full p-6">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <h3 className="text-base font-bold text-[#0B2341]">إنشاء تقرير شهري مستقل جديد</h3>
          <button type="button" onClick={onClose} className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {errorMsg && (
            <div className="p-2.5 rounded-lg bg-red-50 border border-red-200 text-xs font-semibold text-[#C43D47]">
              {errorMsg}
            </div>
          )}
          <div className="p-3 rounded-xl bg-[#EAF4FC] text-xs text-[#0B2341] leading-relaxed">
            يُنشأ التقرير ببيانات صفرية مستقلة للشهر المحدد دون نسخ إنجازات الأشهر السابقة تلقائياً، وبترقيم فريد.
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">السنة</label>
              <NumericInput
                min={2024}
                max={2050}
                value={year}
                onChangeValue={setYear}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm tabular-nums focus:border-[#1769AA] focus:outline-none"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">الشهر</label>
              <select
                value={month}
                onChange={(e) => setMonth(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:border-[#1769AA] focus:outline-none"
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
            <label className="block text-xs font-semibold text-slate-700 mb-1">الإدارة</label>
            <input
              type="text"
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:border-[#1769AA] focus:outline-none"
              required
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 cursor-pointer"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 rounded-lg bg-[#0B2341] hover:bg-[#1769AA] text-white text-xs font-bold disabled:opacity-60 cursor-pointer"
            >
              {saving ? 'جاري الإنشاء...' : 'إنشاء المسودة'}
            </button>
          </div>
        </form>
      </div>
    </div>
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

  const meta: Record<string, { title: string; desc: string; requireComment: boolean; btnLabel: string; tone: string }> = {
    submit_review: {
      title: 'تأكيد إرسال التقرير للمراجعة',
      desc: `سيتم توثيق توقيع الإعداد الإلكتروني وإرسال التقرير (${reportNumber}) إلى مرحلة المراجعة.`,
      requireComment: false,
      btnLabel: 'إرسال للمراجعة',
      tone: 'bg-[#1769AA] hover:bg-[#0B2341] text-white',
    },
    start_review: {
      title: 'بدء المراجعة الرسمية',
      desc: `تحويل حالة التقرير (${reportNumber}) إلى «قيد المراجعة» وتسجيل المراجع في سجل التدقيق.`,
      requireComment: false,
      btnLabel: 'بدء المراجعة',
      tone: 'bg-[#1769AA] hover:bg-[#0B2341] text-white',
    },
    forward_approval: {
      title: 'اكتمال المراجعة والرفع للاعتماد',
      desc: `تأكيد مراجعة كافة البنود ورفع التقرير (${reportNumber}) لصاحب صلاحية الاعتماد النهائي.`,
      requireComment: false,
      btnLabel: 'رفع للاعتماد',
      tone: 'bg-[#069B74] hover:bg-[#058261] text-white',
    },
    return_revision: {
      title: 'إرجاع التقرير للتعديل',
      desc: `سيتم إعادة التقرير (${reportNumber}) إلى حالة «مسودة» مع إلزامية توثيق سبب الإرجاع في سجل التدقيق.`,
      requireComment: true,
      btnLabel: 'تأكيد الإرجاع',
      tone: 'bg-[#C43D47] hover:bg-[#a9323b] text-white',
    },
    approve: {
      title: 'الاعتماد الرسمي والتوقيع الإلكتروني',
      desc: `سيتم اعتماد التقرير (${reportNumber}) وتوليد نسخة رسمية ثابتة محمية من التعديل بتوقيع إلكتروني موثق.`,
      requireComment: false,
      btnLabel: 'اعتماد التقرير نهائياً',
      tone: 'bg-[#069B74] hover:bg-[#058261] text-white',
    },
    archive: {
      title: 'نقل التقرير إلى الأرشيف الرسمي',
      desc: `تأكيد أرشفة التقرير المعتمد (${reportNumber}) وحفظه في سجل التقارير المعتمدة الدائم.`,
      requireComment: false,
      btnLabel: 'أرشفة التقرير',
      tone: 'bg-[#0B2341] hover:bg-[#1769AA] text-white',
    },
    create_revision: {
      title: 'إنشاء إصدار جديد للتصحيح',
      desc: `النسخة المعتمدة محمية من التعديل المباشر. سيتم فتح إصدار جديد يخضع لدورة اعتماد مستقلة مع حفظ النسخة السابقة.`,
      requireComment: true,
      btnLabel: 'فتح إصدار جديد',
      tone: 'bg-[#C8A85D] hover:bg-[#b59449] text-[#0B2341]',
    },
  };

  const info = meta[action];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full p-6">
        <div className="flex items-start justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <UserCheck className="w-5 h-5 text-[#1769AA]" />
            <h3 className="text-base font-bold text-[#0B2341]">{info.title}</h3>
          </div>
          <button type="button" onClick={onClose} className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {errorMsg && (
            <div className="p-2.5 rounded-lg bg-red-50 border border-red-200 text-xs font-semibold text-[#C43D47]">
              {errorMsg}
            </div>
          )}
          <p className="text-sm text-slate-600 leading-relaxed">{info.desc}</p>

          {user && (
            <div className="p-3 rounded-xl bg-[#F4F7FB] border border-slate-200 text-xs space-y-1">
              <div>
                <span className="text-slate-500">المسؤول الموثق: </span>
                <span className="font-bold text-[#0B2341]">{user.fullName}</span>
              </div>
              <div>
                <span className="text-slate-500">الدور والصلاحية: </span>
                <span className="font-semibold text-[#1769AA]">{ROLE_LABELS_AR[user.role]}</span>
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              {info.requireComment ? 'السبب / الملاحظات (إلزامي)' : 'ملاحظات الاعتماد / المراجعة (اختياري)'}
            </label>
            <textarea
              rows={3}
              required={info.requireComment}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder={info.requireComment ? 'يرجى كتابة سبب الإرجاع أو التصحيح بوضوح...' : 'أضف ملاحظة توثيقية إن وجدت...'}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:border-[#1769AA] focus:outline-none"
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 cursor-pointer"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={submitting}
              className={`px-5 py-2 rounded-lg text-xs font-bold disabled:opacity-60 cursor-pointer ${info.tone}`}
            >
              {submitting ? 'جاري التنفيذ...' : info.btnLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
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

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-2xl w-full p-6 my-8">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-[#1769AA]" />
            <h3 className="text-base font-bold text-[#0B2341]">إدارة المقرات وفئات الصيانة</h3>
          </div>
          <button type="button" onClick={onClose} className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Sites */}
          <div>
            <h4 className="text-sm font-bold text-[#0B2341] mb-2.5">
              المقرات المسجلة (<span dir="ltr" className="tabular-nums">{formatNumber(sites.length)}</span>)
            </h4>
            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {sites.map((s) => (
                <div key={s.id} className="flex items-center justify-between gap-2 p-2.5 rounded-lg border border-slate-200 bg-[#F4F7FB]">
                  {editingId === s.id ? (
                    <div className="flex items-center gap-1.5 flex-1">
                      <input
                        type="text"
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        className="flex-1 px-2 py-1 text-xs rounded border border-[#1769AA] bg-white"
                      />
                      <button
                        type="button"
                        onClick={async () => {
                          if (editingName.trim()) {
                            await onUpdateSite(s.id, { nameAr: editingName.trim() });
                          }
                          setEditingId(null);
                        }}
                        className="px-2 py-1 rounded bg-[#069B74] text-white text-[11px] font-bold cursor-pointer"
                      >
                        حفظ
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="min-w-0">
                        <p className={`text-xs font-bold truncate ${s.isActive ? 'text-[#0B2341]' : 'text-slate-400 line-through'}`}>
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
                          className="px-2 py-1 rounded border border-slate-200 bg-white text-[11px] font-semibold text-slate-600 hover:text-[#1769AA] cursor-pointer"
                        >
                          تعديل
                        </button>
                        <button
                          type="button"
                          onClick={() => onUpdateSite(s.id, { isActive: !s.isActive })}
                          className={`px-2 py-1 rounded text-[11px] font-semibold cursor-pointer ${
                            s.isActive ? 'bg-emerald-50 text-[#069B74]' : 'bg-slate-200 text-slate-600'
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
                className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg bg-[#0B2341] hover:bg-[#1769AA] text-white text-xs font-bold cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>إضافة مقر جديد</span>
              </button>
            </form>
          </div>

          {/* Categories */}
          <div>
            <h4 className="text-sm font-bold text-[#0B2341] mb-2.5">
              فئات الصيانة (<span dir="ltr" className="tabular-nums">{formatNumber(categories.length)}</span>)
            </h4>
            <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
              {categories.map((c) => (
                <div key={c.id} className="flex items-center justify-between p-2 rounded-lg border border-slate-200 bg-white text-xs">
                  <span className="font-semibold text-[#0B2341]">{c.nameAr}</span>
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
                className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg bg-[#1769AA] hover:bg-[#0B2341] text-white text-xs font-bold cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>إضافة فئة صيانة</span>
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
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

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-3xl w-full p-6 my-8">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-[#0B2341]" />
            <h3 className="text-base font-bold text-[#0B2341]">إعدادات مدير النظام ومعايير الأداء</h3>
          </div>
          <button type="button" onClick={onClose} className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="mt-5 space-y-6">
          {/* Configurable KPI Thresholds */}
          <div className="p-4 rounded-xl bg-[#F4F7FB] border border-slate-200">
            <h4 className="text-sm font-bold text-[#0B2341] mb-3">حدود تصنيف مستويات الأداء القابلة للإعداد (%)</h4>
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
                className="px-4 py-1.5 rounded-lg bg-[#0B2341] hover:bg-[#1769AA] text-white text-xs font-bold cursor-pointer"
              >
                حفظ حدود التقييم
              </button>
            </div>
          </div>

          {/* Users & RBAC Management */}
          <div>
            <div className="flex items-center gap-2 mb-2.5">
              <Shield className="w-4 h-4 text-[#1769AA]" />
              <h4 className="text-sm font-bold text-[#0B2341]">المستخدمون والصلاحيات</h4>
            </div>
            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-xs">
                <thead className="bg-[#0B2341] text-white">
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
                      <td className="py-2 px-3 font-semibold text-[#0B2341]">
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
                              onNotify({ type: 'error', title: 'فشل التحديث', message: err instanceof Error ? err.message : '' });
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
                              await api.updateAdminUser(u.id, { isActive: !u.isActive });
                              setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, isActive: !u.isActive } : x)));
                            } catch {}
                          }}
                          className={`px-2.5 py-1 rounded text-[11px] font-semibold cursor-pointer ${
                            u.isActive ? 'bg-emerald-50 text-[#069B74]' : 'bg-red-50 text-[#C43D47]'
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
                  onNotify({ type: 'error', title: 'تعذر الإضافة', message: err instanceof Error ? err.message : '' });
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
                  className="px-3 py-1.5 rounded-lg bg-[#0B2341] text-white text-xs font-bold shrink-0 cursor-pointer"
                >
                  إضافة
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

export const AuditHistoryModal: React.FC<{
  open: boolean;
  onClose: () => void;
  approvals: ApprovalRecord[];
  auditLogs: AuditLogEntry[];
  versions: ReportVersionSummary[];
  onLoadVersion?: (versionNumber: number) => void;
}> = ({ open, onClose, approvals, auditLogs, versions, onLoadVersion }) => {
  const [subTab, setSubTab] = useState<'approvals' | 'audit' | 'versions'>('approvals');
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-4xl w-full p-6 my-8">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-[#1769AA]" />
            <h3 className="text-base font-bold text-[#0B2341]">سجل الاعتمادات والتدقيق والإصدارات</h3>
          </div>
          <button type="button" onClick={onClose} className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex items-center gap-2 mt-4 bg-[#F4F7FB] p-1 rounded-lg w-fit">
          <button
            type="button"
            onClick={() => setSubTab('approvals')}
            className={`px-3 py-1.5 rounded-md text-xs font-bold cursor-pointer ${
              subTab === 'approvals' ? 'bg-[#0B2341] text-white' : 'text-slate-600'
            }`}
          >
            سجل الاعتماد (<span dir="ltr" className="tabular-nums">{formatNumber(approvals.length)}</span>)
          </button>
          <button
            type="button"
            onClick={() => setSubTab('audit')}
            className={`px-3 py-1.5 rounded-md text-xs font-bold cursor-pointer ${
              subTab === 'audit' ? 'bg-[#0B2341] text-white' : 'text-slate-600'
            }`}
          >
            سجل التدقيق (<span dir="ltr" className="tabular-nums">{formatNumber(auditLogs.length)}</span>)
          </button>
          <button
            type="button"
            onClick={() => setSubTab('versions')}
            className={`px-3 py-1.5 rounded-md text-xs font-bold cursor-pointer ${
              subTab === 'versions' ? 'bg-[#0B2341] text-white' : 'text-slate-600'
            }`}
          >
            الإصدارات المعتمدة (<span dir="ltr" className="tabular-nums">{formatNumber(versions.length)}</span>)
          </button>
        </div>

        <div className="mt-4 max-h-[60vh] overflow-y-auto">
          {subTab === 'approvals' && (
            <div className="space-y-2.5">
              {approvals.length === 0 ? (
                <p className="text-sm text-slate-500 py-8 text-center">لا توجد حركات اعتماد مسجلة بعد.</p>
              ) : (
                approvals.map((a) => (
                  <div key={a.id} className="p-3.5 rounded-xl border border-slate-200 bg-[#F4F7FB] text-xs space-y-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-bold text-[#0B2341]">
                        {a.actorName} ({ROLE_LABELS_AR[a.actorRole as UserRole] || a.actorRole})
                      </span>
                      <span className="font-mono text-slate-500 tabular-nums" dir="ltr">
                        {formatDateTimeWestern(a.createdAt)}
                      </span>
                    </div>
                    <div className="text-slate-700">
                      انتقال الحالة: <span className="font-semibold">{STATUS_LABELS_AR[a.fromStatus as keyof typeof STATUS_LABELS_AR] || a.fromStatus}</span> ←{' '}
                      <span className="font-bold text-[#069B74]">{STATUS_LABELS_AR[a.toStatus as keyof typeof STATUS_LABELS_AR] || a.toStatus}</span>
                      {' · '}إصدار <span className="font-mono tabular-nums" dir="ltr">v{a.versionNumber}</span>
                    </div>
                    {a.comment && <p className="text-slate-600 bg-white p-2 rounded-lg border border-slate-100 mt-1">{a.comment}</p>}
                    <p className="text-[11px] font-mono text-[#1769AA] tabular-nums" dir="ltr">التوقيع الإلكتروني الموثق: {a.signatureToken}</p>
                  </div>
                ))
              )}
            </div>
          )}

          {subTab === 'audit' && (
            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-xs">
                <thead className="bg-[#0B2341] text-white">
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
                      <td className="py-2 px-3 font-semibold text-[#0B2341]">
                        {l.userName}
                        <span className="block text-[10px] text-slate-400">
                          {ROLE_LABELS_AR[l.userRole as UserRole] || l.userRole}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-slate-700">{l.action}</td>
                      <td className="py-2 px-3 text-slate-600">{l.reason || `${l.previousValue} → ${l.newValue}`}</td>
                      <td className="py-2 px-3 text-center font-mono tabular-nums" dir="ltr">v{l.versionNumber}</td>
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
                  <div key={v.id} className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl border border-slate-200 bg-white">
                    <div>
                      <p className="text-sm font-bold text-[#0B2341]">
                        الإصدار المعتمد <span className="font-mono text-[#069B74] tabular-nums" dir="ltr">v{v.versionNumber}</span>
                      </p>
                      <p className="text-xs text-slate-600 mt-0.5">
                        اعتماد: {v.approvedByName} · التوقيع: <span className="font-mono text-[#1769AA]" dir="ltr">{v.signatureToken}</span>
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
                          className="px-3 py-1.5 rounded-lg bg-[#EAF4FC] hover:bg-[#1769AA] hover:text-white text-[#1769AA] text-xs font-bold transition-colors cursor-pointer"
                        >
                          معاينة النسخة المعتمدة
                        </button>
                      )}
                      <a
                        href={`/api/reports/${encodeURIComponent(v.reportId)}/export/excel?version=${v.versionNumber}`}
                        className="px-3 py-1.5 rounded-lg bg-[#069B74] hover:bg-[#058261] text-white text-xs font-bold"
                      >
                        تصدير Excel (<span dir="ltr">v{v.versionNumber}</span>)
                      </a>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
