//component that uses logo512.png as app icon and fake desc and title
import React from 'react';
function AppListing({title,description}) {

    return (
        <div className="box" style={{ margin: "10px" }}>
            <article className="media">
                <div className="media-left">
                    <figure className="image is-64x64">
                        <img src="https://bulma.io/images/placeholders/128x128.png" alt="Image" />
                    </figure>
                </div>
                <div className="media-content">
                    <div className="content">
                        <p>
                            <strong>{title}</strong> <small>@johnsmith</small> <small>31m</small>
                            <br />
                            {description}
                        </p>
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
        </div>)
}

export default AppListing;