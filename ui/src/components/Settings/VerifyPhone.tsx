import VerificationInput from 'react-verification-input';
import React from 'react';

function VerifyPhone({ I }: { I: Record<string, any> }) {
    const [hide, setHide] = React.useState(true);
    const [code, setCode] = React.useState("");

    function toggleHide() {
        setHide(!hide)
    }

    return (
        <div className="card setting">
            <header className="card-header">
                <p className="card-header-title">
                    Verify Phone Number
                </p>
                <button onClick={toggleHide} className="card-header-icon" aria-label="more options">
                    <span className="icon">
                        <i className={hide ? "fas fa-angle-right" : "fas fa-angle-down"} aria-hidden="true"></i>
                    </span>
                </button>
            </header>
            <div style={hide ? { display: "none" } : {}} className="card-content">
                <div className="content">
                    <div style={{ width: "600px" }}>
                        <VerificationInput
                            onChange={(val) => {
                                setCode(val);
                                I.verificationChange(val);
                            }}
                            classNames={{
                                container: "container",
                                character: "character",
                                characterInactive: "character--inactive",
                                characterSelected: "character--selected",
                            }}
                        />
                    </div>
                    <div style={{ marginTop: "10px" }}>
                        <button
                            onClick={() => I.sendCode()}
                            style={{ marginRight: "5px" }}
                            className='button is-warning is-small'
                        >
                            Send Code
                        </button>
                        <button
                            onClick={() => {
                                if (code.length === 6) {
                                    I.verifyCode(code);
                                }
                            }}
                            className='button is-primary is-small'
                        >
                            Verify Code
                        </button>
                    </div>
                    <p style={{ color: "orange", marginLeft: "2px", marginTop: "10px" }}>
                        Verify your phone number and receive free web10 credits
                    </p>
                </div>
            </div>
        </div>
    )
}

export default VerifyPhone;