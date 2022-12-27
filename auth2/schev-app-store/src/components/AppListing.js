//component that uses logo512.png as app icon and fake desc and title
import React from 'react';
function AppListing({title,description}) {

    return (
        <div class="box" style={{ margin: "10px" }}>
            <article class="media">
                <div class="media-left">
                    <figure class="image is-64x64">
                        <img src="https://bulma.io/images/placeholders/128x128.png" alt="Image" />
                    </figure>
                </div>
                <div class="media-content">
                    <div class="content">
                        <p>
                            <strong>{title}</strong> <small>@johnsmith</small> <small>31m</small>
                            <br />
                            {description}
                        </p>
                    </div>
                    <nav class="level is-mobile">
                        <div class="level-left">
                            <a class="level-item" aria-label="reply">
                                <span class="icon is-small">
                                    <i class="fas fa-reply" aria-hidden="true"></i>
                                </span>
                            </a>
                            <a class="level-item" aria-label="retweet">
                                <span class="icon is-small">
                                    <i class="fas fa-retweet" aria-hidden="true"></i>
                                </span>
                            </a>
                            <a class="level-item" aria-label="like">
                                <span class="icon is-small">
                                    <i class="fas fa-heart" aria-hidden="true"></i>
                                </span>
                            </a>
                        </div>
                    </nav>
                </div>
            </article>
        </div>)
}

export default AppListing;