// Screenshot harness — a seeded PostLightbox rendering a PRODUCT post (D89):
// a `posts` doc tagged `product` whose body IS the product attributes (no
// text, no media_refs). This is the view that used to render as an "empty
// post" at the permalink — the product card is now the content. The product
// photo is a resolved MediaRecord (the owner-scoped pics path).
import { MemoryRouter } from 'react-router-dom';
import { PostLightbox } from '@/components/Bio/PostLightbox';
import type { MediaRecord, PostRecord } from '@/data/types';

const PIC: MediaRecord = {
  _id: 'pic-1',
  url: 'data:image/svg+xml;utf8,' + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="912" height="2048" viewBox="0 0 912 2048">` +
    `<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0" stop-color="#1e1b4b"/><stop offset="1" stop-color="#312e81"/></linearGradient></defs>` +
    `<rect width="912" height="2048" fill="url(#bg)"/>` +
    `<g fill="none" stroke="#a5b4fc" stroke-width="10" opacity="0.9">` +
    `<rect x="156" y="704" width="600" height="240" rx="120"/>` +
    `<line x1="300" y1="704" x2="300" y2="944"/><line x1="456" y1="704" x2="456" y2="944"/><line x1="612" y1="704" x2="612" y2="944"/>` +
    `</g>` +
    `<text x="456" y="1100" font-family="sans-serif" font-size="64" fill="#c7d2fe" text-anchor="middle">Foam Roller</text>` +
    `<text x="456" y="1180" font-family="sans-serif" font-size="40" fill="#818cf8" text-anchor="middle">912 x 2048</text>` +
    `</svg>`,
  ),
  created_at: new Date().toISOString(),
  mime_type: 'image/svg+xml',
  width: 912,
  height: 2048,
};

const POST: PostRecord = {
  _id: 'prod-1',
  created_at: new Date(Date.now() - 2 * 3600_000).toISOString(),
  visibility: 'public',
  tags: ['product'],
  author_username: 'jacoby149',
  author_provider: 'web10',
  product: {
    target: 'product',
    name: 'Foam Roller',
    price: 25,
    link: 'https://link.amazon/B04bfxTdM',
    partner: 'Amazon',
    kind: 'affiliate',
    pics: ['pic-1'],
  },
};

export function ProductDetailHarness() {
  return (
    <MemoryRouter>
      <div className="flex min-h-screen items-center justify-center bg-background" data-testid="product-detail-harness">
        <PostLightbox
          post={POST}
          mediaMap={{ 'pic-1': PIC }}
          onClose={() => {}}
          postAuthor="jacoby149"
          postService="public_posts"
          isOwner={false}
        />
      </div>
    </MemoryRouter>
  );
}
