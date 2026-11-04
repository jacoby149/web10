import { useEffect, useRef, type ReactNode } from 'react';
import { HlsRenewalContext } from '@web10/discover';
import { readPostById } from '@/data';
import { readTokenCookie } from '@/data/v3';

/** Scope every nested player (including carousel slides) to its original post. */
export function PostMediaRenewal({ postId, children }: { postId?: string; children: ReactNode }) {
  const generation = useRef(0);
  const currentPost = useRef(postId);
  if (currentPost.current !== postId) {
    currentPost.current = postId;
    generation.current++;
  }
  useEffect(() => {
    const invalidate = () => { generation.current++; };
    window.addEventListener('upload-session-changed', invalidate);
    return () => {
      generation.current++;
      window.removeEventListener('upload-session-changed', invalidate);
    };
  }, []);

  const renew = async (originalManifest: string) => {
    const mediaId = new URL(originalManifest, window.location.origin).searchParams.get('doc_id');
    if (!postId || !mediaId) throw new Error('Missing original carrier or media');
    const credential = readTokenCookie();
    const captured = generation.current;
    const isCurrent = () => captured === generation.current && credential === readTokenCookie();
    console.log('[social-media] stream renewal — original carrier read started');
    const fresh = await readPostById(postId);
    if (!isCurrent()) throw new Error('Playback session changed');
    const ref = fresh?.media_refs?.find(r => typeof r !== 'string' && r.doc_id === mediaId);
    const manifest = ref && typeof ref !== 'string' ? ref.transcoding_settings?.manifest_url : undefined;
    if (!manifest) throw new Error('Original video is no longer readable');
    console.log('[social-media] stream renewal — original media resolved');
    return { url: manifest, isCurrent };
  };
  return <HlsRenewalContext.Provider value={renew}>{children}</HlsRenewalContext.Provider>;
}
