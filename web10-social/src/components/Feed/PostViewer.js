import DOMPurify from 'dompurify'
import Media from './Media';

function PostViewer({ I, postI }) {
    const post = postI.post;
    const mediaItems = post.media.map(
        (item, index) => <Media type={item.type} src={item.src} I={I} postI={postI} key={index}></Media>
    )
    const identity = I.isMe(post.web10) ? I.identity : I.getContact(post.web10)
    var config = { ADD_TAGS: ['iframe'], KEEP_CONTENT: false }
    
    return (
        <div className="box" style={{ margin: "5px", marginLeft: "10px" }}>
            <article className="media">
                <div className="media-left">
                    <figure className="image is-48x48">
                        <img src={identity.pic} alt="Image"></img>
                    </figure>
                </div>
                <div className="media-content">
                    <div className="content">
                        <p>
                            <strong>
                                {identity.name} &nbsp;
                                {
                                    I.isMe(post.web10) ?
                                        <i
                                            onClick={postI.toggleEditMode}
                                            style={{ color: "orange" }}
                                            className={"fa fa-pencil font-weight-bold"}></i> : ""
                                }
                            </strong>

                            <br></br>[ <small style={{ color: "teal" }}><u>{post.web10}</u></small> ]  <small>{post.time}</small>
                        </p>

                        <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(post.html, config) }} />
                        <div>
                                {mediaItems}
                        </div>

                    </div>
                    {/*<nav className="level is-mobile">
                <div className="level-left">
                    <a className="level-item" aria-label="reply">
                    <span className="icon is-small">
                        <i className="fas fa-reply" aria-hidden="true"></i>
                    </span>
                    </a>
                    <a className="level-item" aria-label="retweet">
                    <span className="icon is-small">
                        <i className="fas fa-retweet" aria-hidden="true"></i>
                    </span>
                    </a>
                    <a className="level-item" aria-label="like">
                    <span className="icon is-small">
                        <i className="fas fa-heart" aria-hidden="true"></i>
                    </span>
                    </a>
                </div>
</nav>*/}
                </div>
            </article>
        </div>
    )
}

export default PostViewer;