import React from 'react';

export const AnalyticsSectionFrame: React.FC<{
  id: string;
  sectionNumber: string;
  titleAr: string;
  titleEn: string;
  subtitleAr?: string;
  imageSrc?: string;
  imageAlt?: string;
  badgeText?: string;
  children: React.ReactNode;
}> = ({
  id,
  sectionNumber,
  titleAr,
  titleEn,
  subtitleAr,
  imageSrc,
  imageAlt,
  badgeText,
  children,
}) => {
  return (
    <section
      id={id}
      className="scroll-mt-24 rounded-2xl bg-white border border-slate-200/90 shadow-xs overflow-hidden"
    >
      <div className="bg-gradient-to-l from-[#0B2341] via-[#102E54] to-[#0B2341] px-4 sm:px-5 py-3.5 border-b-2 border-[#C8A85D] flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span
            dir="ltr"
            className="w-9 h-9 rounded-lg bg-[#C8A85D] text-[#0B2341] font-extrabold text-sm flex items-center justify-center shrink-0 tabular-nums shadow-xs"
          >
            {sectionNumber}
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-2">
              <h2 className="text-sm sm:text-base font-extrabold text-white tracking-tight">
                {titleAr}
              </h2>
              <span dir="ltr" className="text-[11px] font-semibold text-[#F0D38C]/90">
                {titleEn}
              </span>
            </div>
            {subtitleAr && (
              <p className="text-[11.5px] text-slate-300 mt-0.5 leading-snug">{subtitleAr}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {badgeText && (
            <span className="text-[11px] font-bold text-[#F0D38C] bg-white/10 border border-white/15 px-2.5 py-1 rounded-lg whitespace-nowrap">
              {badgeText}
            </span>
          )}
          {imageSrc && (
            <div className="hidden sm:block w-20 h-12 rounded-lg overflow-hidden border border-[#C8A85D]/50 bg-[#071930] shrink-0">
              <img
                src={imageSrc}
                alt={imageAlt || titleAr}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            </div>
          )}
        </div>
      </div>

      <div className="p-4 sm:p-5 space-y-4">{children}</div>
    </section>
  );
};
