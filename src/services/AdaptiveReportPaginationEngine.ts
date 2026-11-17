import type {
  ChallengeItem,
  MaintenanceCategory,
  MaintenanceSite,
  MonthlyReportFull,
  ServiceMetricItem,
  TaskItem,
} from '../types/report.ts';

export type PaginationServiceItem = Pick<
  ServiceMetricItem,
  'serviceId' | 'nameAr' | 'nameEn' | 'receivedCount' | 'executedCount'
>;

export type ReportOrientation = 'landscape' | 'portrait';

export type BlockSpec =
  | { kind: 'sec1_exec' }
  | { kind: 'sec_ops' }
  | { kind: 'sec2_perf' }
  | { kind: 'sec3_summary'; start: number; end: number; compact?: boolean }
  | { kind: 'sec4_5_contracts_safety'; compact?: boolean }
  | {
      kind: 'sec6_matrix';
      siteStart: number;
      siteEnd: number;
      includeSummaryRows: boolean;
      embedChart?: boolean;
      compact?: boolean;
    }
  | { kind: 'sec6_chart' }
  | { kind: 'sec7_8_maint_logistics' }
  | { kind: 'sec9_security' }
  | { kind: 'sec10_tasks'; start: number; end: number; compact?: boolean }
  | { kind: 'sec11_challenges'; start: number; end: number; compact?: boolean }
  | { kind: 'sec12_signatures' };

export type PagePlan = BlockSpec[];

/**
 * Exact 1:1 A4 printable sheet dimensions inside @page { margin: 5mm; }:
 * - A4 Portrait (210mm × 297mm) - 10mm = 200mm × 287mm -> 748 × 1068 CSS px
 * - A4 Landscape (297mm × 210mm) - 10mm = 287mm × 200mm -> 1076 × 740 CSS px
 */
export const A4_SHEET_DIMENSIONS: Record<ReportOrientation, { width: number; height: number }> = {
  landscape: { width: 1076, height: 740 },
  portrait: { width: 748, height: 1068 },
};

/**
 * Distinguishes between:
 *  (A) Real saved/intentional operational tasks (including tasks with status 'not_started' and 0%
 *      completion that have a topic or task description), and
 *  (B) Unpopulated blank UI input placeholder rows where both topic and taskName are empty
 *      and completionPct is 0.
 * Never mutates the source report array; returns a filtered array for official preview/PDF/Excel export.
 */
export function filterExportableTasks(tasks: readonly TaskItem[]): TaskItem[] {
  if (!Array.isArray(tasks) || tasks.length === 0) return [];
  const meaningful = tasks.filter((t) => {
    const hasTopic = typeof t.topic === 'string' && t.topic.trim().length > 0;
    const hasTaskName = typeof t.taskName === 'string' && t.taskName.trim().length > 0;
    const hasProgress = (Number(t.completionPct) || 0) > 0;
    const hasNonDefaultStatus = Boolean(t.status && t.status !== 'not_started');
    return hasTopic || hasTaskName || hasProgress || hasNonDefaultStatus;
  });
  return meaningful.length > 0 ? meaningful : [tasks[0]];
}

/**
 * Distinguishes between intentional Challenge/Recommendation records and completely blank
 * UI input placeholder rows.
 */
export function filterExportableChallenges(challenges: readonly ChallengeItem[]): ChallengeItem[] {
  if (!Array.isArray(challenges) || challenges.length === 0) return [];
  const meaningful = challenges.filter((c) => {
    const hasChallenge = typeof c.challengeText === 'string' && c.challengeText.trim().length > 0;
    const hasUpdate = typeof c.updateText === 'string' && c.updateText.trim().length > 0;
    const hasRec =
      typeof c.recommendationText === 'string' && c.recommendationText.trim().length > 0;
    return hasChallenge || hasUpdate || hasRec;
  });
  return meaningful.length > 0 ? meaningful : [challenges[0]];
}

/**
 * Estimates the number of wrapped text lines inside a table cell or card box
 * accounting for explicit line breaks (`\n`) and Arabic/English character widths.
 */
export function estimateWrappedLines(text: string | null | undefined, charsPerLine: number): number {
  const raw = (text || '').trim();
  if (!raw) return 1;
  const safeCharsPerLine = Math.max(8, charsPerLine);
  const paragraphs = raw.split(/\r?\n/);
  let totalLines = 0;
  for (const p of paragraphs) {
    const len = p.trim().length;
    totalLines += len === 0 ? 1 : Math.ceil(len / safeCharsPerLine);
  }
  return Math.max(1, totalLines);
}

