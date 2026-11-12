import React from 'react';
import {createRoot} from 'react-dom/client';
import CloudApp from './CloudApp';
import OwnerPortalApp from './OwnerPortalApp';
import './styles.css';
// Business owners arrive through #portal=<invitation> or return to #owner; they never load the firm workspace.
const owner=/^#(owner|portal=)/.test(location.hash);
createRoot(document.getElementById('root')!).render(<React.StrictMode>{owner?<OwnerPortalApp/>:<CloudApp/>}</React.StrictMode>);
