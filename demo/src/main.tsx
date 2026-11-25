import React from 'react';
import {createRoot} from 'react-dom/client';
import CloudApp from './CloudApp';
import OwnerPortalApp from './OwnerPortalApp';
import BrokerSite from './site/BrokerSite';
import HelperApp from './pro/HelperApp';
import SampleOwnerApp from './SampleOwner';
import './design/tokens.css';
import '@fontsource-variable/zalando-sans/wght.css';
import '@fontsource/forum/400.css';
import './styles.css';
import './design/theme.css';
// Public brokerage site by default. Owners use #owner / #portal=…; owners’ staff use #helper; advisors use #advisor;
// #sample opens a fictional owner portal held in memory, for showing Kalling on a phone.
const h=location.hash,owner=/^#(owner|portal=)/.test(h),advisor=/^#\/?advisor/.test(h),helper=/^#helper/.test(h),sample=/^#sample/.test(h);
createRoot(document.getElementById('root')!).render(<React.StrictMode>{sample?<SampleOwnerApp/>:owner?<OwnerPortalApp/>:helper?<HelperApp/>:advisor?<CloudApp/>:<BrokerSite/>}</React.StrictMode>);
// Switching between the three apps through links reloads the right one.
addEventListener('hashchange',()=>{const n=location.hash,o=/^#(owner|portal=)/.test(n),a=/^#\/?advisor/.test(n),s=/^#sample/.test(n);if(o!==owner||a!==advisor||s!==sample)location.reload();});