export interface AdaptivePaginationInput {
  orientation: ReportOrientation;
  report: MonthlyReportFull;
  services?: readonly PaginationServiceItem[];
  sites: readonly MaintenanceSite[];
  categories: readonly MaintenanceCategory[];
  securityCount?: number;
  tasks?: readonly TaskItem[];
  challenges?: readonly ChallengeItem[];
}

/**
 * Computes the available vertical content budget (in CSS px) inside `.official-page-body`
 * after reserving fixed regions for `.official-page-header` and `.official-page-footer`.
 */
export function getPrintableBodyBudgetPx(
  orientation: ReportOrientation,
  isApprovedOrArchived: boolean
): {
  budgetPx: number;
  blockGapPx: number;
} {
  const sheetHeight = A4_SHEET_DIMENSIONS[orientation].height;
  // Measured fixed header + metadata strip + optional draft notice banner + footer heights
  const headerPx =
    orientation === 'portrait'
      ? isApprovedOrArchived
        ? 118
        : 140
      : isApprovedOrArchived
        ? 112
        : 132;
  const footerPx = 62;
  const bodyVerticalPaddingPx = orientation === 'portrait' ? 16 : 12;
  const safetyBufferPx = orientation === 'portrait' ? 14 : 10;

  return {
    budgetPx: sheetHeight - headerPx - footerPx - bodyVerticalPaddingPx - safetyBufferPx,
    blockGapPx: orientation === 'portrait' ? 8 : 6,
  };
}

function estimateServiceRowHeightPx(
  service: PaginationServiceItem,
  orientation: ReportOrientation,
  compact: boolean
): number {
  const charsPerLine = orientation === 'portrait' ? 32 : 48;
  const lines = estimateWrappedLines(service.nameAr, charsPerLine);
  const baseRowPx = compact ? 20 : 25;
  const extraLinePx = 13;
  return baseRowPx + Math.max(0, lines - 1) * extraLinePx;
}

function estimateTaskRowHeightPx(
  task: TaskItem,
  orientation: ReportOrientation,
  compact: boolean
): number {
  const topicChars = orientation === 'portrait' ? 24 : 36;
  const taskChars = orientation === 'portrait' ? 42 : 64;
  const topicLines = estimateWrappedLines(task.topic, topicChars);
  const taskLines = estimateWrappedLines(task.taskName, taskChars);
  const maxLines = Math.max(topicLines, taskLines);
  const baseRowPx = compact ? 23 : 27;
  const extraLinePx = 13.5;
  return baseRowPx + Math.max(0, maxLines - 1) * extraLinePx;
}

function estimateChallengeRowHeightPx(
  challenge: ChallengeItem,
  orientation: ReportOrientation,
  compact: boolean
): number {
  const col1Chars = orientation === 'portrait' ? 26 : 38;
  const col2Chars = orientation === 'portrait' ? 38 : 56;
  const col3Chars = orientation === 'portrait' ? 34 : 50;
  const l1 = estimateWrappedLines(challenge.challengeText, col1Chars);
  const l2 = estimateWrappedLines(challenge.updateText, col2Chars);
  const l3 = estimateWrappedLines(challenge.recommendationText, col3Chars);
  const maxLines = Math.max(l1, l2, l3);
  const baseRowPx = compact ? 26 : 30;
  const extraLinePx = 14;
  return baseRowPx + Math.max(0, maxLines - 1) * extraLinePx;
}

function estimateContractsSafetyHeightPx(
  report: MonthlyReportFull,
  orientation: ReportOrientation,
  compact: boolean
): number {
  const contractChars = orientation === 'portrait' ? 18 : 26;
  const safetyChars = orientation === 'portrait' ? 20 : 30;
  const maxContractNotesLines = report.contracts.reduce(
    (max, c) => Math.max(max, estimateWrappedLines(c.notes, contractChars)),
    1
  );
  const maxSafetyNotesLines = report.safety.reduce(
    (max, s) => Math.max(max, estimateWrappedLines(s.notes, safetyChars)),
    1
  );
  const maxLines = Math.max(maxContractNotesLines, maxSafetyNotesLines);
  const baseHeight = orientation === 'portrait' ? (compact ? 225 : 265) : 230;
  return baseHeight + Math.max(0, maxLines - 2) * 13;
}

