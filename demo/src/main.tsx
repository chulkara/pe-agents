import React from 'react';
import {createRoot} from 'react-dom/client';
import CloudApp from './CloudApp';
import OwnerPortalApp from './OwnerPortalApp';
import BrokerSite from './site/BrokerSite';
import './design/tokens.css';
import '@fontsource-variable/zalando-sans/wght.css';
import '@fontsource/forum/400.css';
import './styles.css';
import './design/theme.css';
// Public brokerage site by default. Owners use #owner / #portal=…; advisors use #advisor.
const h=location.hash,owner=/^#(owner|portal=)/.test(h),advisor=/^#\/?advisor/.test(h);
createRoot(document.getElementById('root')!).render(<React.StrictMode>{owner?<OwnerPortalApp/>:advisor?<CloudApp/>:<BrokerSite/>}</React.StrictMode>);
// Switching between the three apps through links reloads the right one.
addEventListener('hashchange',()=>{const n=location.hash,o=/^#(owner|portal=)/.test(n),a=/^#\/?advisor/.test(n);if(o!==owner||a!==advisor)location.reload();});
