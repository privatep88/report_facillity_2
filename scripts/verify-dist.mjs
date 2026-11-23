#!/usr/bin/env node
/**
 * Post-Build Production Bundle Verification Script
 * Repository: privatep88/report_facillity_2
 *
 * Verifies:
 * 1. Existence and integrity of dist/index.html and active favicon assets (dist/favicon.png / dist/favicon.svg)
 * 2. Existence of JavaScript and CSS production bundles in dist/assets/
 * 3. All local references in dist/index.html use the repository base path (EXPECTED_BASE) and exist on disk
 * 4. Every asset referenced in dist/index.html, dist/assets/*.js, and dist/assets/*.css physically exists in dist/
 * 5. All required corporate visual assets (SAHER Logo, SAHER Header, active Footer, Sidebar, KPIs, Drafts, Archive, Analytics)
 *    exist in dist/assets/ with Vite-hashed filenames in supported image formats (PNG, JPG, JPEG, WEBP)
 */

import fs from 'node:fs';
import path from 'node:path';

const rawBase = process.env.VITE_BASE_PATH || '/report_facillity_2/';
const EXPECTED_BASE = rawBase.endsWith('/') ? rawBase : `${rawBase}/`;
const distDir = path.resolve(process.cwd(), 'dist');
const assetsDir = path.join(distDir, 'assets');

const SUPPORTED_IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp'];
const SUPPORTED_IMAGE_EXT_REGEX = `(?:${SUPPORTED_IMAGE_EXTENSIONS.join('|')})`;

const errors = [];