function estimateSec6MatrixHeightPx(params: {
  orientation: ReportOrientation;
  sites: readonly MaintenanceSite[];
  categoriesCount: number;
  siteStart: number;
  siteEnd: number;
  includeSummaryRows: boolean;
  embedChart: boolean;
  compact: boolean;
}): number {
  const {
    orientation,
    sites,
    categoriesCount,
    siteStart,
    siteEnd,
    includeSummaryRows,
    embedChart,
    compact,
  } = params;
  const maxCatsPerTable = orientation === 'portrait' ? 7 : 12;
  const horizontalChunks = Math.max(1, Math.ceil(Math.max(1, categoriesCount) / maxCatsPerTable));
  const slicedSites = sites.slice(siteStart, siteEnd);

  const ribbonHeaderPx = 30;
  const kpiRowPx = siteStart === 0 ? 52 : 0;
  const tableHeaderPx = 28;
  const perSiteRowPx = compact ? 18 : 20;
  const summaryRowsPx = includeSummaryRows ? 64 : 0;
  const grandCostBannerPx = includeSummaryRows ? 30 : 0;

  const singleChunkTablePx =
    tableHeaderPx + slicedSites.length * perSiteRowPx + summaryRowsPx + 4;
  const allChunksTablePx = horizontalChunks * singleChunkTablePx + (horizontalChunks - 1) * 6;

  const chartPx = embedChart
    ? 62 + sites.length * (orientation === 'portrait' ? 23 : 22)
    : 0;

  return (
    ribbonHeaderPx +
    kpiRowPx +
    allChunksTablePx +
    grandCostBannerPx +
    chartPx +
    18
  );
}

function estimateSec9SecurityHeightPx(
  securityCount: number,
  orientation: ReportOrientation
): number {
  const maxPerRow = orientation === 'portrait' ? 5 : 8;
  const chunks = Math.max(1, Math.ceil(Math.max(1, securityCount) / maxPerRow));
  const perChunkPx = 104;
  return 32 + chunks * perChunkPx + (chunks - 1) * 6;
}

/**
 * STAGE 1 & 2 (MEASURE -> PACK):
 * Content-Aware Sequential Best-Fit Pagination Engine.
 * - Zero fixed section-to-page hardcoding.
 * - Automatically pulls subsequent sections up when rows/services/tasks are deleted.
 * - Automatically splits tables at safe row boundaries and reflows when rows/columns/services/sites are added.
 * - Prevents 1-row orphan continuations and isolated signature/footer pages.
 */
