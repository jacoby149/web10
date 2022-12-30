function AppListing({ title, img }) {
    const placeHolderImg = "https://bulma.io/images/placeholders/128x128.png";
    return (
        <div className="box" style={{ margin: "10px", backgroundColor: "#00000000" }}>
            <div className="card-image">
                <figure className="image is-2by2">
                    <img style={{ borderRadius: "10px" }} src={img?img:placeHolderImg} alt="Placeholder image" />
                </figure>
            </div>
            <article className="media">
                <div className="media-content">
                    <div className="content" style={{ marginTop: "10px" }}>
                        <p>
                            <strong>{title}</strong> <br></br><small>3,193 hits</small>
                        </p>
                    </div>
                </div>
            </article>
        </div>)
}

function AppRow({ data }) {
    const apps = data.map((e,index) =>
        <div key={index } className="column">
            <AppListing title={e.title} img={e.img}></AppListing>
        </div>

    )
    return (
        <div className="columns is-mobile" style={{ width: "100%" }}>
            {apps}
        </div>
    )
}

export { AppRow };