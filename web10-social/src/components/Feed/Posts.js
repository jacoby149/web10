
import { R } from 'rectangles-npm'
import React from 'react'
import PostMaker from './PostMaker';
import PostViewer from './PostViewer';
import usePostInterface from '../../interfaces/PostInterface';

function Posts({ I, posts }) {
    const final = [];
    for (const [index, post] of posts.entries()) {
        final.push(<Post key={index} I={I} post={post}></Post>)
    }
    return (
        <R t tel>
            {final}
        </R>
    )
}

function Post({ I, post }) {
    const postI = usePostInterface(I,post);
    return postI.mode==="edit" ?
        <PostMaker I={I} postI={postI}></PostMaker> :
        <PostViewer I={I} postI={postI}></PostViewer>
}

export { Posts };