export function buildAdaptivePagePlan(input: AdaptivePaginationInput): PagePlan[] {
  const {
    orientation,
    report,
    sites,
    categories,
  } = input;
  const services: readonly PaginationServiceItem[] =
    input.services ??
    (report.services || []).map((s) => ({
      serviceId: s.serviceId,
      nameAr: s.nameAr,
      nameEn: s.nameEn,
      receivedCount: s.receivedCount,
      executedCount: s.executedCount,
    }));
  const securityCount = input.securityCount ?? (report.securityReception?.length || 0);
  const tasks = input.tasks ?? filterExportableTasks(report.tasks || []);
  const challenges = input.challenges ?? filterExportableChallenges(report.challenges || []);

  const isApprovedOrArchived = report.status === 'approved' || report.status === 'archived';
  const { budgetPx, blockGapPx } = getPrintableBodyBudgetPx(orientation, isApprovedOrArchived);

  const pages: PagePlan[] = [];
  let currentPage: BlockSpec[] = [];
  let currentUsedPx = 0;

  const pushCurrentPage = () => {
    if (currentPage.length > 0) {
      pages.push(currentPage);
      currentPage = [];
      currentUsedPx = 0;
    }
  };

  const addBlockToCurrentOrNewPage = (block: BlockSpec, heightPx: number) => {
    const gap = currentPage.length > 0 ? blockGapPx : 0;
    if (currentPage.length > 0 && currentUsedPx + gap + heightPx > budgetPx) {
      pushCurrentPage();
    }
    const newGap = currentPage.length > 0 ? blockGapPx : 0;
    currentPage.push(block);
    currentUsedPx += newGap + heightPx;
  };

  // -------------------------------------------------------------------------
  // 1. Executive Summary + Operations Strip + Performance Overview
  // -------------------------------------------------------------------------
  if (orientation === 'portrait') {
    const sec1H = 185;
    const secOpsH = 225;
    const sec2PerfH = Math.max(290, 140 + Math.min(services.length, 14) * 18);
    addBlockToCurrentOrNewPage({ kind: 'sec1_exec' }, sec1H);
    addBlockToCurrentOrNewPage({ kind: 'sec_ops' }, secOpsH);
    addBlockToCurrentOrNewPage({ kind: 'sec2_perf' }, sec2PerfH);
    // Start a fresh page after the executive overview triad so Services Summary starts cleanly
    pushCurrentPage();
  } else {
    addBlockToCurrentOrNewPage({ kind: 'sec1_exec' }, 215);
    addBlockToCurrentOrNewPage({ kind: 'sec_ops' }, 255);
    pushCurrentPage();
    addBlockToCurrentOrNewPage({ kind: 'sec2_perf' }, 480);
    pushCurrentPage();
  }

  // -------------------------------------------------------------------------
  // 2. Section 3 (Services Summary) + Section 4 & 5 (Contracts & Fire Safety)
  // -------------------------------------------------------------------------
  const totalServices = services.length;
  const contractsSafetyComfortH = estimateContractsSafetyHeightPx(report, orientation, false);
  const contractsSafetyCompactH = estimateContractsSafetyHeightPx(report, orientation, true);

  if (totalServices > 0) {
    let svcCursor = 0;
    while (svcCursor < totalServices) {
      // Check if remaining services + Contracts/Safety can share the page in comfort or compact mode
      const remainingCount = totalServices - svcCursor;
      const chromePx = 62; // ribbon + thead + padding
      const footerRowPx = 26;

      const comfortSvcH =
        chromePx +
        footerRowPx +
        services
          .slice(svcCursor)
          .reduce((sum, s) => sum + estimateServiceRowHeightPx(s, orientation, false), 0);
      const compactSvcH =
        chromePx +
        footerRowPx +
        services
          .slice(svcCursor)
          .reduce((sum, s) => sum + estimateServiceRowHeightPx(s, orientation, true), 0);

      if (
        orientation === 'portrait' &&
        currentPage.length === 0 &&
        comfortSvcH + blockGapPx + contractsSafetyComfortH <= budgetPx
      ) {
        addBlockToCurrentOrNewPage(
          { kind: 'sec3_summary', start: svcCursor, end: totalServices, compact: false },
          comfortSvcH
        );
        svcCursor = totalServices;
        break;
      }

      if (
        orientation === 'portrait' &&
        currentPage.length === 0 &&
        compactSvcH + blockGapPx + contractsSafetyCompactH <= budgetPx
      ) {
        addBlockToCurrentOrNewPage(
          { kind: 'sec3_summary', start: svcCursor, end: totalServices, compact: true },
          compactSvcH
        );
        svcCursor = totalServices;
        break;
      }

      // Otherwise pack as many service rows as fit on the current page
      const availForSvc =
        currentPage.length === 0 ? budgetPx : budgetPx - currentUsedPx - blockGapPx;
      let accPx = chromePx;
      let endCursor = svcCursor;

      while (endCursor < totalServices) {
        const rowH = estimateServiceRowHeightPx(services[endCursor], orientation, true);
        const isLastRow = endCursor === totalServices - 1;
        const needed = accPx + rowH + (isLastRow ? footerRowPx : 0);
        if (endCursor > svcCursor && needed > availForSvc) {
          break;
        }
        accPx += rowH;
        endCursor++;
      }

      // Prevent leaving a 1-row orphan on the next page
      if (totalServices - endCursor === 1 && endCursor - svcCursor >= 3) {
        endCursor -= 1;
      }

      if (endCursor === totalServices) {
        accPx += footerRowPx;
      }

      addBlockToCurrentOrNewPage(
        {
          kind: 'sec3_summary',
          start: svcCursor,
          end: endCursor,
          compact: remainingCount > 11,
        },
        accPx
      );
      svcCursor = endCursor;
      if (svcCursor < totalServices) {
        pushCurrentPage();
      }
    }
  }

  // Place Section 4 & 5 (Contracts & Fire Safety) right after Section 3 if it fits on the same page!
  const useCompactContracts =
    currentPage.length > 0 &&
    currentUsedPx + blockGapPx + contractsSafetyComfortH > budgetPx &&
    currentUsedPx + blockGapPx + contractsSafetyCompactH <= budgetPx;
  const chosenContractsH = useCompactContracts
    ? contractsSafetyCompactH
    : contractsSafetyComfortH;

  addBlockToCurrentOrNewPage(
    { kind: 'sec4_5_contracts_safety', compact: useCompactContracts },
    chosenContractsH
  );

  // -------------------------------------------------------------------------
  // 3. Section 6: Maintenance Matrix + Cost Totals + Horizontal Site Chart
  // -------------------------------------------------------------------------
  const totalSites = sites.length;
  const unifiedMatrixAndChartH = estimateSec6MatrixHeightPx({
    orientation,
    sites,
    categoriesCount: categories.length,
    siteStart: 0,
    siteEnd: totalSites,
    includeSummaryRows: true,
    embedChart: true,
    compact: totalSites > 6 || categories.length > 7,
  });

  if (unifiedMatrixAndChartH <= budgetPx) {
    // Keep Maintenance Matrix + Cost Totals + Site Comparison Chart unified together
    addBlockToCurrentOrNewPage(
      {
        kind: 'sec6_matrix',
        siteStart: 0,
        siteEnd: totalSites,
        includeSummaryRows: true,
        embedChart: true,
        compact: totalSites > 6 || categories.length > 7,
      },
      unifiedMatrixAndChartH
    );
  } else {
    // Check if the full matrix table (without embedded chart) fits on 1 page
    const fullMatrixOnlyH = estimateSec6MatrixHeightPx({
      orientation,
      sites,
      categoriesCount: categories.length,
      siteStart: 0,
      siteEnd: totalSites,
      includeSummaryRows: true,
      embedChart: false,
      compact: true,
    });
    const chartOnlyH = 68 + totalSites * (orientation === 'portrait' ? 23 : 22);

    if (fullMatrixOnlyH <= budgetPx) {
      addBlockToCurrentOrNewPage(
        {
          kind: 'sec6_matrix',
          siteStart: 0,
          siteEnd: totalSites,
          includeSummaryRows: true,
          embedChart: false,
          compact: true,
        },
        fullMatrixOnlyH
      );
      addBlockToCurrentOrNewPage({ kind: 'sec6_chart' }, chartOnlyH);
    } else {
      // Split sites across pages cleanly while preserving all categories and summary rows
      const maxCatsPerTable = orientation === 'portrait' ? 7 : 12;
      const horizontalChunks = Math.max(1, Math.ceil(Math.max(1, categories.length) / maxCatsPerTable));
      const sitesPerPage = Math.max(
        3,
        Math.floor((orientation === 'portrait' ? 14 : 8) / horizontalChunks)
      );

      let siteCursor = 0;
      while (siteCursor < totalSites) {
        let siteEnd = Math.min(totalSites, siteCursor + sitesPerPage);
        if (totalSites - siteEnd === 1 && siteEnd - siteCursor >= 3) {
          siteEnd -= 1;
        }
        const isLastSlice = siteEnd === totalSites;
        const sliceH = estimateSec6MatrixHeightPx({
          orientation,
          sites,
          categoriesCount: categories.length,
          siteStart: siteCursor,
          siteEnd,
          includeSummaryRows: isLastSlice,
          embedChart: false,
          compact: true,
        });
        addBlockToCurrentOrNewPage(
          {
            kind: 'sec6_matrix',
            siteStart: siteCursor,
            siteEnd,
            includeSummaryRows: isLastSlice,
            embedChart: false,
            compact: true,
          },
          sliceH
        );
        siteCursor = siteEnd;
      }
      addBlockToCurrentOrNewPage({ kind: 'sec6_chart' }, chartOnlyH);
    }
  }

  // -------------------------------------------------------------------------
  // 4. Section 7 & 8 (Maintenance Sources & Logistics) + Section 9 (Security)
  // -------------------------------------------------------------------------
  const sec78H = orientation === 'portrait' ? 256 : 250;
  const sec9H = estimateSec9SecurityHeightPx(securityCount, orientation);

  addBlockToCurrentOrNewPage({ kind: 'sec7_8_maint_logistics' }, sec78H);
  addBlockToCurrentOrNewPage({ kind: 'sec9_security' }, sec9H);

  // -------------------------------------------------------------------------
  // 5. Section 10 (Operational Tasks) + Section 11 (Challenges) + Section 12 (Signatures)
  //    Sequential Content-Aware Packing with Pull-Up Reflow & Anti-Orphan Balancing!
  // -------------------------------------------------------------------------
  const totalTasks = tasks.length;
  const totalChallenges = challenges.length;
  const signaturesH = orientation === 'portrait' ? 178 : 172;

  // Pack Section 10: Operational Tasks
  if (totalTasks > 0) {
    const taskTableChromeComfortPx = 58;
    const taskTableChromeCompactPx = 50;
    const allTasksComfortPx =
      taskTableChromeComfortPx +
      tasks.reduce((s, t) => s + estimateTaskRowHeightPx(t, orientation, false), 0);
    const allTasksCompactPx =
      taskTableChromeCompactPx +
      tasks.reduce((s, t) => s + estimateTaskRowHeightPx(t, orientation, true), 0);

    const availOnCurrentPage =
      currentPage.length === 0 ? budgetPx : budgetPx - currentUsedPx - blockGapPx;

    if (allTasksComfortPx <= availOnCurrentPage) {
      // All tasks fit comfortably on the current page (e.g. Page 4 below Security) without splitting!
      addBlockToCurrentOrNewPage(
        {
          kind: 'sec10_tasks',
          start: 0,
          end: totalTasks,
          compact: false,
        },
        allTasksComfortPx
      );
    } else if (allTasksCompactPx <= availOnCurrentPage) {
      // All tasks fit unified on the current page (e.g. Page 4 below Security) using compact row density!
      addBlockToCurrentOrNewPage(
        {
          kind: 'sec10_tasks',
          start: 0,
          end: totalTasks,
          compact: true,
        },
        allTasksCompactPx
      );
    } else {
      const minThreeRowsPx =
        taskTableChromeCompactPx +
        tasks
          .slice(0, Math.min(3, totalTasks))
          .reduce((s, t) => s + estimateTaskRowHeightPx(t, orientation, true), 0);

      // If current page doesn't have enough room for header + at least 3 task rows, start a new page
      if (
        currentPage.length > 0 &&
        currentUsedPx + blockGapPx + minThreeRowsPx > budgetPx
      ) {
        pushCurrentPage();
      }

      let taskCursor = 0;
      while (taskCursor < totalTasks) {
        const availPx =
          currentPage.length === 0 ? budgetPx : budgetPx - currentUsedPx - blockGapPx;
        const useCompact = totalTasks - taskCursor > 6 || currentPage.length > 0;
        const chromePx = useCompact ? taskTableChromeCompactPx : taskTableChromeComfortPx;
        let accPx = chromePx;
        let endCursor = taskCursor;

        while (endCursor < totalTasks) {
          const rowH = estimateTaskRowHeightPx(tasks[endCursor], orientation, useCompact);
          if (endCursor > taskCursor && accPx + rowH > availPx) {
            break;
          }
          accPx += rowH;
          endCursor++;
        }

        // Anti-orphan: never leave just 1 or 2 task rows stranded on the next page
        const remainingTasks = totalTasks - endCursor;
        if ((remainingTasks === 1 || remainingTasks === 2) && endCursor - taskCursor >= 4) {
          const pullBack = remainingTasks === 1 ? 2 : 1;
          for (let k = 0; k < pullBack; k++) {
            const lastRowH = estimateTaskRowHeightPx(tasks[endCursor - 1], orientation, useCompact);
            endCursor -= 1;
            accPx -= lastRowH;
          }
        }

        addBlockToCurrentOrNewPage(
          {
            kind: 'sec10_tasks',
            start: taskCursor,
            end: endCursor,
            compact: useCompact,
          },
          accPx
        );
        taskCursor = endCursor;
        if (taskCursor < totalTasks) {
          pushCurrentPage();
        }
      }
    }
  }

  // Pack Section 11: Challenges & Executive Recommendations + Section 12: Official Signatures
  if (totalChallenges > 0) {
    const challengeTableChromePx = 58;
    const totalAllChallengesPx =
      challengeTableChromePx +
      challenges.reduce((s, c) => s + estimateChallengeRowHeightPx(c, orientation, false), 0);

    // Check if ALL challenges + Official Signatures fit on the current page!
    // If Challenges fits on the current page, but Signatures would be pushed alone to a new page,
    // check whether moving Challenges + Signatures together to the next page (or moving the last
    // 2 challenges with Signatures) prevents an isolated signature-only final page!
    const availNow =
      currentPage.length === 0 ? budgetPx : budgetPx - currentUsedPx - blockGapPx;

    if (
      currentPage.length > 0 &&
      totalAllChallengesPx <= availNow &&
      totalAllChallengesPx + blockGapPx + signaturesH > availNow &&
      totalAllChallengesPx + blockGapPx + signaturesH <= budgetPx
    ) {
      // If current page is already well-utilized (>= 58% full, e.g. Page 4 with Sec 7/8 + Sec 9 + Sec 10),
      // start Page 5 with Challenges + Signatures together so neither Page 4 nor Page 5 has awkward orphans!
      if (currentUsedPx >= budgetPx * 0.55) {
        pushCurrentPage();
      }
    }

    const minChallengeStartPx =
      challengeTableChromePx +
      challenges
        .slice(0, Math.min(2, totalChallenges))
        .reduce((s, c) => s + estimateChallengeRowHeightPx(c, orientation, false), 0);

    if (
      currentPage.length > 0 &&
      currentUsedPx + blockGapPx + minChallengeStartPx > budgetPx
    ) {
      pushCurrentPage();
    }

    let chCursor = 0;
    while (chCursor < totalChallenges) {
      const availPx =
        currentPage.length === 0 ? budgetPx : budgetPx - currentUsedPx - blockGapPx;
      let accPx = challengeTableChromePx;
      let endCursor = chCursor;

      while (endCursor < totalChallenges) {
        const rowH = estimateChallengeRowHeightPx(challenges[endCursor], orientation, false);
        if (endCursor > chCursor && accPx + rowH > availPx) {
          break;
        }
        accPx += rowH;
        endCursor++;
      }

      // Anti-orphan 1: Never leave a 1-row challenge continuation
      if (totalChallenges - endCursor === 1 && endCursor - chCursor >= 3) {
        const lastRowH = estimateChallengeRowHeightPx(challenges[endCursor - 1], orientation, false);
        endCursor -= 1;
        accPx -= lastRowH;
      }

      // Anti-orphan 2: If this is the final chunk of challenges (`endCursor === totalChallenges`),
      // check if `sec12_signatures` will also fit on this page. If `sec12_signatures` does NOT fit
      // on this page and this chunk has >= 4 rows, hold back the last 2 challenge rows for the next
      // page so `sec12_signatures` is accompanied by those 2 challenge rows instead of sitting alone!
      if (
        endCursor === totalChallenges &&
        accPx + blockGapPx + signaturesH > availPx &&
        endCursor - chCursor >= 4
      ) {
        const r1 = estimateChallengeRowHeightPx(challenges[endCursor - 1], orientation, false);
        const r2 = estimateChallengeRowHeightPx(challenges[endCursor - 2], orientation, false);
        endCursor -= 2;
        accPx -= r1 + r2;
      }

      addBlockToCurrentOrNewPage(
        {
          kind: 'sec11_challenges',
          start: chCursor,
          end: endCursor,
          compact: false,
        },
        accPx
      );
      chCursor = endCursor;
      if (chCursor < totalChallenges) {
        pushCurrentPage();
      }
    }
  }

  // Place Section 12: Official Preparation, Review & Approval Signatures
  addBlockToCurrentOrNewPage({ kind: 'sec12_signatures' }, signaturesH);
  pushCurrentPage();

  return pages.filter((p) => p.length > 0);
}

