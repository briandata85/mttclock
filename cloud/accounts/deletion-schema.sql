-- Durable tombstones intentionally survive auth.users removal, so stale requests cannot recreate data.
create table public.clock_account_deletions (
 owner_id uuid primary key,
 status text not null default 'deleting' check(status in ('deleting','deleted')),
 requested_at timestamptz not null default now(),
 completed_at timestamptz
);
alter table public.clock_account_deletions enable row level security;
revoke all on public.clock_account_deletions from public,anon,authenticated;
grant select on public.clock_account_deletions to authenticated;
create policy clock_deletion_own_status on public.clock_account_deletions for select to authenticated using ((select auth.uid())=owner_id);
grant select,insert,update on public.clock_account_deletions to service_role;
create function public.clock_begin_account_deletion(p_owner uuid)
returns void language plpgsql security invoker set search_path='' as $$
begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_owner::text,781021));
 insert into public.clock_account_deletions(owner_id) values(p_owner) on conflict(owner_id) do nothing;
end $$;
revoke all on function public.clock_begin_account_deletion(uuid) from public,anon,authenticated;
grant execute on function public.clock_begin_account_deletion(uuid) to service_role;
create function public.clock_guard_account_writes()
returns trigger language plpgsql security invoker set search_path='' as $$
declare owner uuid;
begin
 if TG_TABLE_SCHEMA='storage' then
  if NEW.bucket_id <> 'clock-artwork' then return NEW; end if;
  owner := pg_catalog.split_part(NEW.name,'/',1)::uuid;
 else owner := NEW.owner_id; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(owner::text,781021));
 if exists(select 1 from public.clock_account_deletions d where d.owner_id=owner) then
  raise exception 'Account deletion is in progress.' using errcode='42501';
 end if;
 return NEW;
end $$;
revoke all on function public.clock_guard_account_writes() from public,anon,authenticated;
grant execute on function public.clock_guard_account_writes() to service_role;
create trigger clock_tournament_deletion_guard before insert or update on public.clock_tournaments for each row execute function public.clock_guard_account_writes();
create trigger clock_artwork_deletion_guard before insert or update on public.clock_artwork_assets for each row execute function public.clock_guard_account_writes();
create trigger clock_recovery_deletion_guard before insert or update on public.clock_account_recovery for each row execute function public.clock_guard_account_writes();
create trigger clock_storage_deletion_guard before insert or update on storage.objects for each row execute function public.clock_guard_account_writes();
-- Storage's own server role also sees lifecycle markers while finalizing uploads.
grant select on public.clock_account_deletions to supabase_storage_admin;
create policy clock_deletion_storage_guard on public.clock_account_deletions for select to supabase_storage_admin using (true);
grant execute on function public.clock_guard_account_writes() to supabase_storage_admin;
