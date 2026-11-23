import React, { useState } from 'react';
import { BRAND_IDENTITY } from '../config/brandIdentity.ts';

interface SaaedExecutiveHeaderProps {
  className?: string;
}

export const SaaedExecutiveHeader: React.FC<SaaedExecutiveHeaderProps> = ({ className = '' }) => {
  const [backdropFailed, setBackdropFailed] = useState(false);
  const [logoFailed, setLogoFailed] = useState(false);

  return (
    <header className={`saaed-executive-header ${className}`.trim()} dir="ltr">
      {/* Layer 1: High-Resolution 4K Visual Backdrop (Building, UAE Flag, Restored Skyline & Navy Gradient) */}
      <div className="header-visual" aria-hidden="true">
        {!backdropFailed ? (
          <picture>
            <source srcSet={BRAND_IDENTITY.headerBackdropWebp} type="image/webp" />
            <img
              src={BRAND_IDENTITY.headerBackdropPng}
              alt={BRAND_IDENTITY.headerBackdropAltAr}
              className="header-backdrop-img"
              width={4796}
              height={532}
              decoding="sync"
              draggable={false}
              referrerPolicy="no-referrer"
              onError={() => setBackdropFailed(true)}
            />
          </picture>
        ) : (
          <div className="header-backdrop-fallback" />
        )}

        {/* Vector Metallic Gold Diagonal Ribbons & Pure White Right Wing (Desktop & Print geometry) */}
        <svg
          className="header-ribbons-svg"
          viewBox="0 0 1199 133"
          preserveAspectRatio="none"
          focusable="false"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id="saaedHeaderGoldRibbon" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#F5D98A" />
              <stop offset="45%" stopColor="#DFB357" />
              <stop offset="100%" stopColor="#A97B27" />
            </linearGradient>
          </defs>
          {/* Left Metallic Gold Diagonal Accent */}
          <polygon points="405,0 422,0 302,133 285,133" fill="url(#saaedHeaderGoldRibbon)" />
          {/* Right Metallic Gold Diagonal Accent */}
          <polygon points="984,0 1001,0 897,133 880,133" fill="url(#saaedHeaderGoldRibbon)" />
          {/* Pure White Right Brand Wing */}
          <polygon points="1001,0 1199,0 1199,133 897,133" fill="#FFFFFF" />
        </svg>

        {/* Subtle Bottom Edge Highlight Accent */}
        <div className="header-bottom-edge" />
      </div>

      {/* Layer 2: Real Selectable HTML Typography + Vector Emblem + Official SAAED Logo */}
      <div className="header-foreground">
        {/* Center Zone: Vector Gold Architectural Emblem + Official Report Titles */}
        <div className="header-content">
          {/* Vector Gold Building & Gear Architectural Emblem */}
          <div className="header-emblem" aria-hidden="true">
            <svg viewBox="0 0 76 68" className="header-emblem-svg" focusable="false">
              <defs>
                <linearGradient id="saaedGoldEmblem" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#F5D98A" />
                  <stop offset="55%" stopColor="#DFB357" />
                  <stop offset="100%" stopColor="#BE8E33" />
                </linearGradient>
              </defs>
              {/* Left Medium Tower */}
              <path
                d="M11 61V24L25 18V61"
                fill="none"
                stroke="url(#saaedGoldEmblem)"
                strokeWidth="2.4"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {/* Tall Center-Right Tower */}
              <path
                d="M25 61V7L43 13V42"
                fill="none"
                stroke="url(#saaedGoldEmblem)"
                strokeWidth="2.6"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {/* Stepped Left Accent Wing */}
              <path
                d="M4 61V37H11"
                fill="none"
                stroke="url(#saaedGoldEmblem)"
                strokeWidth="2.2"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {/* Architectural Window Slots */}
              <g stroke="url(#saaedGoldEmblem)" strokeWidth="2.1" strokeLinecap="round">
                <line x1="16" y1="28" x2="16" y2="33" />
                <line x1="20" y1="26" x2="20" y2="31" />
                <line x1="16" y1="38" x2="16" y2="43" />
                <line x1="20" y1="36" x2="20" y2="41" />
                <line x1="16" y1="48" x2="16" y2="53" />
                <line x1="20" y1="46" x2="20" y2="51" />
                <line x1="30" y1="16" x2="30" y2="21" />
                <line x1="36" y1="18" x2="36" y2="23" />
                <line x1="30" y1="26" x2="30" y2="31" />
                <line x1="36" y1="28" x2="36" y2="33" />
                <line x1="30" y1="36" x2="30" y2="41" />
                <line x1="36" y1="38" x2="36" y2="43" />
              </g>
              {/* 8-Tooth Precision Gear with Hollow Transparent Center */}
              <path
                fillRule="evenodd"
                fill="url(#saaedGoldEmblem)"
                d="M48.5 34.5L52.5 34.5L53.4 38.1C54.6 38.4 55.7 38.9 56.7 39.5L59.9 37.6L62.7 40.4L60.8 43.6C61.4 44.6 61.9 45.7 62.2 46.9L65.8 47.8V51.8L62.2 52.7C61.9 53.9 61.4 55.0 60.8 56.0L62.7 59.2L59.9 62.0L56.7 60.1C55.7 60.7 54.6 61.2 53.4 61.5L52.5 65.1H48.5L47.6 61.5C46.4 61.2 45.3 60.7 44.3 60.1L41.1 62.0L38.3 59.2L40.2 56.0C39.6 55.0 39.1 53.9 38.8 52.7L35.2 51.8V47.8L38.8 46.9C39.1 45.7 39.6 44.6 40.2 43.6L38.3 40.4L41.1 37.6L44.3 39.5C45.3 38.9 46.4 38.4 47.6 38.1L48.5 34.5ZM50.5 43.3C46.9 43.3 44.0 46.2 44.0 49.8C44.0 53.4 46.9 56.3 50.5 56.3C54.1 56.3 57.0 53.4 57.0 49.8C57.0 46.2 54.1 43.3 50.5 43.3Z"
              />
            </svg>
          </div>

          <div className="header-title-group">
            <h1 lang="ar" dir="rtl">
              التقرير الشهري لقسم إدارة المرافق
            </h1>

            <p lang="en" dir="ltr">
              Facilities Management Monthly Executive Report
            </p>

            <div className="header-title-divider" aria-hidden="true" />

            <div className="header-department" dir="ltr">
              <span lang="ar" dir="rtl">
                إدارة الخدمات العامة
              </span>
              <span className="header-department-sep" aria-hidden="true">
                |
              </span>
              <span lang="en" dir="ltr">
                General Services Department
              </span>
            </div>
          </div>
        </div>

        {/* Right Zone: Official SAHER Brand Wing on the Visual Right */}
        <div className="header-brand">
          {!logoFailed ? (
            <picture>
              <source srcSet={BRAND_IDENTITY.logoWebp} type="image/webp" />
              <img
                src={BRAND_IDENTITY.logoPng}
                alt={BRAND_IDENTITY.logoAltAr}
                className="header-brand-logo"
                draggable={false}
                referrerPolicy="no-referrer"
                onError={() => setLogoFailed(true)}
              />
            </picture>
          ) : (
            <span lang="en" dir="ltr" className="header-brand-fallback-logo">
              {BRAND_IDENTITY.shortNameEn} {BRAND_IDENTITY.shortNameAr}
            </span>
          )}

          <span lang="ar" dir="rtl" className="header-brand-ar">
            {BRAND_IDENTITY.companyNameAr}
          </span>

          <span lang="en" dir="ltr" className="header-brand-en">
            {BRAND_IDENTITY.companyNameEn}
          </span>
        </div>
      </div>
    </header>
  );
};
