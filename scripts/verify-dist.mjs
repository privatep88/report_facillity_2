#!/usr/bin/env node
/**
 * Post-Build Production Bundle Verification Script
 * Repository: privatep88/report_facillity_2
 *
 * Verifies:
 * 1. Existence and integrity of dist/index.html and dist/favicon.svg
 * 2. Existence of JavaScript and CSS production bundles in dist/assets/
 * 3. All local references in dist/index.html use the repository base path (/report_facillity_2/)
 * 4. Every asset referenced in dist/index.html, dist/assets/*.js, and dist/assets/*.css physically exists in dist/
 * 5. All 36 corporate visual assets (Header, SAAED Logo, Sidebar, Executive Summary KPIs, Drafts, Archive, Analytics) are bundled
 */

import fs from 'node:fs';
import path from 'node:path';

const EXPECTED_BASE = process.env.VITE_BASE_PATH || '/report_facillity_2/';
const distDir = path.resolve(process.cwd(), 'dist');
const assetsDir = path.join(distDir, 'assets');

const errors = [];

function failIf(condition, message) {
  if (condition) {
    errors.push(message);
  }
}

// 1. Check dist/index.html & dist/favicon.svg
const indexHtmlPath = path.join(distDir, 'index.html');
const faviconPath = path.join(distDir, 'favicon.svg');

failIf(!fs.existsSync(indexHtmlPath), 'Missing required file: dist/index.html');
failIf(!fs.existsSync(faviconPath), 'Missing required file: dist/favicon.svg');

if (fs.existsSync(faviconPath)) {
  const favContent = fs.readFileSync(faviconPath, 'utf8').trim();
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
      const relPath = ref.slice(EXPECTED_BASE.length);
      const targetOnDisk = path.join(distDir, relPath);
      failIf(
        !fs.existsSync(targetOnDisk),
        `Referenced asset "${ref}" in dist/index.html does not exist at ${targetOnDisk}`
      );
    }
  }
}

// 4. Verify all required corporate asset prefixes exist in dist/assets/
const requiredAssetPrefixes = [
  // Header, Logo & Footer
  'saaed_logo_mark-',
  'saaed_header_visual_bg-',
  'saaed_footer_visual_bg-',
  'footer_blueprint_helmet_',
  // Illustrated Navigation Sidebar (4 tabs + tower backdrop)
  'sidebar_towers_dusk_',
  'sidebar_tab_monthly_report_',
  'sidebar_tab_report_drafts_',
  'sidebar_tab_approved_reports_',
  'sidebar_tab_reports_analysis_',
  // Executive Summary KPI Cards (3 static + 4 contextual top-service visuals)
  'kpi_total_requests_desk_',
  'kpi_total_services_systems_',
  'kpi_completion_rate_check_',
  'svc_top_hospitality_lounge_',
  'svc_top_cleaning_sanitation_',
  'svc_top_security_surveillance_',
  'svc_top_government_docs_',
  // Report Drafts Tab
  'drafts_executive_banner_',
  'stage_report_preparation_',
  'stage_data_review_',
  'stage_approval_archive_',
  // Approved Reports Archive Tab
  'approved_archive_banner_',
  'archive_empty_vault_',
  'archive_card_approved_',
  'archive_card_digital_',
  'archive_card_export_',
  // Executive Analytics Tab
  'analytics_hero_banner_',
  'analytics_maintenance_ops_',
  'analytics_services_hub_',
  'analytics_finance_desk_',
  'analytics_risk_safety_',
  'analytics_boardroom_strategy_',
  // Operations & Maintenance Sections
  'engineer_tablet_inspector_',
  'technician_electrical_panel_',
  'fire_extinguisher_safety_',
  'facility_engineering_ops_',
  'facility_reception_hall_',
  'facility_safety_logistics_',
  'hero_facility_panorama_',
];

for (const prefix of requiredAssetPrefixes) {
  const found = assetFiles.find((f) => f.startsWith(prefix));
  if (!found) {
    errors.push(`Missing required production image asset with prefix "${prefix}" in dist/assets/`);
  } else {
    const stat = fs.statSync(path.join(assetsDir, found));
    failIf(stat.size === 0, `Bundled asset dist/assets/${found} is empty (0 bytes)`);
  }
}

// 5. Verify all "/report_facillity_2/assets/..." references inside JS/CSS bundles exist on disk
for (const file of [...jsFiles, ...cssFiles]) {
  const content = fs.readFileSync(path.join(assetsDir, file), 'utf8');
  const assetRefRegex = /\/report_facillity_2\/assets\/([A-Za-z0-9_.-]+\.(?:png|jpg|jpeg|webp|svg|js|css))/g;
  let m;
  while ((m = assetRefRegex.exec(content)) !== null) {
    const referencedFile = m[1];
    failIf(
      !assetFiles.includes(referencedFile),
      `Bundle ${file} references "/report_facillity_2/assets/${referencedFile}", which does not exist in dist/assets/`
    );
  }
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
console.log(`  - dist/index.html & dist/favicon.svg present and valid`);
console.log(`  - ${jsFiles.length} JS bundle(s), ${cssFiles.length} CSS bundle(s), and ${assetFiles.length} total assets verified in dist/assets/`);
