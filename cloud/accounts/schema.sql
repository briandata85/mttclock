-- No client may read recovery verifiers. Only the authenticated Edge service uses these tables.
create table public.clock_account_recovery (
 owner_id uuid primary key references auth.users(id) on delete cascade,
 code_hash text unique check (code_hash ~ '^[a-f0-9]{64}$'),
 updated_at timestamptz not null default now()
);
alter table public.clock_account_recovery enable row level security;
revoke all on public.clock_account_recovery from public, anon, authenticated;
grant select, insert, update, delete on public.clock_account_recovery to service_role;
create table public.clock_auth_limits (
 bucket text primary key,
 starts_at timestamptz not null default now(),
 attempts integer not null default 1
);
alter table public.clock_auth_limits enable row level security;
revoke all on public.clock_auth_limits from public, anon, authenticated;
grant select, insert, update, delete on public.clock_auth_limits to service_role;
create or replace function public.clock_auth_attempt(p_bucket text, p_limit integer)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare n integer;
begin
 if p_limit < 1 or p_limit > 30 or length(p_bucket)>100 then return false; end if;
 delete from public.clock_auth_limits where starts_at < now()-interval '1 day';
 insert into public.clock_auth_limits(bucket) values(p_bucket)
 on conflict(bucket) do update set
 attempts=case when clock_auth_limits.starts_at<now()-interval '15 minutes' then 1 else clock_auth_limits.attempts+1 end,
 starts_at=case when clock_auth_limits.starts_at<now()-interval '15 minutes' then now() else clock_auth_limits.starts_at end
 returning attempts into n;
 return n<=p_limit;
end $$;
revoke all on function public.clock_auth_attempt(text,integer) from public,anon,authenticated;
grant execute on function public.clock_auth_attempt(text,integer) to service_role;
create or replace function public.clock_consume_recovery(p_hash text)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare owner uuid;
begin
 update public.clock_account_recovery set code_hash=null,updated_at=now()
 where code_hash=p_hash returning owner_id into owner;
 return owner;
end $$;
revoke all on function public.clock_consume_recovery(text) from public,anon,authenticated;
grant execute on function public.clock_consume_recovery(text) to service_role;
