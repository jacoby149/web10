import React from "react";
// TODO: figure out webpack aliasing
import { styles } from "../styles/styles";

export const DataContext = React.createContext(null)

export const useDataContext = () => React.useContext(DataContext)

export const StyleContext = (theme) => React.createContext(styles(theme))

export const useStyleContext = (theme) => React.useContext(StyleContext(theme))