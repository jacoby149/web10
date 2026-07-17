import Phone from '../CredentialPage/FormInputs/Phone';
import ConfirmationPass from '../CredentialPage/FormInputs/ConfirmationPass';
import React from 'react';

function ChangePhone({ I }: { I: Record<string, any> }) {
    const [hide, setHide] = React.useState(true);
    const [phone, setPhone] = React.useState("");
    const [password, setPassword] = React.useState("");

    function toggleHide() {
        setHide(!hide)
    }

    return (
        <div className="card setting">
            <header className="card-header">
                <p className="card-header-title">
                    Change Phone Number
                </p>
                <button onClick={toggleHide} className="card-header-icon" aria-label="more options">
                    <span className="icon">
                        <i className={hide ? "fas fa-angle-right" : "fas fa-angle-down"} aria-hidden="true"></i>
                    </span>
                </button>
            </header>
            <div style={hide ? { display: "none" } : {}} className="card-content">
                <div className="content">
                    <div style={{ width: "300px" }}>
                        <Phone I={I} value={phone} onChange={setPhone} />
                        <ConfirmationPass I={I} value={password} onChange={setPassword} />
                    </div>
                    <button
                        onClick={() => I.changePhoneNumber(password, phone)}
                        style={{ marginTop: "10px" }}
                        className='button is-warning is-small'
                    >
                        Change Phone Number
                    </button>
                </div>
            </div>
        </div>
    )
}

export default ChangePhone;