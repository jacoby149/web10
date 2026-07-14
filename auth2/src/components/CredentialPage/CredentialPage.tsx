// see stuff about a friend + friend group
// pictures, media , text about them. 
// also configure ( manage notifications / unfriend / unfollow )

import { R } from 'rectangles-npm'
import TopBar from '../shared/TopBar';
import SideBar from '../shared/SideBar';
import LoginForm from './LoginForm';
import ForgotForm from './ForgotForm';
import SignupForm from './SignupForm';

function CredentialForm({ I }) {
    switch (I.mode) {
        case "login": return <LoginForm I={I} />;
        case "signup": return <SignupForm I={I} />;
        case "forgot": return <ForgotForm I={I} />;
        default: return <LoginForm I={I} />;
    }
}

function CredentialPage({ I }) {
    return (
        <R root t bt bb br bl theme={I.theme}>
            <TopBar I={I}></TopBar>
            <R l tel>
                <SideBar I={I}></SideBar>
                <R t tel>
                    {

                    }
                    <CredentialForm I={I} />
                </R>
            </R>
        </R>
    );
}

export default CredentialPage;
