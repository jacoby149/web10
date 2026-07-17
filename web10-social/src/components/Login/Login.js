// see people you are messaging, the last message.
// active status, etc.

import { R, C } from 'rectangles-npm'
import '../Components.css';
import TopBar
    from '../shared/TopBar';
import Sidebar from '../shared/SideBar';

function Login({ I }) {
    return (
        <R root t bt bb br bl onClick={I.toggleTheme} theme={I.theme}>
                <C va="center" ha="center" t tel>
                    <div style={{textAlign:"center"}}>
                        <b>Welcome To Web10 Social!</b><br></br><br></br>
                        <button onClick={I.login} className='button is-primary'>Log In</button>
                    </div>
                </C>
        </R>
    );
}

export default Login;
