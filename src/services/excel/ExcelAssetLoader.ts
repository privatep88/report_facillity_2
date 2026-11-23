import engineerImg from '../../assets/images/engineer_tablet_inspector_1794730112530.jpg';
import engineeringImg from '../../assets/images/facility_engineering_ops_1794728989361.jpg';
import receptionImg from '../../assets/images/facility_reception_hall_1794728988518.jpg';
import safetyLogisticsImg from '../../assets/images/facility_safety_logistics_1794728989271.jpg';
import fireExtImg from '../../assets/images/fire_extinguisher_safety_1794730113921.jpg';
import technicianImg from '../../assets/images/technician_electrical_panel_1794730113102.jpg';
import saaedFooterVisualPng from '../../assets/images/saaed_footer_visual_bg.png';
import saaedHeaderVisualPng from '../../assets/images/saher_header_visual_bg.png';
import saaedLogoMarkPng from '../../assets/images/saher_logo_mark.png';
import analyticsHeroImg from '../../assets/images/analytics_hero_banner_1794843950299.jpg';
import analyticsServicesImg from '../../assets/images/analytics_services_hub_1794843952722.jpg';
import analyticsMaintImg from '../../assets/images/analytics_maintenance_ops_1794843950412.jpg';
import analyticsRiskImg from '../../assets/images/analytics_risk_safety_1794843951648.jpg';
import analyticsBoardroomImg from '../../assets/images/analytics_boardroom_strategy_1794843952613.jpg';
import {
  EXECUTIVE_KPI_IMAGES,
  resolveTopServiceKpiImage,
} from '../../utils/executiveKpiVisuals.ts';

export interface LoadedExcelImage {
  base64: string;
  extension: 'png' | 'jpeg';
  width: number;
  height: number;
}

const imageAssetCache = new Map<string, Promise<LoadedExcelImage | null>>();

function readFileAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string' && reader.result.startsWith('data:')) {
        resolve(reader.result);
      } else {
        reject(new Error('Failed to read blob as data URL'));
      }
    };
    reader.onerror = () => reject(reader.error || new Error('FileReader error'));
    reader.readAsDataURL(blob);
  });
}

function loadHtmlImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to decode image'));
    img.src = src;
  });
}

async function normalizeToExcelImage(
  src: string,
  options?: { maxWidth?: number; maxHeight?: number; forcePng?: boolean }
): Promise<LoadedExcelImage | null> {
  if (!src) return null;
  const maxWidth = options?.maxWidth ?? 900;
  const maxHeight = options?.maxHeight ?? 500;

  try {
    let dataUrl = src;
    if (!src.startsWith('data:')) {
      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), 5000);
      try {
        const res = await fetch(src, { signal: controller.signal });
        if (!res.ok) return null;
        const blob = await res.blob();
        dataUrl = await readFileAsDataUrl(blob);
      } finally {
        window.clearTimeout(timer);
      }
    }

    const img = await loadHtmlImage(dataUrl);
    const natW = img.naturalWidth || 320;
    const natH = img.naturalHeight || 180;
    const isPng = dataUrl.startsWith('data:image/png');
    const isJpeg = dataUrl.startsWith('data:image/jpeg') || dataUrl.startsWith('data:image/jpg');

    const needsResize = natW > maxWidth || natH > maxHeight;
    const needsFormatConvert = (!isPng && !isJpeg) || (options?.forcePng && !isPng);

    if (!needsResize && !needsFormatConvert) {
      return {
        base64: dataUrl,
        extension: isPng ? 'png' : 'jpeg',
        width: natW,
        height: natH,
      };
    }

    const ratio = Math.min(1, maxWidth / natW, maxHeight / natH);
    const targetW = Math.max(2, Math.round(natW * ratio));
    const targetH = Math.max(2, Math.round(natH * ratio));
    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      if (isPng || isJpeg) {
        return {
          base64: dataUrl,
          extension: isPng ? 'png' : 'jpeg',
          width: natW,
          height: natH,
        };
      }
      return null;
    }

    ctx.clearRect(0, 0, targetW, targetH);
    ctx.drawImage(img, 0, 0, targetW, targetH);

    // Preserve alpha as PNG for logos/signatures/headers; JPEG keeps photos compact
    const outputMime = isJpeg && !options?.forcePng ? 'image/jpeg' : 'image/png';
    const normalizedDataUrl =
      outputMime === 'image/jpeg'
        ? canvas.toDataURL('image/jpeg', 0.9)
        : canvas.toDataURL('image/png');

    return {
      base64: normalizedDataUrl,
      extension: outputMime === 'image/jpeg' ? 'jpeg' : 'png',
      width: targetW,
      height: targetH,
    };
  } catch {
    return null;
  }
}

export function loadExcelImageAsset(
  src: string,
  options?: { maxWidth?: number; maxHeight?: number; forcePng?: boolean }
): Promise<LoadedExcelImage | null> {
  if (!src) return Promise.resolve(null);
  const cacheKey = `${src}::${options?.maxWidth ?? 900}x${options?.maxHeight ?? 500}::${options?.forcePng ? 1 : 0}`;
  const cached = imageAssetCache.get(cacheKey);
  if (cached) return cached;

  const task = normalizeToExcelImage(src, options).catch(() => null);
  imageAssetCache.set(cacheKey, task);
  return task;
}

