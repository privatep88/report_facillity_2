import React from 'react';

interface SectionCardProps {
  id?: string;
  titleAr: string;
  titleEn: string;
  icon?: React.ReactNode;
  headerActions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  headerClassName?: string;
}

export const SectionCard: React.FC<SectionCardProps> = ({
  id,
  titleAr,
  titleEn,
  icon,
  headerActions,
  children,
  className = '',
  bodyClassName = 'p-3.5',
  headerClassName = 'px-3.5 py-2',
}) => {
  return (
    <section
      id={id}
      className={`scroll-mt-20 bg-[var(--surface-white)] rounded-xl border border-[#B8CEE6] shadow-[0_2px_10px_rgba(1,46,94,0.06)] overflow-hidden ${className}`}
    >
      {/* Signature Reference-Image Navy Header Bar with Slanted Gold Stripes on Left */}
      <div className={`relative flex items-center justify-between gap-2 bg-gradient-to-l from-[#04244B] via-[#083366] to-[#0E437A] text-white border-b-2 border-[#C99E4A]/80 overflow-hidden ${headerClassName}`}>
        {/* Double Diagonal Gold Accent Stripes on Left Edge */}
        <div
          aria-hidden="true"
          className="hidden sm:block absolute left-3.5 top-0 bottom-0 w-3.5 bg-gradient-to-b from-[#E5C878] via-[#C99E4A] to-[#A87E2B] -skew-x-[30deg] opacity-95 pointer-events-none"
        />
        <div
          aria-hidden="true"
          className="hidden sm:block absolute left-8.5 top-0 bottom-0 w-1.5 bg-gradient-to-b from-[#E5C878]/85 to-[#C99E4A]/70 -skew-x-[30deg] pointer-events-none"
        />

        {/* Title + Icon (Right / RTL Start) */}
        <div className="relative z-10 flex items-center gap-2 min-w-0">
          {icon && (
            <span className="w-6 h-6 rounded-full bg-[#061D3B]/70 border border-[#DFC076]/65 flex items-center justify-center text-[#DFC076] shadow-2xs shrink-0">
              {icon}
            </span>
          )}
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 min-w-0">
            <h2 className="text-[13px] sm:text-[14px] font-extrabold text-white tracking-tight truncate">
              {titleAr}
            </h2>
            <span className="text-[#DFC076]/80 text-xs hidden sm:inline" aria-hidden="true">
              ·
            </span>
            <span className="text-[10.5px] font-semibold text-[#CBE0F8] truncate" dir="ltr">
              {titleEn}
            </span>
          </div>
        </div>

        {/* Optional actions (shifted slightly inward on desktop so they clear the left diagonal gold stripes) */}
        {headerActions && (
          <div className="relative z-10 flex items-center gap-1.5 shrink-0 sm:pl-10">
            {headerActions}
          </div>
        )}
      </div>

      <div className={bodyClassName}>{children}</div>
    </section>
  );
};
