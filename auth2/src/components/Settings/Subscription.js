import React from 'react';

function Subscription() {
    const [hide, setHide] = React.useState(false);
    function toggleHide() {
        setHide(!hide)
    }
    return (
        <div className="card setting">
            <header class="card-header">
                <p class="card-header-title">
                    Subscription Details
                </p>
                <button onClick={toggleHide} class="card-header-icon" aria-label="more options">
                    <span class="icon">
                        <i class={hide ? "fas fa-angle-right" : "fas fa-angle-down"} aria-hidden="true"></i>
                    </span>
                </button>
            </header>
            <div style={hide ? { display: "none" } : {}} class="card-content">
                <div class="content">
                    spent_this_month : <a>0.19873 / 2 credits</a><br></br>
                    space_utilization : <a>87.24MB / 100MB</a>
                </div>
            </div>
            <footer class="card-footer">
                <a href="#" class="card-footer-item">Space Plan</a>
                <a href="#" class="card-footer-item">Credit Plan</a>
                <a href="#" class="card-footer-item">Subscriptions</a>
            </footer>
        </div>
    )
}

export default Subscription;