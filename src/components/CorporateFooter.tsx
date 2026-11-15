import React, { useState } from 'react';
import footerBackdropPng from '../assets/images/saaed_footer_visual_bg.png';
import footerBackdropWebp from '../assets/images/saaed_footer_visual_bg.webp';

interface CorporateFooterProps {
  className?: string;
}

export const CorporateFooter: React.FC<CorporateFooterProps> = ({ className = '' }) => {
  const [backdropFailed, setBackdropFailed] = useState(false);

  return (
    <footer
      className={`executive-footer saaed-executive-footer ${className}`.trim()}
      dir="ltr"
    >
      {/* Zone 1 (Left ~24%): 4K Super-Resolved Engineering Visual (Helmet, Rolled Blueprints, CAD Sheets & Curved Gold Ribbons) */}
      <div className="saaed-executive-footer__visual" aria-hidden="true">
        {!backdropFailed ? (
          <picture>
            <source srcSet={footerBackdropWebp} type="image/webp" />
            <img
              src={footerBackdropPng}
              alt=""
              className="saaed-executive-footer__visual-img"
              width={2280}
              height={660}
              draggable={false}
              referrerPolicy="no-referrer"
              onError={() => setBackdropFailed(true)}
            />
          </picture>
        ) : (
          <div className="saaed-executive-footer__visual-fallback" />
        )}
      </div>

      {/* Subtle Executive Bottom Accent Line */}
      <div className="saaed-executive-footer__divider" aria-hidden="true" />

      {/* Grid Spacer for Left Visual Column on Desktop */}
      <div className="saaed-executive-footer__left-slot" aria-hidden="true" />

      {/* Zone 2 (Center ~42%): Department & Section Information (Real Selectable HTML Text) */}
      <div className="saaed-executive-footer__center footer-center-text">
        <div className="saaed-executive-footer__arabic footer-ar" lang="ar" dir="rtl">
          إدارة الخدمات العامة <span className="saaed-executive-footer__pipe footer-pipe">|</span> قسم إدارة المرافق
        </div>
        <div className="saaed-executive-footer__english footer-en" lang="en" dir="ltr">
          General Services Department <span className="saaed-executive-footer__pipe footer-pipe">|</span> Facilities Management
        </div>
      </div>

      {/* Zone 3 (Right ~34%): Designer Credit + Compact 16px Gold Pen Icon */}
      <div className="saaed-executive-footer__right footer-right-text">
        <div className="saaed-executive-footer__credit footer-right-lines">
          <div className="saaed-executive-footer__arabic footer-ar" lang="ar" dir="rtl">
            إعداد وتصميم: خالد الهاشمي
          </div>
          <div className="saaed-executive-footer__english footer-en" lang="en" dir="ltr">
            Prepared &amp; Designed by Khaled Al Hashemi
          </div>
        </div>

        <div className="saaed-executive-footer__pen footer-pen-icon" aria-hidden="true">
          <svg viewBox="0 0 26 26" className="saaed-executive-footer__pen-svg footer-pen-svg" focusable="false">
            <defs>
              <linearGradient id="saaedFooterGoldPen" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#F0D38C" />
                <stop offset="52%" stopColor="#D3AD5E" />
                <stop offset="100%" stopColor="#B38A3A" />
              </linearGradient>
            </defs>
            <path
              d="M19.8 1.5L24.5 6.2L22.1 8.6L17.4 3.9L19.8 1.5Z"
              fill="url(#saaedFooterGoldPen)"
            />
            <path
              d="M15.9 5.4L20.6 10.1L10.3 20.4L5.6 15.7L15.9 5.4Z"
              fill="url(#saaedFooterGoldPen)"
            />
            <path
              d="M4.2 17.1L8.9 21.8L2.0 24.0L4.2 17.1Z"
              fill="url(#saaedFooterGoldPen)"
            />
          </svg>
        </div>
      </div>
    </footer>
  );
};

export const ExecutiveFooter = CorporateFooter;

