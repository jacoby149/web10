import React from 'react';

function DevPay({ I }: { I: Record<string, any> }) {
    const [hide, setHide] = React.useState(true);
    function toggleHide() {
        setHide(!hide)
    }
    return (
        <div className="card setting">
            <header className="card-header">
                <p className="card-header-title">
                    DevPay
                </p>
                <button onClick={toggleHide} className="card-header-icon" aria-label="more options">
                    <span className="icon">
                        <i className={hide ? "fas fa-angle-right" : "fas fa-angle-down"} aria-hidden="true"></i>
                    </span>
                </button>
            </header>
            <footer style={hide ? { display: "none" } : {}} className="card-footer">
                <a href="#" className="card-footer-item" onClick={() => I.manageBusiness()}>Connect To Bank</a>
                <a href="#" className="card-footer-item" onClick={() => I.businessLogin()}>DevPay Stats</a>
            </footer>
        </div>
    )
}

export default DevPay;