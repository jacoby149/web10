// D73: the comment thread now lives in the shared @web10/discover package
// (one source, both apps). This wrapper keeps the social app's existing
// consumer API (no data props) by injecting the wapi-backed thread seams
// (comments.md): readThreadComments (the whole conversation + comment likes),
// createThreadComment (top-level or reply), and the comment-like writer.
import { readThreadComments, readThreadReplies, createThreadComment, uploadCommentPhoto, toggleReactionKind, updateComment, deleteComment } from '@/data';
import { CommentThread as SharedCommentThread } from '@web10/discover';
import { useActingAuthor } from '@/data/actingIdentity';
import { renderMentionInput } from '@/components/shared/MentionInput';
import { readCommentAnchor } from '@/data/comments';
import { useInRouterContext, useNavigate } from 'react-router-dom';

interface CommentThreadProps {
  readOnly?: boolean;
  postId: string;
  isOpen: boolean;
  count: number;
  onCountChange: (n: number) => void;
  postAuthor?: string;
  postService?: string;
  highlightedCommentId?: string;
  /** The group the post lives in (group posts — comments attach to the group,
   *  not the discover board). */
  groups?: string[];
  /** The author-click handler (in-app profile navigation) — a comment's author
   *  is a tappable profile link. */
  onAuthorClick?: (username: string, provider?: string) => void;
}

export function CommentThread(props: CommentThreadProps) {
  const routed = useInRouterContext();
  return routed ? <RoutedThread {...props} /> : <Thread {...props} />;
}

function RoutedThread(props: CommentThreadProps) {
  const navigate = useNavigate();
  return <Thread {...props} onHashtagClick={tag => navigate(`/tag/${encodeURIComponent(tag)}`)} />;
}

function Thread({ onHashtagClick, ...props }: CommentThreadProps & { onHashtagClick?: (tag: string) => void }) {
  const identity = useActingAuthor();
  return (
    <SharedCommentThread
      {...props}
      onHashtagClick={onHashtagClick}
      renderInput={renderMentionInput}
      readAnchor={readCommentAnchor}
      actionIdentity={identity}
      readComments={readThreadComments}
      readReplies={readThreadReplies}
      createComment={createThreadComment}
      uploadMedia={uploadCommentPhoto}
      onToggleCommentLike={(commentId) => {
        // The comment-like tap: the data layer resolves it against the
        // reader's current reaction (like XOR dislike, self-heal,
        // username-alone ownership — the post-like primitives, with
        // target_service 'comments'). The thread does the optimistic flip +
        // rollback; returning the write's promise lets it roll back on a
        // failed write.
        return toggleReactionKind(commentId, 'like', props.groups, 'comments');
      }}
      onUpdateComment={(commentId, text) => {
        // The comment-edit write: the thread does the optimistic text swap +
        // rollback; returning the write's promise lets it roll back on a
        // failed write. Only reachable on the reader's OWN comments (the
        // thread gates on `isOwn`, resolved in the data layer).
        return updateComment(commentId, { text });
      }}
      onDeleteComment={(commentId) => {
        // The comment-delete write: the thread removes the node's subtree
        // optimistically + rolls back on a failed write.
        return deleteComment(commentId);
      }}
    />
  );
}
