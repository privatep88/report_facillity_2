import saherLogoMarkPng from '../assets/images/saher_logo_mark.png';
import saherLogoMarkWebp from '../assets/images/saher_logo_mark.webp';
import saherHeaderBackdropPng from '../assets/images/saher_header_visual_bg.png';
import saherHeaderBackdropWebp from '../assets/images/saher_header_visual_bg.webp';

/**
 * Centralized Enterprise Brand Identity Configuration — SAHER (ساهر)
 * Single source of truth for logo assets, brand naming, and corporate metadata
 * across UI headers, tabs, modals, previews, print views, and PDF/Excel exports.
 */
export const BRAND_IDENTITY = {
  shortNameAr: 'ساهر',
  shortNameEn: 'SAHER',
  companyNameAr: 'ساهر للخدمات الإلكترونية',
  companyNameEn: 'SAHER ELECTRONIC SERVICES',
  companyFullAr: 'شركة ساهر للخدمات الإلكترونية',
  companyTagAr: 'شركة ساهر SAHER',
  companyDisplayPair: 'ساهر للخدمات الإلكترونية — SAHER',
  companyPipePair: 'ساهر للخدمات الإلكترونية | SAHER ELECTRONIC SERVICES',
  systemTitleEn: 'SAHER Facilities Management Executive Reporting System',
  systemSubtitleAr: 'نظام ساهر لإدارة المرافق · التوقيع الإلكتروني الموثق',
  logoPng: saherLogoMarkPng,
  logoWebp: saherLogoMarkWebp,
  headerBackdropPng: saherHeaderBackdropPng,
  headerBackdropWebp: saherHeaderBackdropWebp,
  logoAltAr: 'شعار ساهر — SAHER',
  logoOfficialAltAr: 'شعار شركة ساهر الرسمي',
  headerBackdropAltAr: 'المقر الرئيسي لشركة ساهر للخدمات الإلكترونية — إدارة المرافق',
} as const;
