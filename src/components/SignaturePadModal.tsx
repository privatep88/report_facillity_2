import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Check,
  Eraser,
  ImagePlus,
  Loader2,
  PenTool,
  RotateCcw,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';

interface StrokePoint {
  x: number;
  y: number;
  t: number;
  pressure: number;
}

interface StrokePath {
  color: string;
  baseWidth: number;
  points: StrokePoint[];
}

export interface SignaturePadModalProps {
  open: boolean;
  initialMode: 'draw' | 'upload';
  signerLabel: string;
  signerName: string;
  currentSignature: string | null;
  saving: boolean;
  onClose: () => void;
  onSave: (signatureDataUrl: string | null) => Promise<void>;
}

const INK_COLORS = [
  { value: '#0B2341', label: 'كحلي رسمي' },
  { value: '#1D4ED8', label: 'أزرق توقيع' },
  { value: '#0F172A', label: 'أسود حبري' },
] as const;

const PEN_WIDTHS = [
  { value: 2.2, label: 'رفيع' },
  { value: 3.4, label: 'متوسط' },
  { value: 5.0, label: 'عريض' },
] as const;

function processUploadedImage(
  img: HTMLImageElement,
  removeWhiteBg: boolean
): string {
  const maxW = 720;
  const maxH = 260;
  const naturalW = img.naturalWidth || img.width || 400;
  const naturalH = img.naturalHeight || img.height || 160;
  const scale = Math.min(1, maxW / naturalW, maxH / naturalH);
  const w = Math.max(1, Math.round(naturalW * scale));
  const h = Math.max(1, Math.round(naturalH * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);

  if (removeWhiteBg) {
    const imageData = ctx.getImageData(0, 0, w, h);
    const d = imageData.data;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i];
      const g = d[i + 1];
      const b = d[i + 2];
      const a = d[i + 3];
      if (a === 0) continue;

      const maxC = Math.max(r, g, b);
      const minC = Math.min(r, g, b);
      const sat = maxC - minC;
      const luma = (r + g + b) / 3;

      if (luma >= 228 && sat <= 30) {
        d[i + 3] = 0;
      } else if (luma >= 188 && sat <= 38) {
        const factor = (228 - luma) / 40;
        d[i + 3] = Math.round(a * Math.max(0, Math.min(1, factor)));
      }
    }
    ctx.putImageData(imageData, 0, 0);
  }

  // Tight-crop non-transparent bounds with comfortable padding
  const croppedData = ctx.getImageData(0, 0, w, h).data;
  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (croppedData[(y * w + x) * 4 + 3] > 8) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < minX || maxY < minY) {
    return canvas.toDataURL('image/png');
  }

  const pad = 10;
  const sx = Math.max(0, minX - pad);
  const sy = Math.max(0, minY - pad);
  const sw = Math.min(w - sx, maxX - minX + 1 + pad * 2);
  const sh = Math.min(h - sy, maxY - minY + 1 + pad * 2);

  const out = document.createElement('canvas');
  out.width = sw;
  out.height = sh;
  const oCtx = out.getContext('2d');
  if (!oCtx) return canvas.toDataURL('image/png');
  oCtx.drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);
  return out.toDataURL('image/png');
}

