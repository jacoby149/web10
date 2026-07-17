import React from 'react';

function Subscription({ I }: { I: Record<string, any> }) {
    const [hide, setHide] = React.useState(false);
    const [plan, setPlan] = React.useState("MB/mo. 0, Credits/mo. 0");
    const [util, setUtil] = React.useState("Storage Utilization: _ / 0 MB");

    React.useEffect(() => {
        if (I.isAuthenticated()) {
            I.getPlan()
                .then((response: any) => {
                    const data = response.data;
                    const [space, credit, used] = [
                        parseFloat(data["space"]).toFixed(2),
                        parseFloat(data["credits"]).toFixed(2),
                        parseFloat(data["used_space"]).toFixed(4),
                    ];
                    setPlan(`MB/mo. ${space}, Credits/mo. ${credit}`);
                    setUtil(`Storage Utilization: ${used} / ${space} MB`);
                })
                .catch(() => { });
        }
    }, [I.auth]);

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
                    <input size={plan.length} placeholder={plan} readOnly style={{ marginBottom: "5px" }}></input><br />
                    <p style={{ marginLeft: "2px", color: "gray", fontFamily: "monospace" }}>{util}</p>
                </div>
            </div>
            <footer style={hide ? { display: "none" } : {}} className="card-footer">
                <a href="#" className="card-footer-item" onClick={() => I.manageSpace()}>Space Plan</a>
                <a href="#" className="card-footer-item" onClick={() => I.manageCredits()}>Credit Plan</a>
                <a href="#" className="card-footer-item" onClick={() => I.manageSubscriptions()}>Subscriptions</a>
            </footer>
        </div>
    )
}

export default Subscription;