import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpLeft,
  Bell,
  CheckCheck,
  CheckCircle2,
  Info,
  Trash2,
  X,
  XCircle,
} from 'lucide-react';
import type { AuthUser } from '../types/report.ts';
import { formatDateTimeWestern, formatNumber } from '../utils/calculations.ts';
import type { NotificationHistoryItem, NotificationNavigationTarget } from './types.ts';

interface NotificationCenterProps {
  history: NotificationHistoryItem[];
  user: AuthUser | null;
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
  onClearHistory: () => void;
  onNavigateTarget: (target: NotificationNavigationTarget) => void;
}

export const NotificationCenter: React.FC<NotificationCenterProps> = ({
  history,
  user,
  onMarkRead,
  onMarkAllRead,
  onClearHistory,
  onNavigateTarget,
}) => {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<'all' | 'unread' | 'alerts'>('all');
  const containerRef = useRef<HTMLDivElement | null>(null);

  const visibleItems = useMemo(() => {
    return history.filter((item) => {
      if (item.allowedRoles && item.allowedRoles.length > 0) {
        if (!user || !item.allowedRoles.includes(user.role)) return false;
      }
      return true;
    });
  }, [history, user]);

  const unreadCount = useMemo(
    () => visibleItems.filter((item) => !item.read).length,
    [visibleItems]
  );

  const filteredItems = useMemo(() => {
    if (filter === 'unread') return visibleItems.filter((i) => !i.read);
    if (filter === 'alerts') return visibleItems.filter((i) => i.type === 'error' || i.type === 'warning');
    return visibleItems;
  }, [visibleItems, filter]);

  useEffect(() => {
    if (!open) return;
    const handleOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('mousedown', handleOutside);
    window.addEventListener('keydown', handleEsc);
    return () => {
      window.removeEventListener('mousedown', handleOutside);
      window.removeEventListener('keydown', handleEsc);
    };
  }, [open]);

  const getTypeIcon = (type: NotificationHistoryItem['type']) => {
    switch (type) {
      case 'success':
        return <CheckCircle2 className="w-4 h-4 text-[#07976E] shrink-0" />;
      case 'error':
        return <XCircle className="w-4 h-4 text-[#C94444] shrink-0" />;
      case 'warning':
        return <AlertTriangle className="w-4 h-4 text-[#D99A22] shrink-0" />;
      default:
        return <Info className="w-4 h-4 text-[#10518C] shrink-0" />;
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-label="مركز الإشعارات"
        aria-expanded={open}
        title="مركز الإشعارات وسجل التنبيهات"
        className="relative flex items-center gap-1.5 px-2 py-1 rounded-md bg-white/10 hover:bg-white/20 border border-white/15 text-white transition-colors cursor-pointer"
      >
        <Bell className="w-3.5 h-3.5 text-[#DFC076]" />
        <span className="hidden xl:inline text-[11px] font-bold">الإشعارات</span>
        {unreadCount > 0 && (
          <span
            dir="ltr"
            className="min-w-[18px] h-[18px] px-1 rounded-full bg-[#C94444] text-white text-[10px] font-extrabold flex items-center justify-center tabular-nums leading-none"
          >
            {unreadCount > 99 ? '99+' : formatNumber(unreadCount)}
          </span>
        )}
      </button>

      {open && (
        <div
          dir="rtl"
          role="region"
          aria-label="سجل الإشعارات"
          className="fixed sm:absolute top-11 left-3 right-3 sm:right-auto sm:left-0 sm:top-full sm:mt-2 z-[95] sm:w-[410px] max-h-[78vh] flex flex-col rounded-2xl bg-white border border-[#D5AD5D]/70 shadow-[0_20px_50px_rgba(4,18,38,0.35)] overflow-hidden"
        >
          {/* Navy Header */}
          <div className="bg-gradient-to-l from-[#082D56] to-[#10518C] text-white px-4 py-3 border-b-2 border-[#D5AD5D] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-[#D5AD5D]" />
              <div>
                <h3 className="text-xs font-extrabold">مركز الإشعارات والتنبيهات</h3>
                <p className="text-[10px] text-[#CBE0F8]">
                  الأحداث المهمة:{' '}
                  <span dir="ltr" className="tabular-nums font-bold">
                    {formatNumber(unreadCount)}
                  </span>{' '}
                  غير مقروء
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={onMarkAllRead}
                  title="تحديد الكل كمقروء"
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white/10 hover:bg-white/20 text-[10.5px] font-bold text-[#DFC076] cursor-pointer"
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                  <span>قراءة الكل</span>
                </button>
              )}
              {visibleItems.length > 0 && (
                <button
                  type="button"
                  onClick={onClearHistory}
                  title="مسح السجل"
                  className="p-1.5 rounded-md hover:bg-white/15 text-slate-200 hover:text-white cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="إغلاق مركز الإشعارات"
                className="p-1 rounded-md hover:bg-white/15 text-slate-200 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="px-3 py-2 bg-[#EFF6FC] border-b border-slate-200 flex items-center gap-1.5 text-[11px]">
            {[
              { id: 'all', label: `الكل (${formatNumber(visibleItems.length)})` },
              { id: 'unread', label: `غير مقروء (${formatNumber(unreadCount)})` },
              {
                id: 'alerts',
                label: `الأخطاء والتحذيرات (${formatNumber(
                  visibleItems.filter((i) => i.type === 'error' || i.type === 'warning').length
                )})`,
              },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilter(tab.id as 'all' | 'unread' | 'alerts')}
                className={`px-2.5 py-1 rounded-md font-bold transition-colors cursor-pointer ${
                  filter === tab.id
                    ? 'bg-[#082D56] text-white'
                    : 'bg-white text-slate-600 hover:text-[#082D56] border border-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* History List */}
          <div className="flex-1 overflow-y-auto fm-scroll divide-y divide-slate-100">
            {filteredItems.length === 0 ? (
              <div className="py-12 px-4 text-center text-xs text-slate-500">
                لا توجد إشعارات مسجلة في هذا التصنيف حالياً.
              </div>
            ) : (
              filteredItems.map((item) => (
                <div
                  key={item.id}
                  onClick={() => {
                    onMarkRead(item.id);
                    if (item.target) {
                      onNavigateTarget(item.target);
                      setOpen(false);
                    }
                  }}
                  className={`p-3 transition-colors ${
                    item.target ? 'cursor-pointer hover:bg-[#EFF6FC]/80' : ''
                  } ${item.read ? 'bg-white' : 'bg-[#EFF6FC]/55'}`}
                >
                  <div className="flex items-start gap-2.5">
                    <div className="mt-0.5">{getTypeIcon(item.type)}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-extrabold text-[#142D4C] truncate">
                          {item.title}
                        </span>
                        {!item.read && (
                          <span className="text-[10px] font-extrabold text-[#10518C] shrink-0">
                            جديد
                          </span>
                        )}
                      </div>
                      {item.message && (
                        <p className="text-[11px] text-slate-600 mt-0.5 leading-relaxed">
                          {item.message}
                        </p>
                      )}
                      <div className="flex flex-wrap items-center justify-between gap-2 mt-1.5 text-[10px] text-slate-400">
                        <span className="font-mono tabular-nums" dir="ltr">
                          {formatDateTimeWestern(item.createdAt)}
                        </span>
                        <div className="flex items-center gap-2">
                          {item.reportNumber && (
                            <span className="font-mono font-bold text-[#082D56] tabular-nums" dir="ltr">
                              {item.reportNumber}
                            </span>
                          )}
                          {item.target && (
                            <span className="inline-flex items-center gap-0.5 font-bold text-[#10518C]">
                              <ArrowUpLeft className="w-3 h-3" />
                              <span>فتح</span>
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
