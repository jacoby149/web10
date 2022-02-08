import {pass,R,C,T} from 'Rectangles.js'

function Posts(props) {
    const final = [];
    for (let post of props.posts) {
        final.push(<Post post = {post} key = {Math.floor(Math.random()*987654321)}></Post>)
    }
    return (
        <R t tel>
            {final}
        </R>
    )
}

function Post(props) {
    return (
        // <C va = {'top'} p = {'10px 10px 10px 10px'} s = {'200px'}>
            <div className="box" style={{"margin":"5px"}}>
                <article className="media">
                <div className="media-left">
                    <figure className="image is-64x64">
                    <img src="https://bulma.io/images/placeholders/128x128.png" alt="Image"></img>
                    </figure>
                </div>
                <div className="media-content">
                    <div className="content">
                    <p>
                        <strong>{props.post.name}</strong> <small>{props.post.email}</small> <small>{props.post.time}</small>
                        <br/>
                        <a style = {{"color":"orange"}}>{props.post.subject}</a>
                    </p>

                        <div dangerouslySetInnerHTML={{__html: props.post.text}} />
                    
                    </div>
                    <nav className="level is-mobile">
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
                    </nav>
                </div>
                </article>
            </div>
        //   </C>
    )
} 

export {Posts};