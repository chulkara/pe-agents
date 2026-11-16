-- Label the rehearsal's newly published listing as a sample. Run when the runner pauses
-- after publishing. The listing was created through the real advisor flow, which never
-- creates samples, so this administrative step keeps every rehearsal row clearly fictional.
begin;
do $mark$
declare l public.kalling_listings;
begin
 select * into l from public.kalling_listings where not sample order by created_at desc limit 1;
 if l.id is null then raise exception 'No unlabeled listing found. Publish the rehearsal listing first.'; end if;
 if (select count(*) from public.kalling_listings where not sample)>1 then raise exception 'More than one unlabeled listing exists. Review them by hand; this script refuses to guess.'; end if;
 if not exists(select 1 from public.kalling_listing_private p join public.kalling_portals pt on pt.company_id=p.company_id
   where p.listing_id=l.id and pt.owner_email='seller-20261114@kalling-validation.invalid') then raise exception 'The unlabeled listing is not tied to the fictional rehearsal seller. Review it by hand.'; end if;
 update public.kalling_listings set sample=true where id=l.id;
 raise notice 'Listing % (%) is now labeled a sample.',l.number,l.headline;
end $mark$;
commit;
select number,status,sample,headline from public.kalling_listings order by created_at desc limit 3;
