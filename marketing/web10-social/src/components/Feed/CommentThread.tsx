// D73: the comment thread now lives in the shared @web10/discover package
// (one source, both apps). This wrapper keeps the social app's existing
// consumer API (no data props) by injecting the wapi-backed thread seams
// (comments.md): readThreadComments (the whole conversation + comment likes),
// createThreadComment (top-level or reply), and the comment-like writer.
import { readThreadComments, createThreadComment, toggleReactionKind } from '@/data';
import { CommentThread as SharedCommentThread } from '@web10/discover';

interface CommentThreadProps {
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
}

export function CommentThread(props: CommentThreadProps) {
  return (
    <SharedCommentThread
      {...props}
      readComments={readThreadComments}
      createComment={createThreadComment}
      onToggleCommentLike={(commentId) => {
        // The comment-like tap: the data layer resolves it against the
        // reader's current reaction (like XOR dislike, self-heal,
        // username-alone ownership — the post-like primitives, with
        // target_service 'comments'). The thread re-reads on the next open.
        void toggleReactionKind(commentId, 'like', props.groups, 'comments');
      }}
    />
  );
}
