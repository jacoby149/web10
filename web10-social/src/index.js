import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import {startRectangles} from 'rectangles-npm'
import 'rectangles-npm/src/Rectangles.css'

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
    <App />
);
startRectangles(document.getElementById('root'))
