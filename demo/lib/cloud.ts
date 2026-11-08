import type { SupabaseClient } from '@supabase/supabase-js';
import { sample, type Workspace } from './domain.ts';
import { hydrate } from './operating.ts';
export type CloudConfig = {
    url: string;
    publishableKey: string;
};
export type Membership = {
    firm_id: string;
    user_id: string;
    role: 'owner' | 'admin' | 'analyst' | 'viewer';
    active: boolean;
};
export type CloudFirm = {
    id: string;
    name: string;
};
export type CloudDocument = {
    id: string;
    firm_id: string;
    company_id: string;
    name: string;
    mime_type: string;
    size_bytes: number;
    object_path: string;
    status: 'reserved' | 'stored';
    previous_id: string | null;
    created_at: string;
};
export type CloudJob = {
    id: string;
    kind: string;
    status: string;
    attempts: number;
    max_attempts: number;
    checkpoint: unknown;
    result: unknown;
    last_error: string | null;
    created_at: string;
    updated_at: string;
};
export type CloudRecord = {
    data: Workspace;
    version: number;
    firmId: string;
    role: Membership['role'];
};
export const CONFIG_KEY = 'kalling-cloud-public-config-v1';
export function validateCloudConfig(c: CloudConfig): CloudConfig {
    const url = c.url.trim().replace(/\/$/, '');
    if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url))
        throw Error('Use your project HTTPS URL ending in .supabase.co.');
    const key = c.publishableKey.trim();
    if (key.startsWith('sb_publishable_') && key.length > 30)
        return { url, publishableKey: key };
    try {
        const payload = JSON.parse(atob(key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
        if (payload.role === 'anon')
            return { url, publishableKey: key };
    }
    catch { }
    throw Error('Use a public publishable key or legacy anon key. Never enter a secret or service-role key.');
}
export async function clientFor(c: CloudConfig) { const config = validateCloudConfig(c); const { createClient } = await import('@supabase/supabase-js'); return createClient(config.url, config.publishableKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' } }); }
export function emptyCloudWorkspace(name: string, email: string): Workspace {
    const w = sample();
    w.companies = [];
    w.deals = [];
    w.events = [];
    w.firm = { ...w.firm, name, operator: email, reviewer: email, configured: false };
    return hydrate(w);
}
export async function rpc<T>(c: SupabaseClient, name: string, args: Record<string, unknown>): Promise<T> { const { data, error } = await c.rpc(name, args); if (error)
    throw Error(error.message); return data as T; }
export async function readCloudWorkspace(c: SupabaseClient, firmId: string, role: Membership['role']): Promise<CloudRecord> { const { data, error } = await c.from('kalling_workspaces').select('data,version').eq('firm_id', firmId).single(); if (error || !data)
    throw Error(error?.message || 'Firm workspace unavailable.'); return { data: hydrate(data.data), version: Number(data.version), firmId, role }; }
export async function writeCloudWorkspace(c: SupabaseClient, record: CloudRecord, data: Workspace, reason: string) { return Number(await rpc<number>(c, 'kalling_save_workspace', { p_firm: record.firmId, p_expected_version: record.version, p_data: data, p_reason: reason })); }
export function fileType(file: Pick<File, 'name' | 'size'>): string {
    if (file.size < 1 || file.size > 5242880)
        throw Error('Choose a nonempty file up to 5 MB.');
    const ext = file.name.split('.').pop()?.toLowerCase();
    const types: Record<string, string> = { pdf: 'application/pdf', txt: 'text/plain', csv: 'text/csv', json: 'application/json', md: 'text/markdown' };
    if (!ext || !types[ext])
        throw Error('Choose PDF, TXT, CSV, JSON, or MD.');
    return types[ext];
}
export async function uploadCloudDocument(c: SupabaseClient, firmId: string, companyId: string, file: File, previous: string | null = null) {
    const mime = fileType(file);
    const response = await rpc<CloudDocument | CloudDocument[]>(c, 'kalling_reserve_document', { p_firm: firmId, p_company: companyId, p_name: file.name, p_mime: mime, p_size: file.size, p_previous: previous });
    const d = Array.isArray(response) ? response[0] : response;
    if (!d?.id)
        throw Error('Document reservation failed.');
    const { error } = await c.storage.from('kalling-private').upload(d.object_path, file, { contentType: mime, upsert: false });
    if (error)
        throw Error(`Upload incomplete: ${error.message}. Its reserved record is retained for review.`);
    await rpc(c, 'kalling_finish_document', { p_document: d.id });
    return { ...d, status: 'stored' as const };
}
export async function downloadCloudDocument(c: SupabaseClient, d: CloudDocument) { const { data, error } = await c.storage.from('kalling-private').download(d.object_path); if (error || !data)
    throw Error(error?.message || 'File unavailable.'); return data; }
