import { RawIcon } from "../shared/Icon"
import mockMedia from "../../mocks/MockMedia";
import Media from "./Media";


function PostMaker({ I, postI }) {

    function readAsDataURL(file) {
        return new Promise((resolve, reject) => {
            const fr = new FileReader();
            fr.onerror = reject;
            fr.onload = () => {
                resolve(fr.result);
            }
            fr.readAsDataURL(file);
        });
    }

    function setHTML(html) {
        postI.setDraftPost({ ...postI.draftPost, html: html })
    }

    function addMedia(files, type) {
        Promise.all(files.map(readAsDataURL))
            .then((blobs) => {
                const links = [...postI.draftPost.media].concat(blobs.map((blob) => {
                    return { src: blob, type: type }
                }))
                postI.setDraftPost({ ...postI.draftPost, media: links })
            })
    }
    const mediaItems = postI.draftPost.media.map(
        (item, index) => <Media I={I} postI={postI} type={item.type} src={item.src} key={index} idx={index}></Media>
    )
    return (
        <div>
            <div style={{ height: "5px" }} />
            <div className="card" style={{ marginLeft: "10px", marginRight: "5px" }}>
                <header className="card-header">

                    <p className="card-header-title">
                        {postI.mode === "edit" ?
                            <i onClick={postI.clearChanges} style={{ color: "orange", marginRight: "10px" }} className={"fa fa-2x fa-circle-xmark font-weight-bold"}></i> : ""
                        }

                        {postI.mode === "create" && (postI.draftPost.html || postI.draftPost.media.length > 0) ?
                            <i onClick={postI.clearChanges} style={{ color: "orange", marginRight: "10px" }} className={"fa fa-2x fa-circle-xmark font-weight-bold"}></i> : ""
                        }


                        <img style={{ height: "48px", marginRight: "10px" }} src={I.identity.pic} />
                        {postI.mode === "edit" ?
                            "Edit This Post"
                            :
                            "Make a New Post"
                        }
                    </p>

                    {postI.mode === "edit" ?
                        <div>
                            <button onClick={postI.saveChanges} style={{ margin: "15px", width: "130px" }} className={"button is-primary"}>Save Edits
                                <i style={{ marginLeft: "10px" }} className={"fa fa-check font-weight-bold"}></i>
                            </button>
                        </div>
                        :
                        <div>
                            <button onClick={postI.createPost} style={{ margin: "15px", width: "130px" }} className={"button is-primary"}>Create Post</button>
                        </div>

                    }
                </header>
                <div className="card-content">
                    <div className="content">
                        <div className="control">
                            <textarea onChange={(e) => setHTML(e.target.value)} className="textarea" value={postI.draftPost.html} placeholder="What is on your mind??"></textarea>
                        </div>
                        <div>
                            {mediaItems}
                        </div>
                    </div>
                </div>
                <footer className="card-footer">

                    <label className="card-footer-item post">
                        <input
                            type="file"
                            style={{ display: "none" }}
                            accept="video/*"
                            onChange={(event) => {
                                const files = Object.values(event.target.files);
                                addMedia(files, "video");
                            }}
                            multiple={true}
                        />
                        Video <RawIcon>video-plus</RawIcon>
                    </label>

                    <label className="card-footer-item post">
                        <input
                            type="file"
                            style={{ display: "none" }}
                            accept="image/*"
                            onChange={(event) => {
                                const files = Object.values(event.target.files);
                                addMedia(files, "image");
                            }}
                            multiple={true}
                        />
                        Photo <RawIcon >photo</RawIcon>
                    </label>
                    {
                        postI.mode === "edit" ?
                            <a onClick={postI.deletePost} className="card-footer-item post">Delete Post <RawIcon >trash</RawIcon></a> : ""}

                    {/*<a href="#" className="card-footer-item post">Audio <RawIcon>microphone-stand</RawIcon></a>*/}
                </footer>
            </div>
        </div>)
}

export default PostMaker