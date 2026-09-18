// D73: the engagement row now lives in the shared @web10/discover package
// (one source, both apps). This wrapper keeps the social app's existing
// consumer API (no data props) by injecting the wapi-backed thread seams
// (comments.md): readThreadComments (the whole conversation + comment likes),
// createThreadComment (top-level or reply), and the comment-like writer.
import { readThreadComments, createThreadComment, toggleReactionKind } from '@/data';
import {
  PostActions as SharedPostActions,
  type PostActionsProps,
} from '@web10/discover';

export type { PostActionMode, ReactionKind } from '@web10/discover';

type LegacyPostActionsProps = Omit<PostActionsProps, 'readComments' | 'createComment' | 'remote' | 'remoteHref' | 'onError' | 'onToggleCommentLike'>;

export function PostActions(props: LegacyPostActionsProps) {
  return (
    <SharedPostActions
      {...props}
      readComments={readThreadComments}
      createComment={createThreadComment}
      onToggleCommentLike={(commentId) => {
        void toggleReactionKind(commentId, 'like', props.groups, 'comments');
      }}
    />
  );
}
