// D73: the engagement row now lives in the shared @web10/discover package
// (one source, both apps). This wrapper keeps the social app's existing
// consumer API (no data props) by injecting the wapi-backed thread seams
// (comments.md): readThreadComments (paged top-level + comment likes +
// replyCounts), readThreadReplies (paged "view more replies"),
// createThreadComment (top-level or reply), and the comment-like writer.
import { readThreadComments, readThreadReplies, createThreadComment, toggleReactionKind, updateComment, deleteComment } from '@/data';
import {
  PostActions as SharedPostActions,
  type PostActionsProps,
} from '@web10/discover';

export type { PostActionMode, ReactionKind } from '@web10/discover';

type LegacyPostActionsProps = Omit<PostActionsProps, 'readComments' | 'readReplies' | 'createComment' | 'remote' | 'remoteHref' | 'onError' | 'onToggleCommentLike' | 'onUpdateComment' | 'onDeleteComment'>;

export function PostActions(props: LegacyPostActionsProps) {
  return (
    <SharedPostActions
      {...props}
      readComments={readThreadComments}
      readReplies={readThreadReplies}
      createComment={createThreadComment}
      onToggleCommentLike={(commentId) => {
        // The thread does the optimistic flip + rollback; returning the write's
        // promise lets it roll back on a failed write.
        return toggleReactionKind(commentId, 'like', props.groups, 'comments');
      }}
      onUpdateComment={(commentId, text) => {
        // The thread does the optimistic text swap + rollback; returning the
        // write's promise lets it roll back on a failed write.
        return updateComment(commentId, { text });
      }}
      onDeleteComment={(commentId) => {
        // The thread removes the node's subtree optimistically + rolls back on
        // a failed write.
        return deleteComment(commentId);
      }}
    />
  );
}
