import VerificationInput from 'react-verification-input';
import React from 'react';

function VerifyPhone({ I }) {
    const [hide, setHide] = React.useState(true);
    function toggleHide() {
        setHide(!hide)
    }
    const [verify, setVerify] = React.useState(true);
    function toggleVerify() {
        setVerify(!verify)
    }

    return (
        <div className="card setting">
            <header class="card-header">
                <p class="card-header-title">
                    Verify Phone Number
                </p>
                <button onClick={toggleHide} class="card-header-icon" aria-label="more options">
                    <span class="icon">
                        <i class={hide ? "fas fa-angle-right" : "fas fa-angle-down"} aria-hidden="true"></i>
                    </span>
                </button>
            </header>
            <div style={hide ? { display: "none" } : {}} class="card-content">
                <div class="content">

                    <div style={{ width: "600px" }}>
                        <VerificationInput
                            classNames={{
                                container: "container",
                                character: "character",
                                characterInactive: "character--inactive",
                                characterSelected: "character--selected",
                            }}
                        />
                    </div>
                    <button style={{ marginTop: "10px" }} className='button is-warning is-small'>Resend Code</button>
                </div>
            </div>
        </div>
    )
}

export default VerifyPhone;