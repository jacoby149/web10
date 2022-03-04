import React, { useState, useEffect } from "react"; { }
const Login = () => {
    const [items,setItems]=useState([])
    const [error,setError]=useState(false)

    useEffect(() =>{
        fetch("http://localhost:5000/api/v1.0/test")
        .then(res => res.json())
        .then(
            (result) => {

            },
            (error) => {
                setError(error)
            }
        )
    },[])
    if (error) {
        return <div>Error: {error.message}</div>;
    } else if (!isLoaded) {
        return <div>Loading...</div>;
    } else {
        return (
            <ul>
                {items.map(item => (
                    <li key={item.name}>
                        {item.name} {item.price}
                    </li>
                ))}
            </ul>
        );
    }
}

export default Login;