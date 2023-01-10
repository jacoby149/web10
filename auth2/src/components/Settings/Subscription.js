import React from 'react';

function Subscription() {
    const [hide, setHide] = React.useState(false);
    function toggleHide() {
        setHide(!hide)
    }
    return (
        <div className="card setting">
            <header className="card-header">
                <p className="card-header-title">
                    Subscription Details
                </p>
                <button onClick={toggleHide} className="card-header-icon" aria-label="more options">
                    <span className="icon">
                        <i className={hide ? "fas fa-angle-right" : "fas fa-angle-down"} aria-hidden="true"></i>
                    </span>
                </button>
            </header>
            <div style={hide ? { display: "none" } : {}} className="card-content">
                <div className="content">
                    spent_this_month : <a>0.19873 / 2 credits</a><br></br>
                    space_utilization : <a>87.24MB / 100MB</a>
                </div>
            </div>
            <footer style={hide ? { display: "none" } : {}} className="card-footer">
                <a href="#" className="card-footer-item">Space Plan</a>
                <a href="#" className="card-footer-item">Credit Plan</a>
            </footer>
        </div>
    )
}

export default Subscription;