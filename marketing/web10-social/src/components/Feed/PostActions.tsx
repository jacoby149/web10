// D73: the engagement row now lives in the shared @web10/discover package
// (one source, both apps). This wrapper keeps the social app's existing
// consumer API (no data props) by injecting the wapi-backed readComments /
// createComment into the shared PostActions.
import { readComments, createComment as wapiCreateComment } from '@/data';
import {
  PostActions as SharedPostActions,
  type PostActionsProps,
  type CreateComment,
} from '@web10/discover';

export type { PostActionMode, ReactionKind } from '@web10/discover';

/** Adapt the wapi createComment to the package's injected CreateComment shape. */
const createComment: CreateComment = async ({ postId, text, groups, postAuthor, postService }) => {
  const created = await wapiCreateComment(
    { post_id: postId, text, created_at: new Date().toISOString() },
    groups ?? postAuthor,
    postService,
  );
  return created;
};

type LegacyPostActionsProps = Omit<PostActionsProps, 'readComments' | 'createComment' | 'remote' | 'remoteHref' | 'onError'>;

export function PostActions(props: LegacyPostActionsProps) {
  return (
    <SharedPostActions
      {...props}
      readComments={readComments}
      createComment={createComment}
    />
  );
}
