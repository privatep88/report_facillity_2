import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpLeft,
  Calendar,
  CheckCircle2,
  FileCheck2,
  Info,
  Loader2,
  Lock,
  PenTool,
  Save,
  ShieldCheck,
  Trash2,
  UserCheck,
  X,
  XCircle,
} from 'lucide-react';
import { STATUS_LABELS_AR } from '../types/report.ts';
import { formatDateTimeWestern, formatNumber, getMonthNameAr, getMonthNameEn } from '../utils/calculations.ts';
import { groupValidationIssuesBySection } from '../services/ReportValidationService.ts';
import engineerInspectorImg from '../assets/images/engineer_tablet_inspector_1794730112530.jpg';
import type { ActiveModalState } from './NotificationService.ts';
import { getNotificationVisualAsset, OFFICIAL_SAAED_LOGO } from './notificationAssets.ts';
import type { NotificationContextKey } from './types.ts';

/* Reusable Corporate Modal Frame matching SAAED Premium Enterprise Notification Design System */
export const SaaedModalFrame: React.FC<{
  open: boolean;
  onClose: () => void;
  titleAr: string;
  titleEn?: string;
  subtitleAr?: string;
  context?: NotificationContextKey;
  accentColor?: 'navy' | 'gold' | 'green' | 'amber' | 'red';
  size?: 'sm' | 'md' | 'lg' | 'xl';
  disableBackdropClose?: boolean;
  showVisualBanner?: boolean;
  icon?: React.ReactNode;
  children: React.ReactNode;
}> = ({
  open,
  onClose,
  titleAr,
  titleEn,
  subtitleAr,
  context = 'approval',
  accentColor = 'navy',
  size = 'md',
  disableBackdropClose = false,
  showVisualBanner = true,
  icon,
  children,
}) => {
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !disableBackdropClose) {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, disableBackdropClose, onClose]);

  if (!open) return null;

  const asset = getNotificationVisualAsset(context);
  const maxWidthCls =
    size === 'sm'
      ? 'max-w-md'
      : size === 'lg'
        ? 'max-w-2xl'
        : size === 'xl'
          ? 'max-w-4xl'
          : 'max-w-lg';

  const topAccentCls =
    accentColor === 'green'
      ? 'border-b-[#07976E]'
      : accentColor === 'red'
        ? 'border-b-[#C94444]'
        : accentColor === 'amber'
          ? 'border-b-[#D99A22]'
          : 'border-b-[#D5AD5D]';

  return (
    <div
      dir="rtl"
      className="no-print fixed inset-0 z-[100] flex items-center justify-center bg-[#041226]/70 backdrop-blur-[2px] p-3 sm:p-5 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label={titleAr}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !disableBackdropClose) {
          onClose();
        }
      }}
    >
      <div
        className={`saaed-modal-enter relative w-full ${maxWidthCls} max-h-[92vh] flex flex-col rounded-2xl bg-white border border-[#D5AD5D]/60 shadow-[0_24px_60px_rgba(4,18,38,0.42)] overflow-hidden`}
      >
        {/* Top Corporate Navy Header + Optional Contextual Visual Backdrop */}
        <div
          className={`relative bg-gradient-to-l from-[#082D56] via-[#0c3d72] to-[#10518C] text-white border-b-2 ${topAccentCls} shrink-0 overflow-hidden`}
        >
          {/* Decorative Gold Geometric Diagonal Accents */}
          <div
            aria-hidden="true"
            className="hidden sm:block absolute left-4 top-0 bottom-0 w-3 bg-gradient-to-b from-[#E5C878] via-[#D5AD5D] to-[#A87E2B] -skew-x-[28deg] opacity-90 pointer-events-none"
          />
          <div
            aria-hidden="true"
            className="hidden sm:block absolute left-9 top-0 bottom-0 w-1.5 bg-gradient-to-b from-[#E5C878]/80 to-[#D5AD5D]/70 -skew-x-[28deg] pointer-events-none"
          />

          {showVisualBanner && (
            <div className="relative h-24 sm:h-28 overflow-hidden border-b border-white/15">
              <img
                src={asset.src}
                alt={asset.alt}
                referrerPolicy="no-referrer"
                style={{ objectPosition: asset.objectPosition || 'center center' }}
                className="w-full h-full object-cover"
              />
              <div
                aria-hidden="true"
                className="absolute inset-0 bg-gradient-to-t from-[#082D56] via-[#082D56]/55 to-[#082D56]/20"
              />

              {/* Official Untouched SAAED Logo Badge on Visual Banner when requested */}
              {asset.showSaaedLogo && (
                <div className="absolute top-2.5 right-3 bg-white/95 rounded-lg px-2 py-1 shadow-sm border border-[#D5AD5D]/70">
                  <img
                    src={OFFICIAL_SAAED_LOGO}
                    alt="شعار شركة ساعد الرسمي"
                    className="h-6 w-auto object-contain"
                  />
                </div>
              )}

              <div className="absolute bottom-2 right-3 left-14 flex flex-wrap items-center justify-between gap-2">
                <span className="text-[11px] font-bold text-[#E5C878] tracking-wide">
                  {asset.badgeText}
                </span>
                <span className="text-[10px] font-semibold text-slate-200/90" dir="ltr">
                  {asset.badgeTextEn}
                </span>
              </div>
            </div>
          )}

          <div className="relative z-10 px-4 sm:px-5 py-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              {icon && (
                <div className="w-8 h-8 rounded-lg bg-white/10 border border-[#D5AD5D]/50 flex items-center justify-center text-[#D5AD5D] shrink-0">
                  {icon}
                </div>
              )}
              <div className="min-w-0">
                <h3 className="text-sm sm:text-base font-extrabold text-white leading-snug truncate">
                  {titleAr}
                </h3>
                {(titleEn || subtitleAr) && (
                  <p className="text-[11px] text-[#CBE0F8] truncate">
                    {subtitleAr || titleEn}
                  </p>
                )}
              </div>
            </div>

            <button
              type="button"
              disabled={disableBackdropClose}
              onClick={onClose}
              aria-label="إغلاق النافذة"
              className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors disabled:opacity-40 cursor-pointer shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Scrollable Content Body */}
        <div className="flex-1 overflow-y-auto fm-scroll p-4 sm:p-5 bg-white text-[#142D4C]">
          {children}
        </div>
      </div>
    </div>
  );
};

