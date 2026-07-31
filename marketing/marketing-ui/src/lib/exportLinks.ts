// SOURCE OF TRUTH: platform export-data URLs for /import step 1.
// The canonical data lives in export-links.json (read by both this module
// and the link-health e2e workflow). When a platform moves its help
// article, update export-links.json — one place.

import exportLinksData from './export-links.json';

export interface ExportLink {
  platform: string;
  label: string;
  url: string;
  guideAnchor: string;
}

const toExportLink = (l: typeof exportLinksData.links[0]): ExportLink => ({
  platform: l.platform,
  label: l.label,
  url: l.url,
  guideAnchor: l.platform === 'youtube' ? 'google' : l.platform,
});

export const EXPORT_LINKS: ExportLink[] = exportLinksData.links.map(toExportLink);

export const YOUTUBE_EXPORT: ExportLink = toExportLink(
  exportLinksData.links.find(l => l.platform === 'youtube')!,
);

export const SECONDARY_PLATFORMS: ExportLink[] = exportLinksData.links
  .filter(l => l.platform !== 'youtube')
  .map(toExportLink);