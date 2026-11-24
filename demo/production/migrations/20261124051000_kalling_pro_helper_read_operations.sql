-- Hosted Storage looks up an object's details (object.get_authenticated_info) before an
-- authenticated download (object.get_authenticated). The CPA/attorney read rule and the owner's
-- preview of a staff helper's file allowed only the second, so Storage answered "Object not found".
-- Allow both read operations, as the data room, closing-document and buyer-proof rules already do
-- (20261114222455_kalling_authenticated_file_metadata). Listing, signing and uploads stay refused.
-- Also removes the temporary read logger used to diagnose this on November 24, 2026, if present.
begin;
alter policy kalling_pro_read on storage.objects using(
 bucket_id in ('kalling-portal','kalling-execution')
 and storage.allow_any_operation(array['object.get_authenticated','object.get_authenticated_info'])
 and kalling_private.pro_ticket_ok(bucket_id,name));
alter policy kalling_helper_read on storage.objects using(
 bucket_id='kalling-portal'
 and storage.allow_any_operation(array['object.get_authenticated','object.get_authenticated_info'])
 and kalling_private.helper_read_ok(name));
drop function if exists kalling_private.pro_ticket_debug(text,text);
drop table if exists kalling_private.pro_read_debug;
commit;
