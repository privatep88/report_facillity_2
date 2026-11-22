import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { ARABIC_MONTHS } from '../types/report.ts';
import {
  extractIsoDate,
  formatDateWestern,
  normalizeDateDigits,
  parseDisplayDateDDMMYYYY,
} from '../utils/calculations.ts';

interface WesternDatePickerProps {
  id?: string;
  value: string | null | undefined;
  onChange: (isoDate: string | null) => void;
  disabled?: boolean;
  readOnly?: boolean;
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
}

const WEEKDAYS_AR = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

const westernIntegerFormatter = new Intl.NumberFormat('en-US-u-nu-latn', {
  useGrouping: false,
});

function formatWesternInt(n: number): string {
  return normalizeDateDigits(westernIntegerFormatter.format(n));
}

function pad2(n: number): string {
  return formatWesternInt(n).padStart(2, '0');
}

function getTodayIsoLocal(): string {
  const now = new Date();
  const formatted = normalizeDateDigits(
    new Intl.DateTimeFormat('en-CA-u-nu-latn', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      calendar: 'gregory',
    }).format(now)
  );
  if (/^\d{4}-\d{2}-\d{2}$/.test(formatted)) {
    return formatted;
  }
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export const WesternDatePicker: React.FC<WesternDatePickerProps> = ({
  id,
  value,
  onChange,
  disabled = false,
  readOnly = false,
  placeholder = 'DD/MM/YYYY',
  ariaLabel,
  className = '',
}) => {
  const isInteractive = !disabled && !readOnly;
  const committedIso = useMemo(() => extractIsoDate(value), [value]);
  const committedDisplay = useMemo(
    () => (committedIso ? formatDateWestern(committedIso, '') : ''),
    [committedIso]
  );

  const [textValue, setTextValue] = useState<string>(committedDisplay);
  const [open, setOpen] = useState(false);

  const initialView = useMemo(() => {
    const base = committedIso || getTodayIsoLocal();
    const [y, m] = base.split('-').map(Number);
    return {
      year: Number.isFinite(y) ? y : 2026,
      month: Number.isFinite(m) && m >= 1 && m <= 12 ? m : 1,
    };
  }, [committedIso]);

  const [viewYear, setViewYear] = useState<number>(initialView.year);
  const [viewMonth, setViewMonth] = useState<number>(initialView.month);
  const [popoverCoords, setPopoverCoords] = useState<{ top: number; left: number; width: number }>({
    top: 0,
    left: 0,
    width: 296,
  });

  const containerRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTextValue(committedDisplay);
  }, [committedDisplay]);

  const syncViewToCurrentDate = useCallback(() => {
    const base = committedIso || getTodayIsoLocal();
    const [y, m] = base.split('-').map(Number);
    if (Number.isFinite(y) && Number.isFinite(m) && m >= 1 && m <= 12) {
      setViewYear(y);
      setViewMonth(m);
    }
  }, [committedIso]);

  const updatePopoverPosition = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const popWidth = 296;
    const popHeight = 340;
    const margin = 8;

    let left = rect.left;
    if (left + popWidth > window.innerWidth - margin) {
      left = Math.max(margin, window.innerWidth - popWidth - margin);
    }
    if (left < margin) left = margin;

    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    let top = rect.bottom + 6;
    if (spaceBelow < popHeight + margin && spaceAbove > spaceBelow) {
      top = Math.max(margin, rect.top - popHeight - 6);
    } else if (top + popHeight > window.innerHeight - margin) {
      top = Math.max(margin, window.innerHeight - popHeight - margin);
    }

    setPopoverCoords({ top, left, width: popWidth });
  }, []);

  useEffect(() => {
    if (!open) return;
    updatePopoverPosition();

    const handleOutside = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (containerRef.current?.contains(target)) return;
      if (popoverRef.current?.contains(target)) return;
      setOpen(false);
    };

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
      }
    };

    const handleReposition = () => updatePopoverPosition();

    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('touchstart', handleOutside);
    document.addEventListener('keydown', handleKey);
    window.addEventListener('scroll', handleReposition, true);
    window.addEventListener('resize', handleReposition);

    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('touchstart', handleOutside);
      document.removeEventListener('keydown', handleKey);
      window.removeEventListener('scroll', handleReposition, true);
      window.removeEventListener('resize', handleReposition);
    };
  }, [open, updatePopoverPosition]);

  const toggleOpen = () => {
    if (!isInteractive) return;
    if (!open) {
      syncViewToCurrentDate();
    }
    setOpen((prev) => !prev);
  };

  const handleOpenFromInput = () => {
    if (!isInteractive) return;
    if (!open) {
      syncViewToCurrentDate();
      setOpen(true);
    }
  };

  const commitIsoSelection = (isoDate: string | null) => {
    if (isoDate) {
      setTextValue(formatDateWestern(isoDate, ''));
      onChange(isoDate);
    } else {
      setTextValue('');
      onChange(null);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!isInteractive) return;
    const raw = normalizeDateDigits(e.target.value).replace(/[^0-9/]/g, '');
    setTextValue(raw);

    if (raw.trim() === '') {
      onChange(null);
      return;
    }

    const parsedIso = parseDisplayDateDDMMYYYY(raw);
    if (parsedIso) {
      const [y, m] = parsedIso.split('-').map(Number);
      setViewYear(y);
      setViewMonth(m);
      onChange(parsedIso);
    }
  };

  const handleInputBlur = () => {
    const trimmed = normalizeDateDigits(textValue).trim();
    if (!trimmed) {
      if (committedIso) onChange(null);
      setTextValue('');
      return;
    }
    const parsedIso = parseDisplayDateDDMMYYYY(trimmed);
    if (parsedIso) {
      setTextValue(formatDateWestern(parsedIso, ''));
      if (parsedIso !== committedIso) {
        onChange(parsedIso);
      }
    } else {
      setTextValue(committedDisplay);
    }
  };

  const handlePrevMonth = () => {
    if (viewMonth === 1) {
      setViewYear((y) => Math.max(1990, y - 1));
      setViewMonth(12);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (viewMonth === 12) {
      setViewYear((y) => Math.min(2099, y + 1));
      setViewMonth(1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const calendarCells = useMemo(() => {
    const firstDayUtc = new Date(Date.UTC(viewYear, viewMonth - 1, 1, 12, 0, 0));
    const startWeekday = firstDayUtc.getUTCDay(); // 0 = Sunday .. 6 = Saturday
    const daysInMonth = new Date(Date.UTC(viewYear, viewMonth, 0, 12, 0, 0)).getUTCDate();
    const prevMonthYear = viewMonth === 1 ? viewYear - 1 : viewYear;
    const prevMonthNum = viewMonth === 1 ? 12 : viewMonth - 1;
    const daysInPrevMonth = new Date(Date.UTC(prevMonthYear, prevMonthNum, 0, 12, 0, 0)).getUTCDate();

    const cells: Array<{
      iso: string;
      day: number;
      inCurrentMonth: boolean;
    }> = [];

    for (let i = startWeekday - 1; i >= 0; i--) {
      const d = daysInPrevMonth - i;
      cells.push({
        iso: `${formatWesternInt(prevMonthYear)}-${pad2(prevMonthNum)}-${pad2(d)}`,
        day: d,
        inCurrentMonth: false,
      });
    }

    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({
        iso: `${formatWesternInt(viewYear)}-${pad2(viewMonth)}-${pad2(d)}`,
        day: d,
        inCurrentMonth: true,
      });
    }

    const nextMonthYear = viewMonth === 12 ? viewYear + 1 : viewYear;
    const nextMonthNum = viewMonth === 12 ? 1 : viewMonth + 1;
    let nextDay = 1;
    while (cells.length < 42) {
      cells.push({
        iso: `${formatWesternInt(nextMonthYear)}-${pad2(nextMonthNum)}-${pad2(nextDay)}`,
        day: nextDay,
        inCurrentMonth: false,
      });
      nextDay++;
    }

    return cells;
  }, [viewYear, viewMonth]);

  const todayIso = getTodayIsoLocal();
  const todayDisplay = formatDateWestern(todayIso, '');

  const yearOptions = useMemo(() => {
    const minY = Math.min(2020, viewYear - 3);
    const maxY = Math.max(2035, viewYear + 5);
    const arr: number[] = [];
    for (let y = minY; y <= maxY; y++) arr.push(y);
    return arr;
  }, [viewYear]);

  return (
    <div ref={containerRef} className={`relative w-full ${className}`}>
      <div
        dir="ltr"
        className={`flex items-center w-full rounded-md border transition-colors ${
          disabled
            ? 'border-slate-200 bg-slate-50 text-slate-500 cursor-not-allowed'
            : readOnly
              ? 'border-[#C5D8EC] bg-[#F8FAFC] text-[#0B2341]'
              : open
                ? 'border-[#1769AA] bg-white ring-2 ring-[#1769AA]/15'
                : 'border-slate-200 bg-[#F8FAFC] hover:border-[#A3C0DE] focus-within:bg-white focus-within:border-[#1769AA]'
        }`}
      >
        <input
          ref={inputRef}
          id={id}
          type="text"
          inputMode="numeric"
          dir="ltr"
          lang="en"
          autoComplete="off"
          disabled={disabled}
          readOnly={readOnly}
          aria-label={ariaLabel}
          aria-expanded={isInteractive ? open : undefined}
          aria-haspopup={isInteractive ? 'dialog' : undefined}
          placeholder={placeholder}
          value={textValue}
          onClick={handleOpenFromInput}
          onChange={handleInputChange}
          onBlur={isInteractive ? handleInputBlur : undefined}
          onKeyDown={(e) => {
            if (!isInteractive) return;
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              handleOpenFromInput();
            } else if (e.key === 'Enter') {
              const parsed = parseDisplayDateDDMMYYYY(textValue);
              if (parsed) {
                commitIsoSelection(parsed);
                setOpen(false);
              }
            }
          }}
          className={`w-full min-w-0 px-2 py-1 bg-transparent font-mono font-bold text-[#0B2341] text-[11.5px] tabular-nums western-num focus:outline-none disabled:text-slate-500 disabled:cursor-not-allowed ${
            readOnly ? 'cursor-default' : ''
          }`}
        />
        {readOnly && !disabled ? (
          <span
            aria-hidden="true"
            className="px-2 py-1 text-[#1769AA] shrink-0 flex items-center"
          >
            <Calendar className="w-3.5 h-3.5" />
          </span>
        ) : (
          <button
            type="button"
            disabled={disabled}
            onClick={toggleOpen}
            aria-label="فتح التقويم الميلادي"
            className="px-2 py-1 text-[#1769AA] hover:text-[#012E5E] disabled:text-slate-400 disabled:cursor-not-allowed cursor-pointer shrink-0 transition-colors"
          >
            <Calendar className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {open &&
        isInteractive &&
        createPortal(
          <div
            ref={popoverRef}
            role="dialog"
            aria-label={ariaLabel || 'اختيار التاريخ الميلادي'}
            dir="rtl"
            style={{
              position: 'fixed',
              top: `${popoverCoords.top}px`,
              left: `${popoverCoords.left}px`,
              width: `${popoverCoords.width}px`,
              zIndex: 9999,
            }}
            className="rounded-xl border border-[#A3C0DE] bg-white shadow-2xl overflow-hidden select-none"
          >
            {/* Header: Navy Corporate Theme + Western 0-9 Month & Year Selectors */}
            <div className="bg-gradient-to-l from-[#012E5E] to-[#0C4176] text-white px-2.5 py-2 flex items-center justify-between gap-1.5 border-b-2 border-[#C99E4A]">
              <button
                type="button"
                onClick={handlePrevMonth}
                title="الشهر السابق"
                aria-label="الشهر السابق"
                className="p-1 rounded-md bg-white/10 hover:bg-white/20 text-[#DFC076] cursor-pointer transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>

              <div className="flex items-center gap-1.5 min-w-0">
                <select
                  aria-label="اختيار الشهر"
                  value={viewMonth}
                  onChange={(e) => setViewMonth(Number(e.target.value))}
                  className="bg-[#0B2341] border border-white/25 rounded-md px-1.5 py-1 text-[11px] font-bold text-white focus:outline-none focus:border-[#DFC076] cursor-pointer western-num"
                >
                  {ARABIC_MONTHS.map((m) => (
                    <option key={m.value} value={m.value} className="bg-white text-[#0B2341]">
                      {m.nameAr} ({pad2(m.value)})
                    </option>
                  ))}
                </select>

                <select
                  aria-label="اختيار السنة"
                  dir="ltr"
                  value={viewYear}
                  onChange={(e) => setViewYear(Number(e.target.value))}
                  className="bg-[#0B2341] border border-white/25 rounded-md px-1.5 py-1 text-[11px] font-mono font-bold text-[#DFC076] focus:outline-none focus:border-[#DFC076] cursor-pointer tabular-nums western-num"
                >
                  {yearOptions.map((y) => (
                    <option key={y} value={y} className="bg-white text-[#0B2341]">
                      {formatWesternInt(y)}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                onClick={handleNextMonth}
                title="الشهر التالي"
                aria-label="الشهر التالي"
                className="p-1 rounded-md bg-white/10 hover:bg-white/20 text-[#DFC076] cursor-pointer transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            </div>

            {/* Weekday Header Row */}
            <div className="grid grid-cols-7 bg-[#EEF3F9] border-b border-slate-200 px-2 py-1.5 text-center">
              {WEEKDAYS_AR.map((dayName) => (
                <span key={dayName} className="text-[10px] font-extrabold text-[#012E5E]">
                  {dayName}
                </span>
              ))}
            </div>

            {/* Gregorian Day Cells (strictly Western 0-9 numerals) */}
            <div className="grid grid-cols-7 gap-1 p-2">
              {calendarCells.map((cell) => {
                const isSelected = cell.iso === committedIso;
                const isToday = cell.iso === todayIso;
                return (
                  <button
                    key={cell.iso}
                    type="button"
                    data-iso={cell.iso}
                    onClick={() => {
                      commitIsoSelection(cell.iso);
                      setOpen(false);
                    }}
                    className={`h-8 rounded-lg text-xs font-mono font-bold tabular-nums western-num flex items-center justify-center transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-[#012E5E] text-white ring-2 ring-[#C99E4A] shadow-xs'
                        : isToday
                          ? 'bg-[#F3EBDA] text-[#012E5E] border border-[#C99E4A] hover:bg-[#DFC076]/40'
                          : cell.inCurrentMonth
                            ? 'text-[#0B2341] hover:bg-[#DCECFB] hover:text-[#1769AA]'
                            : 'text-slate-300 hover:bg-slate-100 hover:text-slate-500'
                    }`}
                  >
                    <span dir="ltr" className="western-num tabular-nums">
                      {formatWesternInt(cell.day)}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Footer: Today (Western DD/MM/YYYY), Clear, Close */}
            <div className="px-2.5 py-2 bg-[#F8FAFC] border-t border-slate-200 flex items-center justify-between gap-2 text-[11px]">
              <button
                type="button"
                onClick={() => {
                  commitIsoSelection(todayIso);
                  setOpen(false);
                }}
                className="px-2 py-1 rounded-md bg-[#E3F7F3] hover:bg-[#069B74] text-[#069B74] hover:text-white font-bold transition-colors cursor-pointer"
              >
                اليوم (<span dir="ltr" className="font-mono tabular-nums western-num">{todayDisplay}</span>)
              </button>

              <div className="flex items-center gap-1.5">
                {committedIso && (
                  <button
                    type="button"
                    onClick={() => {
                      commitIsoSelection(null);
                      setOpen(false);
                    }}
                    className="px-2 py-1 rounded-md text-[#C43D47] hover:bg-red-50 font-bold cursor-pointer"
                  >
                    مسح
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="px-2 py-1 rounded-md bg-slate-200/70 hover:bg-slate-200 text-slate-700 font-bold cursor-pointer"
                >
                  إغلاق
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};
