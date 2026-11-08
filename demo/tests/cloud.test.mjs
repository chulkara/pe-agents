import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deviceConnection, validateCloudConfig, emptyCloudWorkspace, fileType, writeCloudWorkspace, uploadCloudDocument } from '../lib/cloud.ts';
const jwt = role => `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ role })).toString('base64url')}.test-signature`;
test('cloud configuration accepts public project settings and rejects privileged keys and unrelated hosts', () => { assert.equal(validateCloudConfig({ url: 'https://project-ref.supabase.co/', publishableKey: jwt('anon') }).url, 'https://project-ref.supabase.co'); for (const key of [jwt('service_role'), 'sb_secret_never-send-this', 'invalid'])
    assert.throws(() => validateCloudConfig({ url: 'https://project-ref.supabase.co', publishableKey: key }), /public publishable/); for (const url of ['http://project.supabase.co', 'https://evil.example', 'https://project.supabase.co.evil.example', 'https://project.supabase.co/path'])
    assert.throws(() => validateCloudConfig({ url, publishableKey: jwt('anon') }), /project HTTPS URL/); });
test('new cloud firms start empty without fictional progress, inherited work or old owner information', () => { const w = emptyCloudWorkspace('Real Firm', 'owner@example.test'); assert.equal(w.firm.name, 'Real Firm'); assert.equal(w.firm.operator, 'owner@example.test'); assert.deepEqual(w.companies, []); assert.deepEqual(w.deals, []); assert.deepEqual(w.events, []); for (const key of ['work', 'memories', 'models', 'briefs', 'execution', 'holdings', 'investors'])
    assert.deepEqual(w.operating[key], []); });
test('cloud saves transmit the expected revision and propagate conflicts without a local fallback', async () => { const record = { firmId: 'firm-a', version: 7, role: 'analyst' }; let captured; const client = { rpc: async (name, args) => { captured = { name, args }; return { data: null, error: { message: 'Workspace changed elsewhere' } }; } }; await assert.rejects(writeCloudWorkspace(client, record, { firm: {} }, 'Source revised'), /changed elsewhere/); assert.equal(captured.args.p_expected_version, 7); assert.equal(captured.args.p_firm, 'firm-a'); assert.equal(record.version, 7); });
test('original uploads are size bounded, immutable, and finalized only after storage succeeds', async () => { assert.throws(() => fileType({ name: 'f.html', size: 2 }), /Choose PDF/); for (const size of [0, 5242881])
    assert.throws(() => fileType({ name: 'f.pdf', size }), /5 MB/); let finalized = 0, options; const client = { rpc: async (name) => { if (name === 'kalling_finish_document') {
        finalized++;
        return { data: null, error: null };
    } return { data: [{ id: 'doc', object_path: 'firm/doc/random' }], error: null }; }, storage: { from: () => ({ upload: async (path, file, opts) => { options = opts; return { error: { message: 'Network error' } }; } }) } }; await assert.rejects(uploadCloudDocument(client, 'firm', 'company', new File(['abc'], 'f.txt')), /Upload incomplete/); assert.equal(finalized, 0); assert.equal(options.upsert, false); });

test('deployed project connects without manual key entry while respecting device disconnects and overrides',()=>{
    const config=deviceConnection(null,false);assert.equal(config.url,'https://ymbciapnzdmymtthevjp.supabase.co');assert.match(config.publishableKey,/^sb_publishable_/);
    assert.equal(deviceConnection(null,true),null);
    const custom={url:'https://another-project.supabase.co',publishableKey:jwt('anon')};assert.deepEqual(deviceConnection(JSON.stringify(custom),false),custom);
    assert.throws(()=>deviceConnection(JSON.stringify({...custom,publishableKey:jwt('service_role')}),false),/public publishable/);
});
