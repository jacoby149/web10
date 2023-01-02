import React from 'react';

function Contract({I,service}) {
    //const ContractI = useContractInterface(I);
    const [hide, setHide] = React.useState(true);
    function toggleHide() {
        setHide(!hide)
    }
    return (
        <div className="card setting">
            <header class="card-header">
                <p class="card-header-title">
                    {service}
                </p>
                <button onClick={toggleHide} class="card-header-icon" aria-label="more options">
                    <span class="icon">
                        <i class={hide ? "fas fa-angle-right" : "fas fa-angle-down"} aria-hidden="true"></i>
                    </span>
                </button>
            </header>
            <div style={hide ? { display: "none" } : {}} class="card-content">
                <div class="content">
                    Websites/IPs : <a>tbd</a><br></br>
                    Whitelist : <a>tbd</a><br></br>
                    Blacklist : <a>tbd</a>
                </div>
            </div>
            <footer style={hide ? { display: "none" } : {}} class="card-footer">
                <a href="#" class="card-footer-item">
                    view data
                    <i style={{marginLeft:"7px"}} class="fas fa-database" aria-hidden="true"></i>
                    </a>
                <a href="#" class="card-footer-item">
                    change terms
                    <i style={{ marginLeft: "7px" }} class="fas fa-pencil" aria-hidden="true"></i></a>
            </footer>
        </div>
    )
}

export default Contract;