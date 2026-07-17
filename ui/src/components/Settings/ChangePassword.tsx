import ConfirmationPass from '../CredentialPage/FormInputs/ConfirmationPass';
import NewPassword from './FormInputs/NewPassword';
import ReTypeNewPass from './FormInputs/ReTypeNewPass';
import React from 'react';

function ChangePass({ I }: { I: Record<string, any> }) {
    const [hide, setHide] = React.useState(true);
    const [newPass, setNewPass] = React.useState("");
    const [retypeNewPass, setRetypeNewPass] = React.useState("");
    const [currentPass, setCurrentPass] = React.useState("");

    function toggleHide() {
        setHide(!hide)
    }
    return (
        <div className="card setting">
            <header className="card-header">
                <p className="card-header-title">
                    Change Password
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
                        <NewPassword I={I} value={newPass} onChange={setNewPass} />
                        <ReTypeNewPass I={I} value={retypeNewPass} onChange={setRetypeNewPass} />
                        <ConfirmationPass I={I} value={currentPass} onChange={setCurrentPass} />
                    </div>
                    <button
                        onClick={() => I.changePassword(currentPass, newPass, retypeNewPass)}
                        style={{ marginTop: "10px" }}
                        className='button is-warning is-small'
                    >
                        Change Password
                    </button>
                </div>
            </div>
        </div>
    )
}

export default ChangePass;