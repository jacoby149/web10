import Phone from '../CredentialPage/FormInputs/Phone';
import ConfirmationPass from '../CredentialPage/FormInputs/ConfirmationPass';
import React from 'react';

function ChangePhone({I}) {
    const [hide,setHide] = React.useState(true);
    function toggleHide(){
        setHide(!hide)
    }
    return (
        <div className="card setting">
            <header class="card-header">
                <p class="card-header-title">
                    Change Phone Number
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
                        <Phone I={I}></Phone>
                        <ConfirmationPass I={I}></ConfirmationPass>
                    </div>
                    <button style={{ marginTop: "10px" }} className='button is-warning is-small'>Change Phone Number</button>
                </div>
            </div>
        </div>
    )
}

export default ChangePhone;