export async function loadSignatureImageAsset(
  src: string | null | undefined
): Promise<LoadedExcelImage | null> {
  if (!src || !src.trim()) return null;
  return normalizeToExcelImage(src.trim(), {
    maxWidth: 420,
    maxHeight: 160,
    forcePng: true,
  });
}

export interface ReportExcelVisualAssets {
  logo: LoadedExcelImage | null;
  headerBg: LoadedExcelImage | null;
  footerBg: LoadedExcelImage | null;
  kpiTotalRequests: LoadedExcelImage | null;
  kpiTopService: LoadedExcelImage | null;
  kpiTotalServices: LoadedExcelImage | null;
  kpiCompletionRate: LoadedExcelImage | null;
  engineer: LoadedExcelImage | null;
  engineeringOps: LoadedExcelImage | null;
  technician: LoadedExcelImage | null;
  safetyLogistics: LoadedExcelImage | null;
  receptionHall: LoadedExcelImage | null;
  fireExtinguisher: LoadedExcelImage | null;
  preparerSignature: LoadedExcelImage | null;
  approverSignature: LoadedExcelImage | null;
}

export async function loadReportExcelVisualAssets(params: {
  topService?: { serviceId?: string; nameAr?: string; nameEn?: string } | null;
  preparerSignatureImage?: string | null;
  approverSignatureImage?: string | null;
}): Promise<ReportExcelVisualAssets> {
  const topServiceAsset = resolveTopServiceKpiImage(params.topService);

  const [
    logo,
    headerBg,
    footerBg,
    kpiTotalRequests,
    kpiTopService,
    kpiTotalServices,
    kpiCompletionRate,
    engineer,
    engineeringOps,
    technician,
    safetyLogistics,
    receptionHall,
    fireExtinguisher,
    preparerSignature,
    approverSignature,
  ] = await Promise.all([
    loadExcelImageAsset(saaedLogoMarkPng, { maxWidth: 400, maxHeight: 220, forcePng: true }),
    loadExcelImageAsset(saaedHeaderVisualPng, { maxWidth: 1200, maxHeight: 220, forcePng: true }),
    loadExcelImageAsset(saaedFooterVisualPng, { maxWidth: 720, maxHeight: 200, forcePng: true }),
    loadExcelImageAsset(EXECUTIVE_KPI_IMAGES.totalRequests.src, { maxWidth: 420, maxHeight: 220 }),
    loadExcelImageAsset(topServiceAsset.src, { maxWidth: 420, maxHeight: 220 }),
    loadExcelImageAsset(EXECUTIVE_KPI_IMAGES.totalServices.src, { maxWidth: 420, maxHeight: 220 }),
    loadExcelImageAsset(EXECUTIVE_KPI_IMAGES.monthlyCompletion.src, { maxWidth: 420, maxHeight: 220 }),
    loadExcelImageAsset(engineerImg, { maxWidth: 460, maxHeight: 340 }),
    loadExcelImageAsset(engineeringImg, { maxWidth: 280, maxHeight: 200 }),
    loadExcelImageAsset(technicianImg, { maxWidth: 360, maxHeight: 260 }),
    loadExcelImageAsset(safetyLogisticsImg, { maxWidth: 280, maxHeight: 200 }),
    loadExcelImageAsset(receptionImg, { maxWidth: 280, maxHeight: 200 }),
    loadExcelImageAsset(fireExtImg, { maxWidth: 280, maxHeight: 200 }),
    loadSignatureImageAsset(params.preparerSignatureImage),
    loadSignatureImageAsset(params.approverSignatureImage),
  ]);

  return {
    logo,
    headerBg,
    footerBg,
    kpiTotalRequests,
    kpiTopService,
    kpiTotalServices,
    kpiCompletionRate,
    engineer,
    engineeringOps,
    technician,
    safetyLogistics,
    receptionHall,
    fireExtinguisher,
    preparerSignature,
    approverSignature,
  };
}

export interface AnalyticsExcelVisualAssets {
  logo: LoadedExcelImage | null;
  footerBg: LoadedExcelImage | null;
  heroBanner: LoadedExcelImage | null;
  servicesHub: LoadedExcelImage | null;
  maintenanceOps: LoadedExcelImage | null;
  riskSafety: LoadedExcelImage | null;
  boardroom: LoadedExcelImage | null;
}

export async function loadAnalyticsExcelVisualAssets(): Promise<AnalyticsExcelVisualAssets> {
  const [logo, footerBg, heroBanner, servicesHub, maintenanceOps, riskSafety, boardroom] =
    await Promise.all([
      loadExcelImageAsset(saaedLogoMarkPng, { maxWidth: 400, maxHeight: 220, forcePng: true }),
      loadExcelImageAsset(saaedFooterVisualPng, { maxWidth: 720, maxHeight: 200, forcePng: true }),
      loadExcelImageAsset(analyticsHeroImg, { maxWidth: 520, maxHeight: 260 }),
      loadExcelImageAsset(analyticsServicesImg, { maxWidth: 520, maxHeight: 260 }),
      loadExcelImageAsset(analyticsMaintImg, { maxWidth: 520, maxHeight: 260 }),
      loadExcelImageAsset(analyticsRiskImg, { maxWidth: 520, maxHeight: 260 }),
      loadExcelImageAsset(analyticsBoardroomImg, { maxWidth: 520, maxHeight: 260 }),
    ]);

  return {
    logo,
    footerBg,
    heroBanner,
    servicesHub,
    maintenanceOps,
    riskSafety,
    boardroom,
  };
}
