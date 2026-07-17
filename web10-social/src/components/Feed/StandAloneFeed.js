// see public postings of your friends.
// see replies to those public postings.

import React from 'react';
import { R } from 'rectangles-npm'
import TopBar from '../shared/TopBar';
import SideBar from '../shared/SideBar';
import Feed from './Feed';

function StandAloneFeed({ I }) {
    return (
        <R root t bt bb br bl theme={I.theme}>
            <TopBar I={I} />
            <R l tel>
                <SideBar I={I}></SideBar>
                <R t tel>
                    <Feed I={I}></Feed>

                </R>
            </R>
        </R>
    );
}

export default StandAloneFeed;
