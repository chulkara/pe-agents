import { useEffect, useState, useRef, type FormEvent } from 'react';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import Workspace from './Workspace';
import CloudConsole from './CloudConsole';
import { CONFIG_KEY, DISCONNECTED_KEY, deviceConnection, clientFor, validateCloudConfig, emptyCloudWorkspace, readCloudWorkspace, writeCloudWorkspace, rpc, type CloudConfig, type CloudRecord, type CloudFirm, type Membership } from '../lib/cloud';
import type { Workspace as Data } from '../lib/domain';
import './cloud.css';
export default function CloudApp() {
    const [view, setView] = useState<'demo' | 'account' | 'workspace'>('demo'), [client, setClient] = useState<SupabaseClient | null>(null), [user, setUser] = useState<User | null>(null), [firms, setFirms] = useState<CloudFirm[]>([]), [members, setMembers] = useState<Membership[]>([]), [record, setRecord] = useState<CloudRecord | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState(''), [mode, setMode] = useState('Sign in'), [connection, setConnection] = useState<CloudConfig>({ url: '', publishableKey: '' }), [checked, setChecked] = useState(false);
    const identity = useRef(''), explicitDemo = useRef(false), refreshSequence = useRef(0);
    useEffect(() => { try {
        const cfg = deviceConnection(localStorage.getItem(CONFIG_KEY),localStorage.getItem(DISCONNECTED_KEY)==='true');
        if (cfg) {
            setConnection(cfg);
            void clientFor(cfg).then(setClient).catch(e => setError(e.message));
        }
    }
    catch {
        setError('Saved cloud configuration is invalid. Reconnect using public project settings.');
    } setChecked(true); }, []);
    async function refresh(c = client) { if (!c)
        return; const sequence = ++refreshSequence.current; const { data, error } = await c.auth.getUser(); if (sequence !== refreshSequence.current)
        return; if (error || !data.user) {
        setUser(null);
        setFirms([]);
        setMembers([]);
        setRecord(null);
        return;
    } identity.current = data.user.id; setUser(data.user); if(!explicitDemo.current)setView(v=>v==='demo'?'account':v); const list = await c.from('kalling_firms').select('id,name').order('created_at'); if (list.error)
        throw Error('Cloud database is not ready: ' + list.error.message); const mem = await c.from('kalling_members').select('*').eq('user_id', data.user.id).eq('active', true); if (mem.error)
        throw Error(mem.error.message); if (sequence !== refreshSequence.current)
        return; setFirms(list.data || []); setMembers(mem.data || []); }
    useEffect(() => { if (!client)
        return; void refresh(client).catch(e => setError(e.message)); const { data } = client.auth.onAuthStateChange((event, session) => { if (event === 'SIGNED_OUT' || (event === 'SIGNED_IN' && identity.current && session?.user.id !== identity.current)) {
        setRecord(null);
        setView('account');
    } if (event === 'SIGNED_OUT') {
        refreshSequence.current++;
        identity.current = '';
        setUser(null);
        setFirms([]);
        setMembers([]);
    }
    else if (event === 'SIGNED_IN')
        setTimeout(() => { void refresh(client).catch(e => setError(e.message)); }, 0); }); return () => data.subscription.unsubscribe(); }, [client]);
    async function act(fn: () => Promise<void>) { setBusy(true); setError(''); setNotice(''); try {
        await fn();
    }
    catch (e) {
        setError(e instanceof Error ? e.message : 'Cloud action failed.');
    }
    finally {
        setBusy(false);
    } }
    async function openFirm(firm: string) { if (!client)
        return; const m = members.find(m => m.firm_id === firm); if (!m)
        throw Error('Membership unavailable. Refresh your firms.'); const account = identity.current; const r = await readCloudWorkspace(client, firm, m.role); if (identity.current !== account || !account)
        throw Error('Account changed. Select your firm again.'); setRecord(r); setView('workspace'); }
    async function saveCloud(data: Data, reason: string) { if (!client || !record)
        throw Error('Sign in and select a firm.'); const account = identity.current; const version = await writeCloudWorkspace(client, record, data, reason); if (identity.current !== account || !account)
        throw Error('Account changed during save. Reopen the firm to check its latest revision.'); setRecord({ ...record, data, version }); return true; }
    async function authenticate(e: FormEvent<HTMLFormElement>) { e.preventDefault(); const d = new FormData(e.currentTarget), email = String(d.get('email')), password = String(d.get('password')); await act(async () => { if (!client)
        return; if (mode === 'Create account') {
        const { error } = await client.auth.signUp({ email, password, options: { emailRedirectTo: location.origin + location.pathname } });
        if (error)
            throw Error(error.message);
        setNotice('Check your email to confirm the account. Hosted email limits apply; confirmation must be configured before inviting external testers.');
    }
    else {
        const { error } = await client.auth.signInWithPassword({ email, password });
        if (error)
            throw Error(error.message);
        await refresh();
    } }); }
    const account = () => { explicitDemo.current=false;setView('account'); setError(''); if (client)
        void act(() => refresh()); };
    if (view === 'demo')
        return <Workspace openAccount={account}/>;
    if (view === 'workspace' && client && record && user)
        return <Workspace key={user.id + record.firmId} initialWorkspace={record.data} persist={saveCloud} cloud={{ firmId: record.firmId, role: record.role, email: user.email || user.id }} openAccount={account}/>;
    return <div className="cloud-page"><header className="cloud-header"><button className="cloud-brand" onClick={() => {explicitDemo.current=true;setView('demo');}}>kalling<span>.</span></button><button className="btn" onClick={() => {explicitDemo.current=true;setView('demo');}}>Open local demo</button></header><main className="cloud-content"><div className="eyebrow">THE FOUNDATION / YOUR FIRM’S WORKSPACE</div><h1>Built around trust.<br /><span>Ready for real work.</span></h1><p className="cloud-intro">Kalling helps a small acquisition team find, evaluate, acquire, and operate businesses—with agents doing the preparation and people owning the decisions.</p>
 {error && <div className="error-banner" role="alert">{error}</div>}{notice && <div className="cloud-notice" role="status">{notice}</div>}
 {!client && checked && <section className="panel cloud-card"><div className="eyebrow">CLOUD NOT CONNECTED</div><h2>Connect your free Supabase project.</h2><p>The public demo stays local. Cloud mode requires the database migrations and scheduler in the repository’s production folder. Connecting does not copy your local records.</p><form onSubmit={e => { e.preventDefault(); void act(async () => { const config = validateCloudConfig(connection); localStorage.setItem(CONFIG_KEY, JSON.stringify(config)); localStorage.removeItem(DISCONNECTED_KEY); setClient(await clientFor(config)); }); }}><label className="field"><span>Supabase project URL</span><input required type="url" value={connection.url} placeholder="https://your-project.supabase.co" onChange={e => setConnection({ ...connection, url: e.target.value })}/></label><label className="field"><span>Public publishable key · never a secret key</span><input required autoComplete="off" value={connection.publishableKey} onChange={e => setConnection({ ...connection, publishableKey: e.target.value })}/></label><button className="btn primary" disabled={busy}>Connect project</button></form><p className="footnote">Public connection settings stay on this device. Service-role keys are rejected. No paid services are enabled.</p></section>}
 {client && !user && <section className="panel cloud-card"><div className="cloud-tabs">{['Sign in', 'Create account'].map(x => <button className={'btn ' + (mode === x ? 'primary' : '')} key={x} onClick={() => setMode(x)}>{x}</button>)}</div><div className="eyebrow">KALLING CLOUD / CONNECTED</div><h2>Your own account. Your firm’s records.</h2><form onSubmit={authenticate}><label className="field"><span>Email address</span><input required type="email" name="email" autoComplete="email"/></label><label className="field"><span>Password</span><input required type="password" name="password" minLength={12} autoComplete={mode === 'Sign in' ? 'current-password' : 'new-password'}/></label><button className="btn primary" disabled={busy}>{busy ? 'Working…' : mode}</button></form><p>Account creation requires email confirmation. For initial free testing, the project administrator can provision a confirmed account through Supabase. Configure an email provider before external onboarding.</p></section>}
 {client && user && <><div className="cloud-identity"><span>Signed in as <strong>{user.email}</strong></span><button className="text-link" disabled={busy} onClick={() => void act(async () => { const { error } = await client.auth.signOut(); if (error)
            throw Error(error.message); setRecord(null); setUser(null); })}>Sign out</button></div><div className="cloud-grid"><section className="panel cloud-card"><div className="eyebrow">SEPARATE FIRMS / SHARED PROCESS</div><h2>Your firm workspaces.</h2>{firms.map(f => <div className="cloud-firm" key={f.id}><div><strong>{f.name}</strong><small>{members.find(m => m.firm_id === f.id)?.role} · Separate records and files</small></div><button className="btn" disabled={busy} onClick={() => void act(() => openFirm(f.id))}>Open firm</button></div>)}{!firms.length && <p>No firm memberships yet. Create a firm or accept an invitation.</p>}<form onSubmit={e => { e.preventDefault(); const d = new FormData(e.currentTarget), name = String(d.get('name')); void act(async () => { await rpc(client, 'kalling_create_firm', { p_name: name, p_data: emptyCloudWorkspace(name, user.email || user.id) }); await refresh(); setNotice('Firm created with empty records. Open it to configure your acquisition process.'); }); }}><label className="field"><span>New firm name</span><input required name="name" minLength={2} maxLength={120}/></label><button className="btn primary" disabled={busy}>Create separate firm</button></form><p className="footnote">Three created firms per account during the pilot. No sample companies or local data are copied into a new firm.</p></section><section className="panel cloud-card"><div className="eyebrow">EMAIL-BOUND INVITATIONS</div><h2>Join an existing team.</h2><p>Sign in with the verified email your administrator invited. Invitation codes expire after seven days and can be accepted once.</p><form onSubmit={e => { e.preventDefault(); const d = new FormData(e.currentTarget); void act(async () => { await rpc(client, 'kalling_accept_invite', { p_token: String(d.get('token')).trim() }); await refresh(); setNotice('Invitation accepted. Your firm is now available.'); }); }}><label className="field"><span>Invitation code</span><input name="token" required autoComplete="off" minLength={64} maxLength={64}/></label><button className="btn" disabled={busy}>Accept invitation</button></form></section></div>
 {record && members.some(m => m.firm_id === record.firmId && m.active) && <CloudConsole key={record.firmId} client={client} user={user} record={record} refresh={() => act(() => refresh())} openWorkspace={() => void act(() => openFirm(record.firmId))}/>}
 </>}
 {client && <details className="cloud-card"><summary>Project connection</summary><p>{connection.url} · Public project settings only</p><button className="btn" onClick={() => void act(async () => { const { error } = await client.auth.signOut(); if (error)
        throw Error(error.message); localStorage.removeItem(CONFIG_KEY); localStorage.setItem(DISCONNECTED_KEY,'true'); setClient(null); setUser(null); setRecord(null); setFirms([]); setMembers([]); })}>Disconnect this device</button></details>}
 <p className="cloud-footer">Free-tier pilot · no AI, Maps, or paid email calls · cloud records are not cached as browser workspace data · authenticated file access is checked against current firm membership.</p></main></div>;
}