/**
 * STAGE 4 (VALIDATE & REFLOW):
 * Refines the page plan if real rendered DOM measurement (`el.scrollHeight > sheetHeight`)
 * detects an overflow on any page, or merges adjacent split chunks cleanly without creating
 * isolated 1-row fragments or empty pages.
 */
export function refineOverflowingPages(
  currentPages: PagePlan[],
  overflowingPageIndices: number[]
): PagePlan[] | null {
  if (overflowingPageIndices.length === 0) return null;
  const firstOverflowIdx = overflowingPageIndices[0];
  const nextPages = currentPages.map((p) => [...p]);
  const targetPage = nextPages[firstOverflowIdx];
  if (!targetPage || targetPage.length === 0) return null;

  // Helper to prepend a moved block onto the next page (merging contiguous table slices if same kind)
  const cascadeBlockToNextPage = (pageIdx: number, moved: BlockSpec) => {
    if (pageIdx + 1 >= nextPages.length) {
      nextPages.push([moved]);
      return;
    }
    const followingPage = nextPages[pageIdx + 1];
    const firstOnFollowing = followingPage[0];

    if (
      firstOnFollowing &&
      moved.kind === firstOnFollowing.kind &&
      (moved.kind === 'sec3_summary' ||
        moved.kind === 'sec10_tasks' ||
        moved.kind === 'sec11_challenges') &&
      moved.end === (firstOnFollowing as typeof moved).start
    ) {
      followingPage[0] = {
        ...firstOnFollowing,
        start: moved.start,
      } as BlockSpec;
      return;
    }

    // If followingPage only has sec12_signatures or has <= 2 blocks, prepend moved block onto followingPage
    // so we don't create an extra nearly-empty page in between!
    if (followingPage.length <= 2) {
      followingPage.unshift(moved);
    } else {
      nextPages.splice(pageIdx + 1, 0, [moved]);
    }
  };

  // Case A: Page has 2+ blocks -> check if the last block is a splittable table with >= 3 rows
  if (targetPage.length > 1) {
    const lastBlock = targetPage[targetPage.length - 1];
    if (
      lastBlock.kind === 'sec3_summary' ||
      lastBlock.kind === 'sec10_tasks' ||
      lastBlock.kind === 'sec11_challenges'
    ) {
      const rowCount = lastBlock.end - lastBlock.start;
      if (rowCount >= 4) {
        // Peel off the bottom 2 rows onto the next page while keeping the top rows on this page
        const splitAt = lastBlock.end - 2;
        targetPage[targetPage.length - 1] = { ...lastBlock, end: splitAt };
        cascadeBlockToNextPage(firstOverflowIdx, { ...lastBlock, start: splitAt });
        return nextPages.filter((p) => p.length > 0);
      }
    }

    const movedBlock = targetPage.pop()!;
    cascadeBlockToNextPage(firstOverflowIdx, movedBlock);
    return nextPages.filter((p) => p.length > 0);
  }

  // Case B: Single block on the overflowing page
  const sole = targetPage[0];
  if (
    sole.kind === 'sec3_summary' ||
    sole.kind === 'sec10_tasks' ||
    sole.kind === 'sec11_challenges'
  ) {
    const count = sole.end - sole.start;
    if (count > 1) {
      // Peel off the last ~25% of rows (at least 1, or 2 if count >= 4) onto the next page
      const peelCount = count >= 4 ? Math.max(2, Math.ceil(count * 0.25)) : 1;
      const splitAt = Math.max(sole.start + 1, sole.end - peelCount);
      targetPage[0] = { ...sole, end: splitAt, compact: true };
      cascadeBlockToNextPage(firstOverflowIdx, { ...sole, start: splitAt, compact: true });
      return nextPages.filter((p) => p.length > 0);
    }
  }

  if (sole.kind === 'sec6_matrix') {
    if (sole.embedChart) {
      // First try detaching the embedded chart onto the next page before splitting the matrix table
      targetPage[0] = { ...sole, embedChart: false, compact: true };
      cascadeBlockToNextPage(firstOverflowIdx, { kind: 'sec6_chart' });
      return nextPages.filter((p) => p.length > 0);
    }
    const count = sole.siteEnd - sole.siteStart;
    if (count > 2) {
      const splitAt = sole.siteStart + Math.max(1, Math.floor(count / 2));
      const firstHalf: BlockSpec = {
        kind: 'sec6_matrix',
        siteStart: sole.siteStart,
        siteEnd: splitAt,
        includeSummaryRows: false,
        embedChart: false,
        compact: true,
      };
      const secondHalf: BlockSpec = {
        kind: 'sec6_matrix',
        siteStart: splitAt,
        siteEnd: sole.siteEnd,
        includeSummaryRows: sole.includeSummaryRows,
        embedChart: false,
        compact: true,
      };
      nextPages.splice(firstOverflowIdx, 1, [firstHalf], [secondHalf]);
      return nextPages.filter((p) => p.length > 0);
    }
  }

  return null;
}
