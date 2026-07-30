// SOURCE OF TRUTH: platform export-data URLs for /import step 1.
// Used by Exporter.tsx (UI buttons) and the link-health e2e workflow.
// When a platform moves its help article, update here — one place.

export interface ExportLink {
  /** Internal key (used in data-testid, guide anchor) */
  platform: string;
  /** Display label */
  label: string;
  /** Direct link to the platform's data-export help page */
  url: string;
  /** Anchor on our /docs/export-guidance page */
  guideAnchor: string;
}

export const EXPORT_LINKS: ExportLink[] = [
  {
    platform: 'facebook',
    label: 'Facebook',
    url: 'https://www.facebook.com/help/212802592074644',
    guideAnchor: 'facebook',
  },
  {
    platform: 'youtube',
    label: 'YouTube',
    url: 'https://takeout.google.com/settings/takeout',
    guideAnchor: 'google',
  },
  {
    platform: 'x',
    label: 'X',
    url: 'https://help.x.com/en/managing-your-account/accessing-your-x-data',
    guideAnchor: 'x',
  },
  {
    platform: 'instagram',
    label: 'Instagram',
    url: 'https://help.instagram.com/181231772500920/',
    guideAnchor: 'instagram',
  },
  {
    platform: 'tiktok',
    label: 'TikTok',
    url: 'https://www.tiktok.com/support/faq_detail?id=7543597460594285112&category=web_account',
    guideAnchor: 'tiktok',
  },
];