/* ========================================================================= */
/* 1. ConfirmationDialog                                                     */
/* ========================================================================= */
const ConfirmationDialogModal: React.FC<{
  modal: Extract<ActiveModalState, { kind: 'confirm' }>;
}> = ({ modal }) => {
  const { options, resolve } = modal;
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const tone = options.tone || 'primary';
  const context: NotificationContextKey =
    options.context || (tone === 'danger' ? 'delete' : 'approval');

  const btnCls =
    tone === 'danger'
      ? 'bg-[#C94444] hover:bg-[#ad3636] text-white'
      : tone === 'success'
        ? 'bg-[#07976E] hover:bg-[#067e5b] text-white'
        : tone === 'warning'
          ? 'bg-[#D99A22] hover:bg-[#b88119] text-[#082D56]'
          : 'bg-[#082D56] hover:bg-[#10518C] text-white';

  const handleConfirm = async () => {
    if (submitting) return;
    if (options.onConfirmAsync) {
      setSubmitting(true);
      setErrorMsg(null);
      try {
        await options.onConfirmAsync();
        resolve(true);
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : 'تعذر تنفيذ الإجراء المطلوب');
      } finally {
        setSubmitting(false);
      }
      return;
    }
    resolve(true);
  };

  return (
    <SaaedModalFrame
      open
      onClose={() => {
        if (!submitting) resolve(false);
      }}
      disableBackdropClose={submitting}
      titleAr={options.title}
      titleEn={options.titleEn}
      context={context}
      accentColor={tone === 'danger' ? 'red' : tone === 'warning' ? 'amber' : tone === 'success' ? 'green' : 'gold'}
      icon={
        tone === 'danger' ? (
          <Trash2 className="w-4 h-4 text-[#ff9d9d]" />
        ) : (
          <AlertTriangle className="w-4 h-4 text-[#D5AD5D]" />
        )
      }
      size="md"
    >
      <div className="space-y-4">
        {errorMsg && (
          <div className="p-3 rounded-xl bg-red-50 border border-[#C94444]/35 text-xs font-bold text-[#C94444]">
            {errorMsg}
          </div>
        )}

        <p className="text-sm text-[#142D4C] leading-relaxed font-semibold">{options.message}</p>

        {options.targetLabel && (
          <div className="p-3 rounded-xl bg-[#EFF6FC] border border-[#10518C]/20 flex items-center justify-between gap-2 text-xs">
            <span className="text-slate-600 font-semibold">العنصر المستهدف:</span>
            <span className="font-extrabold text-[#082D56] truncate">{options.targetLabel}</span>
          </div>
        )}

        {options.details && options.details.length > 0 && (
          <ul className="space-y-1.5 text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-xl p-3">
            {options.details.map((d, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="text-[#D5AD5D] font-bold">•</span>
                <span>{d}</span>
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-wrap items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
          <button
            type="button"
            disabled={submitting}
            onClick={() => resolve(false)}
            className="px-4 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-xs font-bold text-slate-700 disabled:opacity-50 cursor-pointer"
          >
            {options.cancelLabel || 'إلغاء'}
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={handleConfirm}
            className={`inline-flex items-center gap-1.5 px-5 py-2 rounded-xl text-xs font-extrabold shadow-xs disabled:opacity-60 cursor-pointer ${btnCls}`}
          >
            {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            <span>{submitting ? 'جاري التنفيذ...' : options.confirmLabel || 'تأكيد'}</span>
          </button>
        </div>
      </div>
    </SaaedModalFrame>
  );
};

/* ========================================================================= */
/* 2. Executive ApprovalDialog                                               */
/* ========================================================================= */
const ExecutiveApprovalDialogModal: React.FC<{
  modal: Extract<ActiveModalState, { kind: 'approval' }>;
}> = ({ modal }) => {
  const { payload, resolve } = modal;
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const blockers = payload.checklist.filter((item) => !item.passed);
  const hasBlockers = blockers.length > 0 || !payload.hasApproverPermission;
  const expectedApprovalTime = formatDateTimeWestern(new Date().toISOString());

  const handleConfirmApprove = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting || hasBlockers) return;
    setSubmitting(true);
    setErrorMsg(null);
    try {
      await payload.onApprove(comment);
      resolve(true);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'تعذر اعتماد التقرير رسمياً');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SaaedModalFrame
      open
      onClose={() => {
        if (!submitting) resolve(false);
      }}
      disableBackdropClose={submitting}
      titleAr="تأكيد اعتماد التقرير الشهري"
      titleEn="Confirm Monthly Report Approval"
      subtitleAr={`${getMonthNameAr(payload.month)} ${payload.year} · ${getMonthNameEn(payload.month)} ${payload.year}`}
      context="approval"
      accentColor="green"
      size="lg"
      icon={<ShieldCheck className="w-4 h-4 text-[#D5AD5D]" />}
    >
      <form onSubmit={handleConfirmApprove} className="space-y-4">
        {errorMsg && (
          <div className="p-3 rounded-xl bg-red-50 border border-[#C94444]/40 text-xs font-bold text-[#C94444] flex items-start gap-2">
            <XCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Structured Official Report Summary Card */}
        <div className="rounded-xl border border-[#A3C0DE] bg-[#EFF6FC]/65 p-3.5 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-[#A3C0DE]/50">
            <div className="flex items-center gap-2 text-xs font-extrabold text-[#082D56]">
              <FileCheck2 className="w-4 h-4 text-[#10518C]" />
              <span>ملخص وثيقة الاعتماد التنفيذي</span>
            </div>
            <span className="text-[11px] font-bold text-[#082D56] bg-white px-2.5 py-0.5 rounded-md border border-[#D5AD5D]/60">
              {STATUS_LABELS_AR[payload.status]}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 text-xs">
            <div className="bg-white rounded-lg border border-slate-200/80 p-2.5">
              <span className="block text-[10.5px] text-slate-500 font-semibold">رقم التقرير والإصدار</span>
              <span className="font-mono font-extrabold text-[#082D56] tabular-nums" dir="ltr">
                {payload.reportNumber} · v{payload.currentVersion}
              </span>
            </div>

            <div className="bg-white rounded-lg border border-slate-200/80 p-2.5">
              <span className="block text-[10.5px] text-slate-500 font-semibold">الفترة (الشهر / السنة)</span>
              <span className="font-extrabold text-[#082D56]">
                {getMonthNameAr(payload.month)}{' '}
                <span className="tabular-nums font-mono" dir="ltr">
                  {payload.year}
                </span>
              </span>
            </div>

            <div className="bg-white rounded-lg border border-slate-200/80 p-2.5">
              <span className="block text-[10.5px] text-slate-500 font-semibold">اسم المعد</span>
              <span className="font-extrabold text-[#082D56] truncate block">
                {payload.preparerName || 'غير محدد'}
              </span>
            </div>

            <div className="bg-white rounded-lg border border-slate-200/80 p-2.5">
              <span className="block text-[10.5px] text-slate-500 font-semibold">اسم المراجع</span>
              <span className="font-bold text-[#10518C] truncate block">
                {payload.reviewerName || '—'}
              </span>
            </div>

            <div className="bg-white rounded-lg border border-[#D5AD5D]/70 p-2.5">
              <span className="block text-[10.5px] text-slate-500 font-semibold">اسم المعتمد (من البطاقة)</span>
              <span className="font-extrabold text-[#07976E] truncate block">
                {payload.approverName || 'سيتم التوثيق باسم المعتمد'}
              </span>
              {payload.approverTitle && (
                <span className="block text-[10px] text-slate-500 truncate">{payload.approverTitle}</span>
              )}
            </div>

            <div className="bg-white rounded-lg border border-slate-200/80 p-2.5">
              <span className="block text-[10.5px] text-slate-500 font-semibold">تاريخ الاعتماد المتوقع</span>
              <span className="font-mono font-bold text-[#082D56] tabular-nums flex items-center gap-1" dir="ltr">
                <Calendar className="w-3 h-3 text-[#D5AD5D]" />
                {expectedApprovalTime}
              </span>
            </div>
          </div>
        </div>

        {/* Dual Electronic Signature Verification Preview */}
        {(payload.preparerSignatureImage || payload.approverSignatureImage) && (
          <div className="rounded-xl border border-[#A3C0DE]/70 bg-white p-3 space-y-2">
            <div className="flex items-center justify-between text-xs font-extrabold text-[#082D56]">
              <span className="flex items-center gap-1.5">
                <PenTool className="w-3.5 h-3.5 text-[#D5AD5D]" />
                <span>التوقيعات الإلكترونية الموثقة للطرفين</span>
              </span>
              <span className="text-[11px] font-bold text-[#07976E]">توقيعان معتمدان</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div className="rounded-lg border border-slate-200 bg-[#F8FAFC] p-2.5 space-y-1.5">
                <div className="flex items-center justify-between gap-2 text-[11px]">
                  <span className="font-bold text-[#082D56]">توقيع معد التقرير</span>
                  <span className="font-bold text-[#07976E]">مكتمل</span>
                </div>
                <div className="h-14 rounded-md bg-white border border-slate-200 flex items-center justify-center p-1">
                  {payload.preparerSignatureImage && (
                    <img
                      src={payload.preparerSignatureImage}
                      alt={`توقيع ${payload.preparerName || 'معد التقرير'}`}
                      className="max-h-12 max-w-full object-contain"
                    />
                  )}
                </div>
                {payload.preparerSignedAt && (
                  <p className="text-[10px] text-slate-500 font-mono tabular-nums" dir="ltr">
                    {formatDateTimeWestern(payload.preparerSignedAt)}
                  </p>
                )}
              </div>

              <div className="rounded-lg border border-slate-200 bg-[#F8FAFC] p-2.5 space-y-1.5">
                <div className="flex items-center justify-between gap-2 text-[11px]">
                  <span className="font-bold text-[#082D56]">توقيع معتمد التقرير</span>
                  <span className="font-bold text-[#07976E]">مكتمل</span>
                </div>
                <div className="h-14 rounded-md bg-white border border-slate-200 flex items-center justify-center p-1">
                  {payload.approverSignatureImage && (
                    <img
                      src={payload.approverSignatureImage}
                      alt={`توقيع ${payload.approverName || 'المعتمد'}`}
                      className="max-h-12 max-w-full object-contain"
                    />
                  )}
                </div>
                {payload.approverSignedAt && (
                  <p className="text-[10px] text-slate-500 font-mono tabular-nums" dir="ltr">
                    {formatDateTimeWestern(payload.approverSignedAt)}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Pre-Approval Verification Checks */}
        <div className="rounded-xl border border-slate-200 p-3 space-y-2">
          <div className="flex items-center justify-between text-xs font-extrabold text-[#082D56]">
            <span>التحقق من الجاهزية والصلاحيات قبل الاعتماد</span>
            {!hasBlockers ? (
              <span className="text-[11px] font-bold text-[#07976E]">مستوفي الشروط</span>
            ) : (
              <span className="text-[11px] font-bold text-[#C94444]">يتطلب استكمال</span>
            )}
          </div>

          <div className="space-y-1.5">
            {!payload.hasApproverPermission && (
              <div className="flex items-center justify-between gap-2 p-2 rounded-lg bg-red-50 border border-[#C94444]/30 text-xs text-[#C94444]">
                <div className="flex items-center gap-2 font-bold">
                  <Lock className="w-4 h-4 shrink-0" />
                  <span>الحساب الحالي لا يملك صلاحية الاعتماد النهائي (مطلوب دور: معتمد أو مدير نظام).</span>
                </div>
                {payload.onOpenAuthModal && (
                  <button
                    type="button"
                    onClick={() => {
                      resolve(false);
                      payload.onOpenAuthModal?.();
                    }}
                    className="px-2.5 py-1 rounded-md bg-[#082D56] text-white text-[11px] font-bold shrink-0 cursor-pointer"
                  >
                    تبديل الحساب
                  </button>
                )}
              </div>
            )}

            {payload.checklist.map((item, idx) => (
              <div
                key={idx}
                className={`flex items-center justify-between gap-2 p-2 rounded-lg text-xs border ${
                  item.passed
                    ? 'bg-emerald-50/60 border-emerald-200/70 text-[#082D56]'
                    : 'bg-amber-50 border-[#D99A22]/40 text-[#92620f]'
                }`}
              >
                <div className="flex items-start gap-2 min-w-0">
                  {item.passed ? (
                    <CheckCircle2 className="w-4 h-4 text-[#07976E] shrink-0 mt-0.5" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-[#D99A22] shrink-0 mt-0.5" />
                  )}
                  <div className="min-w-0">
                    <span className="font-bold block">{item.label}</span>
                    {item.detail && <span className="text-[11px] opacity-85 block">{item.detail}</span>}
                  </div>
                </div>
                {!item.passed && item.sectionId && payload.onJumpToSection && (
                  <button
                    type="button"
                    onClick={() => {
                      resolve(false);
                      payload.onJumpToSection?.(item.sectionId!);
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-white border border-[#D99A22]/50 text-[#082D56] text-[11px] font-bold shrink-0 hover:bg-amber-100 cursor-pointer"
                  >
                    <ArrowUpLeft className="w-3 h-3" />
                    <span>الانتقال</span>
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Optional Attestation Comment */}
        <div>
          <label className="block text-xs font-bold text-[#082D56] mb-1">
            ملاحظة التوثيق التنفيذي (اختياري)
          </label>
          <textarea
            rows={2}
            disabled={submitting}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="تضاف هذه الملاحظة في سجل الاعتمادات والتدقيق الرسمي..."
            className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:border-[#10518C] focus:outline-none disabled:bg-slate-50"
          />
        </div>

        <p className="text-[11px] text-slate-500 leading-relaxed">
          سيتم تثبيت هذه النسخة رسمياً في قاعدة البيانات وحفظ لقطة معتمدة غير قابلة للتعديل المباشر في تبويب «التقارير المعتمدة».
        </p>

        <div className="flex flex-wrap items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
          <button
            type="button"
            disabled={submitting}
            onClick={() => resolve(false)}
            className="px-4 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-xs font-bold text-slate-700 disabled:opacity-50 cursor-pointer"
          >
            إلغاء
          </button>
          <button
            type="submit"
            disabled={submitting || hasBlockers}
            className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-[#07976E] hover:bg-[#05805d] text-white text-xs font-extrabold shadow-sm disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {submitting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <UserCheck className="w-4 h-4 text-[#E5C878]" />
            )}
            <span>{submitting ? 'جاري اعتماد التقرير وتوثيقه...' : 'تأكيد الاعتماد النهائي'}</span>
          </button>
        </div>
      </form>
    </SaaedModalFrame>
  );
};

/* ========================================================================= */
/* 3. UnsavedChangesDialog                                                   */
/* ========================================================================= */
const UnsavedChangesDialogModal: React.FC<{
  modal: Extract<ActiveModalState, { kind: 'unsaved' }>;
}> = ({ modal }) => {
  const { options, resolve } = modal;

  return (
    <SaaedModalFrame
      open
      onClose={() => resolve('stay')}
      titleAr="توجد تغييرات لم يتم حفظها"
      titleEn="Unsaved Changes Detected"
      subtitleAr={options.reportNumber ? `التقرير الحالي: ${options.reportNumber}` : undefined}
      context="unsaved"
      accentColor="amber"
      icon={<AlertTriangle className="w-4 h-4 text-[#D5AD5D]" />}
      size="md"
    >
      <div className="space-y-4">
        <p className="text-sm text-[#142D4C] leading-relaxed font-semibold">
          لديك تعديلات غير محفوظة في التقرير الحالي. اختر حفظ التعديلات قبل المتابعة أو تجاهلها أو البقاء في الصفحة لاستكمال التحرير.
        </p>

        {options.targetDescription && (
          <div className="p-2.5 rounded-xl bg-[#EFF6FC] border border-[#10518C]/20 text-xs text-[#082D56]">
            الإجراء المطلوب: <span className="font-extrabold">{options.targetDescription}</span>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-slate-100">
          <button
            type="button"
            onClick={() => resolve('stay')}
            className="px-4 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-xs font-bold text-[#082D56] cursor-pointer"
          >
            البقاء في الصفحة
          </button>
          <button
            type="button"
            onClick={() => resolve('discard')}
            className="px-4 py-2 rounded-xl border border-[#C94444]/40 bg-red-50 hover:bg-red-100 text-xs font-bold text-[#C94444] cursor-pointer"
          >
            متابعة دون حفظ
          </button>
          {options.canSave !== false && (
            <button
              type="button"
              onClick={() => resolve('save')}
              className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-[#082D56] hover:bg-[#10518C] text-white text-xs font-extrabold cursor-pointer"
            >
              <Save className="w-3.5 h-3.5 text-[#D5AD5D]" />
              <span>حفظ ومتابعة</span>
            </button>
          )}
        </div>
      </div>
    </SaaedModalFrame>
  );
};

/* ========================================================================= */
/* 4. SuccessDialog / ErrorDialog / WarningDialog / InformationDialog        */
/* ========================================================================= */
const AlertDialogModal: React.FC<{
  modal: Extract<ActiveModalState, { kind: 'alert' }>;
}> = ({ modal }) => {
  const { options, resolve } = modal;
  const [running, setRunning] = useState(false);

  const toneMeta = {
    success: {
      accent: 'green' as const,
      icon: <CheckCircle2 className="w-4 h-4 text-emerald-300" />,
      btnCls: 'bg-[#07976E] hover:bg-[#05805d] text-white',
    },
    error: {
      accent: 'red' as const,
      icon: <XCircle className="w-4 h-4 text-red-300" />,
      btnCls: 'bg-[#C94444] hover:bg-[#ad3636] text-white',
    },
    warning: {
      accent: 'amber' as const,
      icon: <AlertTriangle className="w-4 h-4 text-[#D5AD5D]" />,
      btnCls: 'bg-[#D99A22] hover:bg-[#b88119] text-[#082D56]',
    },
    info: {
      accent: 'gold' as const,
      icon: <Info className="w-4 h-4 text-[#D5AD5D]" />,
      btnCls: 'bg-[#082D56] hover:bg-[#10518C] text-white',
    },
  }[options.type];

  const handlePrimary = async () => {
    if (!options.onPrimaryAction || running) return;
    setRunning(true);
    try {
      await options.onPrimaryAction();
      resolve();
    } finally {
      setRunning(false);
    }
  };

  return (
    <SaaedModalFrame
      open
      onClose={resolve}
      disableBackdropClose={running}
      titleAr={options.title}
      titleEn={options.titleEn}
      context={
        options.context ||
        (options.type === 'error'
          ? 'network'
          : options.type === 'warning'
            ? 'validation'
            : 'saved')
      }
      accentColor={toneMeta.accent}
      icon={
        options.iconType === 'signature' ? (
          <PenTool className="w-4 h-4 text-[#D5AD5D]" />
        ) : (
          toneMeta.icon
        )
      }
      size="md"
    >
      <div className="space-y-4">
        <p className="text-sm text-[#142D4C] leading-relaxed font-semibold">{options.message}</p>

        {options.signatureChecklist && options.signatureChecklist.length > 0 && (
          <div className="rounded-xl border border-[#A3C0DE]/70 bg-[#EFF6FC]/55 p-3 space-y-2">
            <div className="text-xs font-extrabold text-[#082D56] flex items-center gap-1.5">
              <PenTool className="w-3.5 h-3.5 text-[#10518C]" />
              <span>حالة التوقيعات الإلكترونية الإلزامية</span>
            </div>
            <div className="space-y-1.5">
              {options.signatureChecklist.map((sigItem, idx) => (
                <div
                  key={idx}
                  className={`flex items-center justify-between gap-2 p-2.5 rounded-lg border text-xs ${
                    sigItem.passed
                      ? 'bg-white border-emerald-200 text-[#082D56]'
                      : 'bg-red-50/85 border-[#C94444]/35 text-[#8f2424]'
                  }`}
                >
                  <div className="flex items-start gap-2 min-w-0">
                    {sigItem.passed ? (
                      <CheckCircle2 className="w-4 h-4 text-[#07976E] shrink-0 mt-0.5" />
                    ) : (
                      <XCircle className="w-4 h-4 text-[#C94444] shrink-0 mt-0.5" />
                    )}
                    <div className="min-w-0">
                      <span className="font-bold block">{sigItem.label}</span>
                      {sigItem.reason && !sigItem.passed && (
                        <span className="text-[11px] opacity-90 block">{sigItem.reason}</span>
                      )}
                    </div>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded-md text-[11px] font-extrabold shrink-0 ${
                      sigItem.passed
                        ? 'bg-emerald-50 text-[#07976E] border border-emerald-200'
                        : 'bg-white text-[#C94444] border border-[#C94444]/30'
                    }`}
                  >
                    {sigItem.statusText}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {options.errorCode && (
          <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-xs flex items-center justify-between">
            <span className="text-slate-500 font-semibold">رمز المرجع</span>
            <span className="font-mono font-bold text-[#082D56] tabular-nums" dir="ltr">
              {options.errorCode}
            </span>
          </div>
        )}

        {options.details && (
          <div
            dir="ltr"
            className="p-3 rounded-xl bg-[#EFF6FC] border border-[#10518C]/20 text-xs font-mono text-[#142D4C] break-words"
          >
            {options.details}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-slate-100">
          <button
            type="button"
            disabled={running}
            onClick={resolve}
            className="px-4 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-xs font-bold text-slate-700 cursor-pointer"
          >
            {options.confirmLabel || 'إغلاق'}
          </button>

          {options.onPrimaryAction && options.primaryActionLabel && (
            <button
              type="button"
              disabled={running}
              onClick={handlePrimary}
              className={`inline-flex items-center gap-1.5 px-5 py-2 rounded-xl text-xs font-extrabold cursor-pointer ${toneMeta.btnCls}`}
            >
              {running && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>{options.primaryActionLabel}</span>
            </button>
          )}
        </div>
      </div>
    </SaaedModalFrame>
  );
};

/* ========================================================================= */
/* 5. Smart Missing Data Warning Modal (Pre-Approval Completeness Gate)      */
/* ========================================================================= */
const SmartMissingDataWarningModal: React.FC<{
  modal: Extract<ActiveModalState, { kind: 'missing_data' }>;
}> = ({ modal }) => {
  const { options, resolve } = modal;
  const { validation } = options;
  const groupedSections = groupValidationIssuesBySection(validation.issues);
  const firstIssue = validation.issues[0] ?? null;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        resolve();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [resolve]);

  const handleJump = (sectionId: string, fieldId: string) => {
    resolve();
    options.onNavigateToField(sectionId, fieldId);
  };

  return (
    <div
      dir="rtl"
      className="no-print fixed inset-0 z-[105] flex items-center justify-center bg-[#041226]/75 backdrop-blur-[2px] p-3 sm:p-5 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="saaed-missing-data-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          resolve();
        }
      }}
    >
      <div className="saaed-modal-enter relative w-full max-w-2xl max-h-[92vh] flex flex-col rounded-2xl bg-white border border-[#C6A35E]/70 shadow-[0_24px_64px_rgba(4,18,38,0.48)] overflow-hidden">
        {/* Top Navy-to-Blue Header with Golden Warning Icon & Diagonal Gold Stripes */}
        <div className="relative bg-gradient-to-l from-[#0C2544] via-[#104A82] to-[#176DAA] text-white border-b-2 border-[#C6A35E] shrink-0 overflow-hidden">
          <div
            aria-hidden="true"
            className="hidden sm:block absolute left-4 top-0 bottom-0 w-3 bg-gradient-to-b from-[#E5C878] via-[#C6A35E] to-[#9E782C] -skew-x-[28deg] opacity-95 pointer-events-none"
          />
          <div
            aria-hidden="true"
            className="hidden sm:block absolute left-9 top-0 bottom-0 w-1.5 bg-gradient-to-b from-[#E5C878]/85 to-[#C6A35E]/70 -skew-x-[28deg] pointer-events-none"
          />

          {/* Compact Contextual Inspection Visual Strip */}
          <div className="relative h-20 overflow-hidden border-b border-white/15">
            <img
              src={engineerInspectorImg}
              alt="مهندس مرافق يراجع اكتمال بيانات التقرير الشهري"
              style={{ objectPosition: 'center 26%' }}
              className="w-full h-full object-cover"
              referrerPolicy="no-referrer"
            />
            <div
              aria-hidden="true"
              className="absolute inset-0 bg-gradient-to-l from-[#0C2544]/90 via-[#0C2544]/65 to-[#0C2544]/40"
            />
            <div className="absolute bottom-2 right-4 left-14 flex items-center justify-between gap-2">
              <span className="text-[11px] font-bold text-[#E5C878]">
                التحقق الذكي من اكتمال البيانات قبل الاعتماد
              </span>
              <span className="text-[10px] font-semibold text-slate-200/90" dir="ltr">
                Smart Pre-Approval Validation
              </span>
            </div>
          </div>

          <div className="relative z-10 px-4 sm:px-5 py-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-[#D99A22]/20 border border-[#C6A35E] flex items-center justify-center text-[#E5C878] shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h3
                  id="saaed-missing-data-title"
                  className="text-sm sm:text-base font-extrabold text-white leading-snug"
                >
                  تنبيه: التقرير يحتوي على بيانات غير مكتملة
                </h3>
                <p className="text-[11px] text-[#CBE0F8] font-medium truncate" dir="ltr">
                  Incomplete Report Data · {options.reportNumber} ({getMonthNameEn(options.month)} {options.year})
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={resolve}
              aria-label="إغلاق نافذة التنبيه"
              className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Scrollable Content Body */}
        <div className="flex-1 overflow-y-auto fm-scroll p-4 sm:p-5 bg-white text-[#0C2544] space-y-4">
          {/* Primary Official Alert Statement */}
          <div className="rounded-xl border border-[#D99A22]/45 bg-[#FFFBEB] p-3.5 flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-[#D99A22] shrink-0 mt-0.5" />
            <div className="space-y-1 text-xs">
              <p className="font-bold text-[#0C2544] leading-relaxed">
                تعذر استكمال إجراء الاعتماد لوجود بيانات إلزامية لم تتم تعبئتها. يرجى مراجعة الحقول الموضحة أدناه واستكمالها قبل المتابعة.
              </p>
              <p className="text-[11px] font-semibold text-slate-600">
                الإجراء المطلوب: <span className="font-extrabold text-[#176DAA]">{options.attemptedActionLabel}</span>
                {' · '}
                الفترة:{' '}
                <span className="font-bold text-[#0C2544]">
                  {getMonthNameAr(options.month)} {formatNumber(options.year)}
                </span>
              </p>
            </div>
          </div>

          {/* Summary Completeness & Missing Counts Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
            <div className="rounded-xl border border-[#C94444]/35 bg-red-50/75 p-2.5">
              <span className="block text-[10.5px] font-semibold text-slate-600">حالة التقرير</span>
              <span className="inline-flex items-center gap-1 font-extrabold text-[#C94444] mt-0.5">
                <XCircle className="w-3.5 h-3.5 shrink-0" />
                <span>{validation.isComplete ? 'مكتمل' : 'غير مكتمل'}</span>
              </span>
            </div>

            <div className="rounded-xl border border-[#A3C0DE]/70 bg-[#F4F8FD] p-2.5">
              <span className="block text-[10.5px] font-semibold text-slate-600">نسبة اكتمال البيانات</span>
              <div className="flex items-center justify-between gap-2 mt-0.5">
                <span
                  className="text-sm font-extrabold text-[#0C2544] tabular-nums"
                  dir="ltr"
                >
                  {formatNumber(validation.completenessPercentage)}%
                </span>
              </div>
              <div className="mt-1 h-1.5 w-full rounded-full bg-slate-200 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${validation.completenessPercentage}%`,
                    backgroundColor:
                      validation.completenessPercentage >= 100
                        ? '#07976E'
                        : validation.completenessPercentage >= 70
                          ? '#D99A22'
                          : '#C94444',
                  }}
                />
              </div>
            </div>

            <div className="rounded-xl border border-[#C94444]/30 bg-white p-2.5">
              <span className="block text-[10.5px] font-semibold text-slate-600">الحقول الناقصة</span>
              <span className="text-sm font-extrabold text-[#C94444] tabular-nums block mt-0.5" dir="ltr">
                {formatNumber(validation.missingRequiredFields)}
              </span>
            </div>

            <div className="rounded-xl border border-[#D99A22]/40 bg-white p-2.5">
              <span className="block text-[10.5px] font-semibold text-slate-600">الأقسام المتأثرة</span>
              <span className="text-sm font-extrabold text-[#D99A22] tabular-nums block mt-0.5" dir="ltr">
                {formatNumber(validation.affectedSections)}
              </span>
            </div>
          </div>

          {/* Section-Grouped Missing Fields List */}
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs font-extrabold text-[#0C2544]">
              <span>تفاصيل الحقول الإلزامية المطلوب استكمالها ({formatNumber(validation.missingRequiredFields)})</span>
              <span className="text-[11px] font-semibold text-slate-500">اضغط للانتقال الفوري إلى الحقل</span>
            </div>

            <div className="space-y-2.5 max-h-[38vh] overflow-y-auto fm-scroll pe-1">
              {groupedSections.map((group) => (
                <div
                  key={group.sectionId}
                  className="rounded-xl border border-[#A3C0DE]/70 bg-[#F8FBFF] overflow-hidden"
                >
                  <div className="px-3 py-2 bg-[#EEF5FC] border-b border-[#A3C0DE]/50 flex items-center justify-between gap-2">
                    <span className="text-xs font-extrabold text-[#0C2544]">{group.sectionTitle}</span>
                    <span className="text-[10.5px] font-extrabold text-[#C94444] bg-white px-2 py-0.5 rounded border border-[#C94444]/30 tabular-nums">
                      {formatNumber(group.issues.length)} ناقص
                    </span>
                  </div>

                  <div className="divide-y divide-slate-200/70">
                    {group.issues.map((issue) => (
                      <div
                        key={issue.fieldId}
                        className="px-3 py-2.5 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
                      >
                        <div className="flex items-start gap-2 min-w-0">
                          <AlertTriangle
                            className={`w-4 h-4 shrink-0 mt-0.5 ${
                              issue.severity === 'error' ? 'text-[#C94444]' : 'text-[#D99A22]'
                            }`}
                          />
                          <div className="min-w-0">
                            <p className="text-xs font-extrabold text-[#0C2544]">{issue.fieldLabel}</p>
                            <p className="text-[11px] text-slate-600 leading-snug mt-0.5">{issue.message}</p>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleJump(issue.sectionId, issue.fieldId)}
                          aria-label={`الانتقال إلى حقل ${issue.fieldLabel}`}
                          className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#176DAA] hover:bg-[#0C2544] text-white text-[11px] font-extrabold transition-colors shrink-0 cursor-pointer"
                        >
                          <ArrowUpLeft className="w-3.5 h-3.5" />
                          <span>الانتقال إلى الحقل</span>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Modal Action Footer */}
          <div className="flex flex-wrap items-center justify-between gap-2.5 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={resolve}
              className="px-4 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-xs font-bold text-slate-700 cursor-pointer"
            >
              إغلاق
            </button>

            {firstIssue && (
              <button
                type="button"
                onClick={() => handleJump(firstIssue.sectionId, firstIssue.fieldId)}
                className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-[#0C2544] hover:bg-[#176DAA] text-white text-xs font-extrabold shadow-xs transition-colors cursor-pointer"
              >
                <ArrowUpLeft className="w-4 h-4 text-[#C6A35E]" />
                <span>الانتقال لأول حقل ناقص</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export const ModalDialogHost: React.FC<{ activeModal: ActiveModalState | null }> = ({
  activeModal,
}) => {
  if (!activeModal) return null;

  switch (activeModal.kind) {
    case 'confirm':
      return <ConfirmationDialogModal key={activeModal.id} modal={activeModal} />;
    case 'approval':
      return <ExecutiveApprovalDialogModal key={activeModal.id} modal={activeModal} />;
    case 'unsaved':
      return <UnsavedChangesDialogModal key={activeModal.id} modal={activeModal} />;
    case 'alert':
      return <AlertDialogModal key={activeModal.id} modal={activeModal} />;
    case 'missing_data':
      return <SmartMissingDataWarningModal key={activeModal.id} modal={activeModal} />;
    default:
      return null;
  }
};
