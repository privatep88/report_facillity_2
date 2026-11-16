import React, { useState } from 'react';
import {
  AlertTriangle,
  ArrowUpLeft,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Info,
  X,
  XCircle,
} from 'lucide-react';
import { formatDateTimeWestern } from '../utils/calculations.ts';
import type { ToastItem } from './types.ts';

interface ToastViewportProps {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
  onNavigate?: (target: ToastItem['target']) => void;
}

const TONE_META = {
  success: {
    Icon: CheckCircle2,
    border: 'border-[#07976E]/45',
    topBar: 'bg-[#07976E]',
    iconBg: 'bg-emerald-50 text-[#07976E] border-emerald-200/80',
    label: 'تم بنجاح',
    actionBtn: 'bg-[#07976E] hover:bg-[#06815e] text-white',
    ariaLive: 'polite' as const,
  },
  error: {
    Icon: XCircle,
    border: 'border-[#C94444]/50',
    topBar: 'bg-[#C94444]',
    iconBg: 'bg-red-50 text-[#C94444] border-red-200/80',
    label: 'خطأ في العملية',
    actionBtn: 'bg-[#C94444] hover:bg-[#ae3737] text-white',
    ariaLive: 'assertive' as const,
  },
  warning: {
    Icon: AlertTriangle,
    border: 'border-[#D99A22]/55',
    topBar: 'bg-[#D99A22]',
    iconBg: 'bg-amber-50 text-[#D99A22] border-amber-200/80',
    label: 'تنبيه تشغيلي',
    actionBtn: 'bg-[#D99A22] hover:bg-[#b88119] text-[#082D56]',
    ariaLive: 'polite' as const,
  },
  info: {
    Icon: Info,
    border: 'border-[#10518C]/40',
    topBar: 'bg-[#10518C]',
    iconBg: 'bg-[#EFF6FC] text-[#10518C] border-[#10518C]/20',
    label: 'معلومة النظام',
    actionBtn: 'bg-[#082D56] hover:bg-[#10518C] text-white',
    ariaLive: 'polite' as const,
  },
};

const ToastCard: React.FC<{
  toast: ToastItem;
  onDismiss: (id: string) => void;
  onNavigate?: (target: ToastItem['target']) => void;
}> = ({ toast, onDismiss, onNavigate }) => {
  const [expanded, setExpanded] = useState(false);
  const [runningAction, setRunningAction] = useState(false);
  const meta = TONE_META[toast.type];
  const { Icon } = meta;

  const handleAction = async () => {
    if (!toast.action || runningAction) return;
    setRunningAction(true);
    try {
      await toast.action.onClick();
    } finally {
      setRunningAction(false);
    }
  };

  return (
    <div
      role={toast.type === 'error' ? 'alert' : 'status'}
      aria-live={meta.ariaLive}
      dir="rtl"
      className={`saaed-toast-enter pointer-events-auto relative overflow-hidden rounded-xl bg-white border ${meta.border} shadow-[0_12px_32px_rgba(8,45,86,0.16)]`}
    >
      {/* Crisp thin top corporate accent */}
      <div className={`h-1 w-full ${meta.topBar}`} />

      <div className="p-3.5 flex items-start gap-3">
        <div className={`w-9 h-9 rounded-lg border flex items-center justify-center shrink-0 ${meta.iconBg}`}>
          <Icon className="w-5 h-5" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10.5px] font-bold text-slate-500">{meta.label}</span>
            <span className="text-[10px] font-mono text-slate-400 tabular-nums" dir="ltr">
              {formatDateTimeWestern(toast.createdAt).split(' ')[1] || ''}
            </span>
          </div>

          <p className="text-[13px] font-extrabold text-[#142D4C] leading-snug mt-0.5">{toast.title}</p>

          {toast.message && (
            <p className="text-xs text-slate-600 mt-1 leading-relaxed break-words">{toast.message}</p>
          )}

          {toast.errorCode && (
            <p className="text-[10.5px] font-mono text-slate-500 mt-1 tabular-nums" dir="ltr">
              Ref: {toast.errorCode}
            </p>
          )}

          {(toast.details || toast.action || toast.target) && (
            <div className="flex flex-wrap items-center gap-2 mt-2.5">
              {toast.action && (
                <button
                  type="button"
                  disabled={runningAction}
                  onClick={handleAction}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-colors disabled:opacity-60 cursor-pointer ${meta.actionBtn}`}
                >
                  {runningAction ? 'جاري التنفيذ...' : toast.action.label}
                </button>
              )}

              {toast.target && onNavigate && (
                <button
                  type="button"
                  onClick={() => {
                    onNavigate(toast.target);
                    onDismiss(toast.id);
                  }}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-[#EFF6FC] hover:bg-[#dcebfa] text-[#082D56] border border-[#10518C]/20 text-[11px] font-bold transition-colors cursor-pointer"
                >
                  <ArrowUpLeft className="w-3 h-3" />
                  <span>الانتقال</span>
                </button>
              )}

              {toast.details && (
                <button
                  type="button"
                  onClick={() => setExpanded((p) => !p)}
                  className="inline-flex items-center gap-1 text-[11px] font-bold text-[#10518C] hover:underline cursor-pointer"
                >
                  <span>{expanded ? 'إخفاء التفاصيل' : 'عرض التفاصيل'}</span>
                  {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </button>
              )}
            </div>
          )}

          {expanded && toast.details && (
            <div
              dir="ltr"
              className="mt-2 p-2 rounded-lg bg-[#EFF6FC] border border-[#10518C]/15 text-[11px] font-mono text-[#142D4C] break-words"
            >
              {toast.details}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => onDismiss(toast.id)}
          aria-label="إغلاق الإشعار"
          className="p-1 rounded-md text-slate-400 hover:text-[#082D56] hover:bg-slate-100 transition-colors cursor-pointer shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

export const ToastNotificationViewport: React.FC<ToastViewportProps> = ({
  toasts,
  onDismiss,
  onNavigate,
}) => {
  if (toasts.length === 0) return null;

  return (
    <div
      className="no-print fixed top-12 left-3 right-3 sm:right-auto sm:left-4 z-[90] flex flex-col gap-2.5 sm:w-[395px] max-w-full pointer-events-none"
      aria-label="إشعارات النظام الفورية"
    >
      {toasts.map((toast) => (
        <ToastCard key={toast.id} toast={toast} onDismiss={onDismiss} onNavigate={onNavigate} />
      ))}
    </div>
  );
};
