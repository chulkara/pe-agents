-- Hosted downloads may first request authenticated object metadata. Both read
-- operations must use the same current portal role, engagement gate and stored
-- file predicate. Listing, signing and unauthenticated operations stay refused.
begin;
create or replace function kalling_private.can_download_portal(path text) returns boolean language sql stable security definer set search_path='' as $$
 select storage.allow_any_operation(array['object.get_authenticated','object.get_authenticated_info'])
  and exists(select 1 from public.kalling_portal_files f where f.object_path=path and f.status='stored'
   and kalling_private.portal_file_role(f.portal_id) is not null)
$$;
commit;