function drawSmoothStroke(ctx: CanvasRenderingContext2D, stroke: StrokePath) {
  const pts = stroke.points;
  if (pts.length === 0) return;

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = stroke.color;
  ctx.fillStyle = stroke.color;

  if (pts.length === 1) {
    ctx.beginPath();
    ctx.arc(pts[0].x, pts[0].y, stroke.baseWidth * 0.65, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }

  let prevWidth = stroke.baseWidth;
  for (let i = 1; i < pts.length; i++) {
    const p0 = pts[i - 1];
    const p1 = pts[i];
    const p2 = pts[i + 1];

    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;
    const dist = Math.hypot(dx, dy);
    const dt = Math.max(1, p1.t - p0.t);
    const velocity = dist / dt; // px per ms

    let targetWidth = stroke.baseWidth * Math.max(0.42, Math.min(1.32, 1.24 - velocity * 0.36));
    if (p1.pressure > 0 && p1.pressure !== 0.5) {
      targetWidth = stroke.baseWidth * (0.45 + p1.pressure * 1.1);
    }
    const width = prevWidth * 0.65 + targetWidth * 0.35;
    prevWidth = width;

    const startX = i === 1 ? p0.x : (pts[i - 2].x + p0.x) / 2;
    const startY = i === 1 ? p0.y : (pts[i - 2].y + p0.y) / 2;
    const endX = p2 ? (p0.x + p1.x) / 2 : p1.x;
    const endY = p2 ? (p0.y + p1.y) / 2 : p1.y;

    ctx.beginPath();
    ctx.lineWidth = width;
    ctx.moveTo(startX, startY);
    ctx.quadraticCurveTo(p0.x, p0.y, endX, endY);
    ctx.stroke();
  }

  ctx.restore();
}

export const SignaturePadModal: React.FC<SignaturePadModalProps> = ({
  open,
  initialMode,
  signerLabel,
  signerName,
  currentSignature,
  saving,
  onClose,
  onSave,
}) => {
  const [mode, setMode] = useState<'draw' | 'upload'>(initialMode);
  const [inkColor, setInkColor] = useState<string>(INK_COLORS[0].value);
  const [penWidth, setPenWidth] = useState<number>(PEN_WIDTHS[1].value);
  const [strokeCount, setStrokeCount] = useState(0);

  // Upload state
  const [uploadedRawImg, setUploadedRawImg] = useState<HTMLImageElement | null>(null);
  const [removeWhiteBg, setRemoveWhiteBg] = useState(true);
  const [uploadPreviewUrl, setUploadPreviewUrl] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const strokesRef = useRef<StrokePath[]>([]);
  const activeStrokeRef = useRef<StrokePath | null>(null);
  const drawingPointerIdRef = useRef<number | null>(null);

  useEffect(() => {
    if (!open) return;
    setMode(initialMode);
    setErrorMsg(null);
    setUploadedRawImg(null);
    setUploadPreviewUrl(null);
    strokesRef.current = [];
    activeStrokeRef.current = null;
    drawingPointerIdRef.current = null;
    setStrokeCount(0);
  }, [open, initialMode]);

  const redrawAllStrokes = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.scale(dpr, dpr);

    for (const stroke of strokesRef.current) {
      drawSmoothStroke(ctx, stroke);
    }
    if (activeStrokeRef.current) {
      drawSmoothStroke(ctx, activeStrokeRef.current);
    }
    ctx.restore();
  }, []);

  const syncCanvasDimensions = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const rect = container.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const targetW = Math.round(rect.width * dpr);
    const targetH = Math.round(rect.height * dpr);

    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
      redrawAllStrokes();
    }
  }, [redrawAllStrokes]);

  useEffect(() => {
    if (!open || mode !== 'draw') return;
    const timer = requestAnimationFrame(() => syncCanvasDimensions());
    const ro = new ResizeObserver(() => syncCanvasDimensions());
    if (containerRef.current) ro.observe(containerRef.current);
    return () => {
      cancelAnimationFrame(timer);
      ro.disconnect();
    };
  }, [open, mode, syncCanvasDimensions]);

  useEffect(() => {
    if (!uploadedRawImg) return;
    const processed = processUploadedImage(uploadedRawImg, removeWhiteBg);
    setUploadPreviewUrl(processed || null);
  }, [uploadedRawImg, removeWhiteBg]);

  if (!open) return null;

  const getLocalPoint = (e: React.PointerEvent<HTMLCanvasElement>): StrokePoint => {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      t: performance.now(),
      pressure: e.pointerType === 'pen' ? e.pressure : 0.5,
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drawingPointerIdRef.current = e.pointerId;
    setErrorMsg(null);

    const pt = getLocalPoint(e);
    activeStrokeRef.current = {
      color: inkColor,
      baseWidth: penWidth,
      points: [pt],
    };
    redrawAllStrokes();
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (drawingPointerIdRef.current !== e.pointerId || !activeStrokeRef.current) return;
    e.preventDefault();
    const pt = getLocalPoint(e);
    const pts = activeStrokeRef.current.points;
    const last = pts[pts.length - 1];
    if (last && Math.hypot(pt.x - last.x, pt.y - last.y) < 1.2) return;
    pts.push(pt);
    redrawAllStrokes();
  };

  const finishStroke = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (drawingPointerIdRef.current !== e.pointerId || !activeStrokeRef.current) return;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    strokesRef.current.push(activeStrokeRef.current);
    activeStrokeRef.current = null;
    drawingPointerIdRef.current = null;
    setStrokeCount(strokesRef.current.length);
    redrawAllStrokes();
  };

  const handleUndo = () => {
    if (strokesRef.current.length === 0) return;
    strokesRef.current.pop();
    setStrokeCount(strokesRef.current.length);
    redrawAllStrokes();
  };

  const handleClear = () => {
    strokesRef.current = [];
    activeStrokeRef.current = null;
    setStrokeCount(0);
    redrawAllStrokes();
  };

  const handleFileLoad = (file: File | null | undefined) => {
    if (!file) return;
    setErrorMsg(null);
    if (!file.type.startsWith('image/')) {
      setErrorMsg('يرجى اختيار ملف صورة صالح (PNG أو JPG أو WEBP أو SVG).');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setErrorMsg('حجم الصورة كبير جداً. يرجى اختيار صورة أقل من 5 ميجابايت.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const src = typeof reader.result === 'string' ? reader.result : '';
      if (!src) {
        setErrorMsg('تعذر قراءة ملف الصورة.');
        return;
      }
      const img = new Image();
      img.onload = () => {
        setUploadedRawImg(img);
      };
      img.onerror = () => {
        setErrorMsg('تعذر تحميل الصورة المختارة. تأكد من سلامة الملف.');
      };
      img.src = src;
    };
    reader.onerror = () => setErrorMsg('حدث خطأ أثناء قراءة الملف.');
    reader.readAsDataURL(file);
  };

  const exportDrawnPng = (): string | null => {
    const canvas = canvasRef.current;
    if (!canvas || strokesRef.current.length === 0) return null;

    const w = canvas.width;
    const h = canvas.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const data = ctx.getImageData(0, 0, w, h).data;
    let minX = w;
    let minY = h;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (data[(y * w + x) * 4 + 3] > 6) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < minX || maxY < minY) return null;

    const pad = 18;
    const sx = Math.max(0, minX - pad);
    const sy = Math.max(0, minY - pad);
    const sw = Math.min(w - sx, maxX - minX + 1 + pad * 2);
    const sh = Math.min(h - sy, maxY - minY + 1 + pad * 2);

    const maxOutW = 720;
    const maxOutH = 260;
    const scale = Math.min(1, maxOutW / sw, maxOutH / sh);
    const outW = Math.max(1, Math.round(sw * scale));
    const outH = Math.max(1, Math.round(sh * scale));

    const out = document.createElement('canvas');
    out.width = outW;
    out.height = outH;
    const oCtx = out.getContext('2d');
    if (!oCtx) return null;

    oCtx.drawImage(canvas, sx, sy, sw, sh, 0, 0, outW, outH);
    return out.toDataURL('image/png');
  };

  const handleConfirmSave = async () => {
    setErrorMsg(null);
    let dataUrl: string | null = null;
    if (mode === 'draw') {
      dataUrl = exportDrawnPng();
      if (!dataUrl) {
        setErrorMsg('يرجى رسم التوقيع داخل اللوحة أولاً قبل الحفظ.');
        return;
      }
    } else {
      dataUrl = uploadPreviewUrl;
      if (!dataUrl) {
        setErrorMsg('يرجى إرفاق صورة التوقيع أولاً قبل الحفظ.');
        return;
      }
    }

    try {
      await onSave(dataUrl);
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'تعذر حفظ التوقيع.');
    }
  };

  const handleRemoveExisting = async () => {
    setErrorMsg(null);
    try {
      await onSave(null);
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'تعذر حذف التوقيع.');
    }
  };

  const canConfirm = mode === 'draw' ? strokeCount > 0 : !!uploadPreviewUrl;

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/65 backdrop-blur-xs flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sig-modal-title"
    >
      <div className="bg-white rounded-2xl border border-[#A3C0DE] shadow-2xl w-full max-w-2xl overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-l from-[#012E5E] via-[#05366B] to-[#0E437A] text-white px-5 py-3.5 flex items-center justify-between border-b-2 border-[#C99E4A]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-white/10 border border-[#C99E4A]/60 flex items-center justify-center text-[#DFC076]">
              <PenTool className="w-4 h-4" />
            </div>
            <div>
              <h2 id="sig-modal-title" className="text-sm font-extrabold">
                إضافة التوقيع الرسمي · {signerLabel}
              </h2>
              <p className="text-[11px] text-slate-200">
                {signerName ? `الموقّع: ${signerName}` : 'التوقيع الإلكتروني المرئي للتقرير الرسمي'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="p-1.5 rounded-lg text-slate-200 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            aria-label="إغلاق"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Segmented Mode Tabs */}
          <div className="grid grid-cols-2 gap-1.5 p-1 bg-[#EEF4FA] rounded-xl border border-[#A3C0DE]/60">
            <button
              type="button"
              onClick={() => {
                setMode('draw');
                setErrorMsg(null);
              }}
              className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-extrabold transition-all cursor-pointer ${
                mode === 'draw'
                  ? 'bg-[#012E5E] text-white shadow-xs'
                  : 'text-[#012E5E] hover:bg-white/70'
              }`}
            >
              <PenTool className="w-3.5 h-3.5" />
              <span>التوقيع بالرسم الاحترافي</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('upload');
                setErrorMsg(null);
              }}
              className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-extrabold transition-all cursor-pointer ${
                mode === 'upload'
                  ? 'bg-[#012E5E] text-white shadow-xs'
                  : 'text-[#012E5E] hover:bg-white/70'
              }`}
            >
              <ImagePlus className="w-3.5 h-3.5" />
              <span>إرفاق صورة التوقيع</span>
            </button>
          </div>

          {mode === 'draw' ? (
            <div className="space-y-3">
              {/* Drawing Toolbar */}
              <div className="flex flex-wrap items-center justify-between gap-3 bg-[#F8FAFC] px-3.5 py-2.5 rounded-xl border border-slate-200">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold text-slate-600">لون الحبر:</span>
                  <div className="flex items-center gap-1.5">
                    {INK_COLORS.map((c) => (
                      <button
                        key={c.value}
                        type="button"
                        title={c.label}
                        onClick={() => setInkColor(c.value)}
                        className={`w-6 h-6 rounded-full border-2 transition-transform cursor-pointer ${
                          inkColor === c.value
                            ? 'border-[#C99E4A] scale-110 ring-2 ring-[#C99E4A]/30'
                            : 'border-white shadow-xs hover:scale-105'
                        }`}
                        style={{ backgroundColor: c.value }}
                        aria-label={c.label}
                      />
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-bold text-slate-600">السماكة:</span>
                  {PEN_WIDTHS.map((w) => (
                    <button
                      key={w.value}
                      type="button"
                      onClick={() => setPenWidth(w.value)}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-colors cursor-pointer ${
                        penWidth === w.value
                          ? 'bg-[#012E5E] text-white'
                          : 'bg-white text-slate-600 border border-slate-200 hover:border-[#1769AA]'
                      }`}
                    >
                      {w.label}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleUndo}
                    disabled={strokeCount === 0}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>تراجع</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleClear}
                    disabled={strokeCount === 0}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold bg-white border border-red-200 text-[#C43D47] hover:bg-red-50 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
                  >
                    <Eraser className="w-3 h-3" />
                    <span>مسح</span>
                  </button>
                </div>
              </div>

              {/* High-DPI Calligraphic Canvas Area */}
              <div
                ref={containerRef}
                className="relative w-full h-56 rounded-xl border-2 border-dashed border-[#A3C0DE] bg-white overflow-hidden select-none shadow-inner"
              >
                {/* Signature Guide Line (CSS only so PNG stays clean & transparent) */}
                <div
                  aria-hidden="true"
                  className="absolute inset-x-8 bottom-12 border-b border-slate-300/80 pointer-events-none flex justify-between items-end pb-1"
                >
                  <span className="text-[10px] text-slate-300 font-semibold">خط التوقيع</span>
                  <span className="text-[10px] text-slate-300 font-mono">×</span>
                </div>

                {strokeCount === 0 && (
                  <div
                    aria-hidden="true"
                    className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-slate-400/80 gap-1"
                  >
                    <PenTool className="w-5 h-5 text-[#1769AA]/40" />
                    <span className="text-xs font-semibold">
                      ارسم توقيعك هنا باستخدام الفأرة أو القلم أو اللمس
                    </span>
                  </div>
                )}

                <canvas
                  ref={canvasRef}
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={finishStroke}
                  onPointerCancel={finishStroke}
                  className="relative z-10 w-full h-full touch-none cursor-crosshair block"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Upload Dropzone */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                className="hidden"
                onChange={(e) => {
                  handleFileLoad(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />

              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragActive(true);
                }}
                onDragLeave={() => setDragActive(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragActive(false);
                  handleFileLoad(e.dataTransfer.files?.[0]);
                }}
                onClick={() => fileInputRef.current?.click()}
                className={`rounded-xl border-2 border-dashed p-5 text-center transition-colors cursor-pointer ${
                  dragActive
                    ? 'border-[#1769AA] bg-[#EAF4FC]'
                    : 'border-[#A3C0DE] bg-[#F8FAFC] hover:bg-[#EEF4FA]/70'
                }`}
              >
                <div className="w-10 h-10 rounded-full bg-white border border-[#A3C0DE] text-[#1769AA] flex items-center justify-center mx-auto mb-2 shadow-2xs">
                  <Upload className="w-5 h-5" />
                </div>
                <p className="text-xs font-extrabold text-[#012E5E]">
                  اضغط لاختيار صورة التوقيع أو اسحب الملف وأفلته هنا
                </p>
                <p className="text-[11px] text-slate-500 mt-1">
                  يدعم PNG · JPG · WEBP · SVG (الحد الأقصى 5 ميجابايت)
                </p>
              </div>

              {/* Background Transparency Option */}
              <label className="flex items-center justify-between gap-3 bg-[#F8FAFC] px-3.5 py-2.5 rounded-xl border border-slate-200 cursor-pointer">
                <div className="flex items-center gap-2 text-xs font-bold text-[#012E5E]">
                  <Sparkles className="w-4 h-4 text-[#C99E4A]" />
                  <span>إزالة الخلفية البيضاء تلقائياً (تحويل لخلفية شفافة احترافية)</span>
                </div>
                <input
                  type="checkbox"
                  checked={removeWhiteBg}
                  onChange={(e) => setRemoveWhiteBg(e.target.checked)}
                  className="w-4 h-4 accent-[#012E5E] rounded cursor-pointer"
                />
              </label>

              {/* Live Preview Frame */}
              {uploadPreviewUrl && (
                <div className="rounded-xl border border-slate-200 bg-white p-3 text-center">
                  <p className="text-[11px] font-bold text-slate-500 mb-2">
                    معاينة التوقيع بعد المعالجة
                  </p>
                  <div className="h-28 rounded-lg bg-[linear-gradient(45deg,#f8fafc_25%,transparent_25%,transparent_75%,#f8fafc_75%,#f8fafc),linear-gradient(45deg,#f8fafc_25%,transparent_25%,transparent_75%,#f8fafc_75%,#f8fafc)] bg-[length:16px_16px] bg-[position:0_0,8px_8px] border border-slate-200 flex items-center justify-center p-2">
                    <img
                      src={uploadPreviewUrl}
                      alt="معاينة صورة التوقيع"
                      className="max-h-24 max-w-full object-contain"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {errorMsg && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs font-bold text-[#C43D47]">
              {errorMsg}
            </div>
          )}

          {/* Footer Actions */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200">
            <div>
              {currentSignature && (
                <button
                  type="button"
                  disabled={saving}
                  onClick={handleRemoveExisting}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-red-200 text-[#C43D47] hover:bg-red-50 text-xs font-bold cursor-pointer disabled:opacity-50"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>حذف التوقيع الحالي</span>
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={onClose}
                className="px-4 py-2 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-bold cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="button"
                disabled={saving || !canConfirm}
                onClick={handleConfirmSave}
                className="flex items-center gap-1.5 px-5 py-2 rounded-lg bg-[#012E5E] hover:bg-[#0B3969] text-white text-xs font-extrabold shadow-xs disabled:opacity-45 cursor-pointer disabled:cursor-not-allowed"
              >
                {saving ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Check className="w-3.5 h-3.5 text-[#DFC076]" />
                )}
                <span>اعتماد وحفظ التوقيع</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
