import React from 'react';

function DevPay() {
    const [hide, setHide] = React.useState(true);
    function toggleHide() {
        setHide(!hide)
    }
    return (
        <div className="card setting">
            <header class="card-header">
                <p class="card-header-title">
                    DevPay
                </p>
                <button onClick={toggleHide} class="card-header-icon" aria-label="more options">
                    <span class="icon">
                        <i class={hide ? "fas fa-angle-right" : "fas fa-angle-down"} aria-hidden="true"></i>
                    </span>
                </button>
            </header>
            <footer style={hide ? { display: "none" } : {}} class="card-footer">
                <a href="#" class="card-footer-item">Connect To Bank</a>
                <a href="#" class="card-footer-item">DevPay Stats</a>
            </footer>
        </div>
    )
}

export default DevPay;