function failIf(condition, message) {
  if (condition) {
    errors.push(message);
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Matches Vite-emitted image filenames for a logical asset base name,
 * handling dynamic content hashes and optional numeric/variant suffixes
 * across supported image formats (PNG, JPG, JPEG, WEBP).
 *
 * Examples matched:
 * - saher_logo_mark-DzLK-w4K.webp
 * - saher_logo_mark-BXTWXvUB.png
 * - footer_blueprint_helmet_1794733279930-By2S6lPn.jpg
 * - saher_header_visual_bg.png
 */
function findMatchingImageAssets(files, logicalName) {
  const cleanName = logicalName.replace(/[-_]+$/, '');
  const pattern = new RegExp(
    `^${escapeRegExp(cleanName)}(?:_[A-Za-z0-9]+)?(?:-[A-Za-z0-9_-]+)?\\.${SUPPORTED_IMAGE_EXT_REGEX}$`,
    'i'
  );
  return files.filter((file) => pattern.test(file));
}

// 1. Check dist/index.html & favicon assets
const indexHtmlPath = path.join(distDir, 'index.html');
const faviconPngPath = path.join(distDir, 'favicon.png');
const faviconSvgPath = path.join(distDir, 'favicon.svg');

failIf(!fs.existsSync(indexHtmlPath), 'Missing required file: dist/index.html');
failIf(
  !fs.existsSync(faviconPngPath) && !fs.existsSync(faviconSvgPath),
  'Missing required favicon asset: expected dist/favicon.png or dist/favicon.svg'
);

if (fs.existsSync(faviconPngPath)) {
  const pngBuf = fs.readFileSync(faviconPngPath);
  const hasPngSignature =
    pngBuf.length >= 8 &&
    pngBuf[0] === 0x89 &&
    pngBuf[1] === 0x50 &&
    pngBuf[2] === 0x4e &&
    pngBuf[3] === 0x47;
  failIf(!hasPngSignature, 'dist/favicon.png is empty or not a valid PNG file');
}

if (fs.existsSync(faviconSvgPath)) {
  const favContent = fs.readFileSync(faviconSvgPath, 'utf8').trim();
  failIf(
    !favContent.startsWith('<svg') || !favContent.includes('</svg>'),
    'dist/favicon.svg is not a valid SVG document'
  );
}

// 2. Check dist/assets/ JS & CSS bundles
failIf(!fs.existsSync(assetsDir), 'Missing required directory: dist/assets/');

const assetFiles = fs.existsSync(assetsDir) ? fs.readdirSync(assetsDir) : [];
const jsFiles = assetFiles.filter((f) => f.endsWith('.js'));
const cssFiles = assetFiles.filter((f) => f.endsWith('.css'));

failIf(jsFiles.length === 0, 'No JavaScript bundles found in dist/assets/');
failIf(cssFiles.length === 0, 'No CSS bundles found in dist/assets/');

// 3. Validate dist/index.html references
if (fs.existsSync(indexHtmlPath)) {
  const html = fs.readFileSync(indexHtmlPath, 'utf8');

  failIf(
    html.includes('%BASE_URL%'),
    'Unresolved %BASE_URL% placeholder found in dist/index.html'
  );
  failIf(
    html.includes('/src/main.tsx') || html.includes('./src/'),
    'Unbundled source reference (/src/main.tsx) found in dist/index.html'
  );

  const attrRegex = /\b(?:href|src)=["']([^"']+)["']/g;
  let match;
  while ((match = attrRegex.exec(html)) !== null) {
    const ref = match[1];
    if (
      ref.startsWith('http://') ||
      ref.startsWith('https://') ||
      ref.startsWith('data:') ||
      ref.startsWith('#')
    ) {
      failIf(
        ref.includes('localhost') || ref.includes('127.0.0.1'),
        `Forbidden localhost reference in dist/index.html: ${ref}`
      );
      continue;
    }

    if (EXPECTED_BASE.startsWith('/')) {
      failIf(
        !ref.startsWith(EXPECTED_BASE),
        `Asset reference "${ref}" in dist/index.html does not start with expected base "${EXPECTED_BASE}"`
      );
      if (ref.startsWith(EXPECTED_BASE)) {
        const relPath = ref.slice(EXPECTED_BASE.length);
        const targetOnDisk = path.join(distDir, relPath);
        if (!fs.existsSync(targetOnDisk)) {
          errors.push(`Referenced asset "${ref}" in dist/index.html does not exist at ${targetOnDisk}`);
        } else {
          const stat = fs.statSync(targetOnDisk);
          failIf(stat.size === 0, `Referenced asset "${ref}" in dist/index.html is empty (0 bytes)`);
        }
      }
    }
  }
}

// 4. Verify all required corporate image assets exist in dist/assets/
const requiredBrandAssets = [
  'saher_logo_mark',
  'saher_header_visual_bg',
];

const requiredAssetNames = [
  // SAHER Brand Identity (Header & Logo) + Active Footer Assets
  ...requiredBrandAssets,
  'saaed_footer_visual_bg',
  'footer_blueprint_helmet',
  // Illustrated Navigation Sidebar (4 tabs + tower backdrop)
  'sidebar_towers_dusk',
  'sidebar_tab_monthly_report',
  'sidebar_tab_report_drafts',
  'sidebar_tab_approved_reports',
  'sidebar_tab_reports_analysis',
  // Executive Summary KPI Cards (3 static + 4 contextual top-service visuals)
  'kpi_total_requests_desk',
  'kpi_total_services_systems',
  'kpi_completion_rate_check',
  'svc_top_hospitality_lounge',
  'svc_top_cleaning_sanitation',
  'svc_top_security_surveillance',
  'svc_top_government_docs',
  // Report Drafts Tab
  'drafts_executive_banner',
  'stage_report_preparation',
  'stage_data_review',
  'stage_approval_archive',
  // Approved Reports Archive Tab
  'approved_archive_banner',
  'archive_empty_vault',
  'archive_card_approved',
  'archive_card_digital',
  'archive_card_export',
  // Executive Analytics Tab
  'analytics_hero_banner',
  'analytics_maintenance_ops',
  'analytics_services_hub',
  'analytics_finance_desk',
  'analytics_risk_safety',
  'analytics_boardroom_strategy',
  // Operations & Maintenance Sections
  'engineer_tablet_inspector',
  'technician_electrical_panel',
  'fire_extinguisher_safety',
  'facility_engineering_ops',
  'facility_reception_hall',
  'facility_safety_logistics',
  'hero_facility_panorama',
];

const matchedBrandFiles = new Map();

for (const assetName of requiredAssetNames) {
  const matches = findMatchingImageAssets(assetFiles, assetName);
  if (matches.length === 0) {
    errors.push(
      `Missing required production image asset "${assetName}" (expected formats: ${SUPPORTED_IMAGE_EXTENSIONS.join(', ')}) in dist/assets/`
    );
  } else {
    for (const file of matches) {
      const stat = fs.statSync(path.join(assetsDir, file));
      failIf(stat.size === 0, `Bundled asset dist/assets/${file} is empty (0 bytes)`);
    }
    if (requiredBrandAssets.includes(assetName)) {
      matchedBrandFiles.set(assetName, matches);
    }
  }
}

// 5. Verify all "${EXPECTED_BASE}assets/..." references inside JS/CSS bundles exist on disk
//    and confirm SAHER brand image assets are referenced in production bundles
const escapedBaseAssets = `${escapeRegExp(EXPECTED_BASE)}assets/`;
const bundleContents = [];
let verifiedBundleAssetRefs = 0;

for (const file of [...jsFiles, ...cssFiles]) {
  const content = fs.readFileSync(path.join(assetsDir, file), 'utf8');
  bundleContents.push(content);

  const assetRefRegex = new RegExp(
    `${escapedBaseAssets}([A-Za-z0-9_.-]+\\.(?:png|jpg|jpeg|webp|svg|js|css))`,
    'gi'
  );
  let m;
  while ((m = assetRefRegex.exec(content)) !== null) {
    verifiedBundleAssetRefs++;
    const referencedFile = m[1];
    if (!assetFiles.includes(referencedFile)) {
      errors.push(
        `Bundle ${file} references "${EXPECTED_BASE}assets/${referencedFile}", which does not exist in dist/assets/`
      );
    } else {
      const stat = fs.statSync(path.join(assetsDir, referencedFile));
      failIf(stat.size === 0, `Bundle ${file} references empty asset dist/assets/${referencedFile}`);
    }
  }

  if (file.endsWith('.css')) {
    const badCssUrlRegex = /url\(["']?(?:\/src\/|\.\.?\/src\/|https?:\/\/(?:localhost|127\.0\.0\.1))/i;
    failIf(badCssUrlRegex.test(content), `Invalid development asset URL detected in CSS bundle ${file}`);
  }
}

const combinedBundles = bundleContents.join('\n');
for (const [brandKey, files] of matchedBrandFiles.entries()) {
  const hasReference = files.some(
    (f) => combinedBundles.includes(`${EXPECTED_BASE}assets/${f}`) || combinedBundles.includes(f)
  );
  failIf(
    !hasReference,
    `SAHER brand asset "${brandKey}" exists in dist/assets/ (${files.join(', ')}) but is not referenced in any production JS/CSS bundle`
  );
}

if (errors.length > 0) {
  console.error('\n❌ POST-BUILD PRODUCTION VERIFICATION FAILED:');
  for (const err of errors) {
    console.error(`  - ${err}`);
  }
  process.exit(1);
}

console.log('✅ POST-BUILD PRODUCTION VERIFICATION PASSED:');
console.log(`  - Base path verified: ${EXPECTED_BASE}`);
console.log(`  - dist/index.html & favicon assets present and valid`);
console.log(
  `  - SAHER brand assets verified: ${requiredBrandAssets
    .map((k) => `${k} -> [${(matchedBrandFiles.get(k) || []).join(', ')}]`)
    .join(' | ')}`
);
console.log(
  `  - ${requiredAssetNames.length} required image assets, ${verifiedBundleAssetRefs} JS/CSS production asset reference(s), ${jsFiles.length} JS bundle(s), ${cssFiles.length} CSS bundle(s), and ${assetFiles.length} total assets verified in dist/assets/`
);

