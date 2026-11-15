import React, { useCallback, useEffect, useRef, useState } from 'react';
import { normalizeDigits } from '../utils/calculations.ts';

export interface SmartNumericInputProps
  extends Omit<
    React.InputHTMLAttributes<HTMLInputElement>,
    'type' | 'value' | 'onChange' | 'inputMode'
  > {
  value: number;
  onChange?: (value: number) => void;
  onChangeValue?: (nextValue: number) => void;
  min?: number;
  max?: number;
  step?: number;
  precision?: number;
  decimal?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  ariaLabel?: string;
}

function roundToPrecision(num: number, precision: number): number {
  if (precision <= 0) return Math.floor(num);
  const factor = Math.pow(10, precision);
  return Math.round((num + Number.EPSILON) * factor) / factor;
}

function clampNumeric(
  num: number,
  min: number,
  max: number | undefined,
  precision: number
): number {
  if (!Number.isFinite(num)) return min;
  const bounded = max !== undefined ? Math.min(max, Math.max(min, num)) : Math.max(min, num);
  return roundToPrecision(bounded, precision);
}

function formatInputValue(val: number, precision: number): string {
  if (!Number.isFinite(val)) return '0';
  return String(roundToPrecision(val, precision));
}

export const SmartNumericInput: React.FC<SmartNumericInputProps> = ({
  value,
  onChange,
  onChangeValue,
  min = 0,
  max,
  step = 1,
  precision,
  decimal = false,
  disabled = false,
  readOnly = false,
  ariaLabel,
  className = '',
  onFocus,
  onBlur,
  onKeyDown,
  ...rest
}) => {
  const resolvedPrecision = precision !== undefined ? Math.max(0, precision) : decimal ? 2 : 0;
  const isDecimal = resolvedPrecision > 0;
  const isInteractive = !disabled && !readOnly;

  const [focused, setFocused] = useState(false);
  const [draftText, setDraftText] = useState<string>(() =>
    formatInputValue(value, resolvedPrecision)
  );

  const inputRef = useRef<HTMLInputElement | null>(null);
  const latestValueRef = useRef<number>(
    clampNumeric(Number(value) || 0, min, max, resolvedPrecision)
  );
  const holdTimeoutRef = useRef<number | null>(null);
  const holdIntervalRef = useRef<number | null>(null);

  useEffect(() => {
    const safeVal = clampNumeric(Number(value) || 0, min, max, resolvedPrecision);
    latestValueRef.current = safeVal;
    if (!focused) {
      setDraftText(formatInputValue(safeVal, resolvedPrecision));
    }
  }, [value, min, max, resolvedPrecision, focused]);

  const stopHoldTimer = useCallback(() => {
    if (holdTimeoutRef.current !== null) {
      window.clearTimeout(holdTimeoutRef.current);
      holdTimeoutRef.current = null;
    }
    if (holdIntervalRef.current !== null) {
      window.clearInterval(holdIntervalRef.current);
      holdIntervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => stopHoldTimer();
  }, [stopHoldTimer]);

  const emitValue = useCallback(
    (nextNumeric: number) => {
      latestValueRef.current = nextNumeric;
      onChange?.(nextNumeric);
      onChangeValue?.(nextNumeric);
    },
    [onChange, onChangeValue]
  );

  const sanitizeDraft = useCallback(
    (raw: string): { display: string; numeric: number } => {
      const normalized = normalizeDigits(raw).replace(/,/g, '');
      if (!isDecimal) {
        const digitsOnly = normalized.replace(/[^0-9]/g, '');
        if (!digitsOnly) {
          return { display: '', numeric: min };
        }
        const cleaned = digitsOnly.replace(/^0+(?=\d)/, '');
        const parsed = clampNumeric(Number(cleaned), min, max, 0);
        return { display: String(parsed), numeric: parsed };
      }

      let filtered = normalized.replace(/[^0-9.]/g, '');
      const firstDot = filtered.indexOf('.');
      if (firstDot !== -1) {
        const intPart = filtered.slice(0, firstDot).replace(/^0+(?=\d)/, '') || '0';
        const decPart = filtered
          .slice(firstDot + 1)
          .replace(/\./g, '')
          .slice(0, resolvedPrecision);
        filtered = `${intPart}.${decPart}`;
      } else if (filtered) {
        filtered = filtered.replace(/^0+(?=\d)/, '');
      }

      if (!filtered) {
        return { display: '', numeric: min };
      }
      const parsedNum = Number(filtered);
      const clamped = Number.isFinite(parsedNum)
        ? clampNumeric(parsedNum, min, max, resolvedPrecision)
        : min;
      return { display: filtered, numeric: clamped };
    },
    [isDecimal, min, max, resolvedPrecision]
  );

  const stepByDirection = useCallback(
    (direction: 1 | -1) => {
      if (!isInteractive) return;
      const effectiveStep = Number.isFinite(step) && step > 0 ? step : 1;
      const current = latestValueRef.current;
      const candidate = current + direction * effectiveStep;
      const next = clampNumeric(candidate, min, max, resolvedPrecision);
      setDraftText(formatInputValue(next, resolvedPrecision));
      if (next !== current) {
        emitValue(next);
      }
    },
    [isInteractive, step, min, max, resolvedPrecision, emitValue]
  );

  const startHold = useCallback(
    (direction: 1 | -1) => {
      if (!isInteractive) return;
      if (document.activeElement !== inputRef.current) {
        inputRef.current?.focus();
      }
      stopHoldTimer();
      stepByDirection(direction);
      holdTimeoutRef.current = window.setTimeout(() => {
        holdIntervalRef.current = window.setInterval(() => {
          stepByDirection(direction);
        }, 75);
      }, 360);
    },
    [isInteractive, stopHoldTimer, stepByDirection]
  );

  const currentNumeric = clampNumeric(Number(value) || 0, min, max, resolvedPrecision);
  const canIncrement = isInteractive && (max === undefined || currentNumeric < max);
  const canDecrement = isInteractive && currentNumeric > min;

  const baseAriaLabel = ariaLabel || rest['aria-label'] || 'القيمة الرقمية';
  const hasFullWidth = /\bw-full\b/.test(className);
  const hasFlex1 = /\bflex-1\b/.test(className);
  const isMatrix = /\bmatrix-numeric-input\b/.test(className);
  const isServicesSummary = /\bservices-summary-numeric-input\b/.test(className);

  return (
    <div
      dir="ltr"
      data-focused={focused && isInteractive ? 'true' : 'false'}
      className={`smart-numeric-input saaed-spin-wrapper ${
        isMatrix ? 'smart-numeric-input--matrix' : ''
      } ${
        isServicesSummary ? 'smart-numeric-input--services-summary' : ''
      } ${hasFullWidth ? 'w-full' : ''} ${hasFlex1 ? 'flex-1' : ''}`.trim()}
    >
      <input
        {...rest}
        ref={inputRef}
        type="text"
        role="spinbutton"
        aria-label={ariaLabel || rest['aria-label']}
        aria-valuenow={currentNumeric}
        aria-valuemin={min}
        aria-valuemax={max}
        inputMode={isDecimal ? 'decimal' : 'numeric'}
        dir="ltr"
        disabled={disabled}
        readOnly={readOnly}
        value={focused ? draftText : formatInputValue(currentNumeric, resolvedPrecision)}
        onFocus={(e) => {
          setFocused(true);
          setDraftText(formatInputValue(latestValueRef.current, resolvedPrecision));
          onFocus?.(e);
        }}
        onChange={(e) => {
          if (!isInteractive) return;
          const { display, numeric } = sanitizeDraft(e.target.value);
          setDraftText(display);
          emitValue(numeric);
        }}
        onBlur={(e) => {
          stopHoldTimer();
          setFocused(false);
          const { numeric } = sanitizeDraft(draftText);
          setDraftText(formatInputValue(numeric, resolvedPrecision));
          if (numeric !== latestValueRef.current) {
            emitValue(numeric);
          }
          onBlur?.(e);
        }}
        onKeyDown={(e) => {
          if (isInteractive && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
            e.preventDefault();
            stepByDirection(e.key === 'ArrowUp' ? 1 : -1);
          }
          onKeyDown?.(e);
        }}
        className={`tabular-nums smart-numeric-field saaed-spin-input ${
          isInteractive ? 'smart-numeric-field--editable saaed-spin-input--editable' : ''
        } ${isDecimal ? 'smart-numeric-field--decimal' : ''} ${className}`.trim()}
      />

      {isInteractive && (
        <div className="smart-numeric-controls saaed-spin-rail no-print" dir="ltr">
          <button
            type="button"
            tabIndex={-1}
            disabled={!canIncrement}
            aria-label={`زيادة ${baseAriaLabel}`}
            title="زيادة"
            onPointerDown={(e) => {
              e.preventDefault();
              if (e.button === 0) startHold(1);
            }}
            onPointerUp={stopHoldTimer}
            onPointerLeave={stopHoldTimer}
            onPointerCancel={stopHoldTimer}
            onClick={(e) => {
              if (e.detail === 0) {
                if (document.activeElement !== inputRef.current) {
                  inputRef.current?.focus();
                }
                stepByDirection(1);
              }
            }}
            className="smart-numeric-btn smart-numeric-btn--up saaed-spin-btn saaed-spin-btn--up"
          >
            <svg viewBox="0 0 10 6" className="smart-numeric-arrow saaed-spin-arrow" aria-hidden="true">
              <path d="M5 0.8L9.2 5.2H0.8L5 0.8Z" fill="currentColor" />
            </svg>
          </button>

          <button
            type="button"
            tabIndex={-1}
            disabled={!canDecrement}
            aria-label={`إنقاص ${baseAriaLabel}`}
            title="إنقاص"
            onPointerDown={(e) => {
              e.preventDefault();
              if (e.button === 0) startHold(-1);
            }}
            onPointerUp={stopHoldTimer}
            onPointerLeave={stopHoldTimer}
            onPointerCancel={stopHoldTimer}
            onClick={(e) => {
              if (e.detail === 0) {
                if (document.activeElement !== inputRef.current) {
                  inputRef.current?.focus();
                }
                stepByDirection(-1);
              }
            }}
            className="smart-numeric-btn smart-numeric-btn--down saaed-spin-btn saaed-spin-btn--down"
          >
            <svg viewBox="0 0 10 6" className="smart-numeric-arrow saaed-spin-arrow" aria-hidden="true">
              <path d="M5 5.2L0.8 0.8H9.2L5 5.2Z" fill="currentColor" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
};
