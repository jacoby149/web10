// D73: the comment thread now lives in the shared @web10/discover package
// (one source, both apps). This wrapper keeps the social app's existing
// consumer API (no data props) by injecting the wapi-backed readComments /
// createComment into the shared thread.
import { readComments, createComment as wapiCreateComment } from '@/data';
import { CommentThread as SharedCommentThread } from '@web10/discover';
import type { CreateComment } from '@web10/discover';

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

/** Adapt the wapi createComment to the package's injected CreateComment shape. */
const createComment: CreateComment = async ({ postId, text, groups, postAuthor, postService }) => {
  const created = await wapiCreateComment(
    { post_id: postId, text, created_at: new Date().toISOString() },
    groups ?? postAuthor,
    postService,
  );
  return created;
};

export function CommentThread(props: CommentThreadProps) {
  return (
    <SharedCommentThread
      {...props}
      readComments={readComments}
      createComment={createComment}
    />
  );
}
