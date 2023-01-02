import ConfirmationPass from '../CredentialPage/FormInputs/ConfirmationPass';
import NewPassword from './FormInputs/NewPassword';
import ReTypeNewPass from './FormInputs/ReTypeNewPass';
import React from 'react';

function ChangePass({ I }) {
    const [hide,setHide] = React.useState(true);
    function toggleHide(){
        setHide(!hide)
    }
    return (
        <div className="card setting">
            <header class="card-header">
                <p class="card-header-title">
                    Change Password
                </p>
                <button onClick={toggleHide} class="card-header-icon" aria-label="more options">
                    <span class="icon">
                        <i class={hide?"fas fa-angle-right":"fas fa-angle-down"} aria-hidden="true"></i>
                    </span>
                </button>
            </header>
            <div style={hide?{display:"none"}:{}} class="card-content">
                <div class="content">
                    <div style={{ width: "300px" }}>
                        <NewPassword I={I} />
                        <ReTypeNewPass I={I} />
                        <ConfirmationPass I={I}></ConfirmationPass>
                    </div>
                    <button style={{ marginTop: "10px" }} className='button is-warning is-small'>Change Password</button>
                </div>
            </div>
        </div>
    )
}

export default ChangePass;