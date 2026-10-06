-- Exécuter une fois dans le SQL Editor du projet Supabase.
begin;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(trim(display_name)) between 1 and 40),
  avatar_path text,
  created_at timestamptz not null default now(),
  constraint own_avatar check (avatar_path is null or avatar_path ~ ('^' || id::text || '/[0-9a-f-]+\.webp$'))
);
alter table public.profiles enable row level security;
create policy profiles_read on public.profiles for select to authenticated using (true);
create policy profiles_update on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (display_name, avatar_path) on public.profiles to authenticated;

create function public.create_player_profile() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id, display_name)
  values (new.id, left(coalesce(nullif(trim(new.raw_user_meta_data->>'display_name'), ''), 'Joueur'), 40));
  return new;
end;
$$;
revoke all on function public.create_player_profile() from public, anon, authenticated;
create trigger create_player_profile after insert on auth.users
for each row execute function public.create_player_profile();
-- Reprendre les éventuels comptes déjà créés, sans publier leurs emails.
insert into public.profiles(id, display_name)
select id, left(coalesce(nullif(trim(raw_user_meta_data->>'display_name'), ''), 'Joueur'), 40)
from auth.users on conflict (id) do nothing;

create table public.game_events (
  id uuid primary key,
  host_id uuid not null references auth.users(id) on delete cascade,
  mode text not null check (mode in ('undercover','heads','geography','culture','debut','hardcore','alcool','custom','rapidite')),
  revision integer not null check (revision between 1 and 100000),
  occurred_at timestamptz not null,
  payload jsonb not null default '{}'::jsonb check (octet_length(payload::text) <= 65536),
  updated_at timestamptz not null default now()
);
create table public.game_results (
  event_id uuid not null references public.game_events(id) on delete cascade,
  player_id uuid not null references public.profiles(id) on delete cascade,
  mode text not null,
  metrics jsonb not null,
  primary key (event_id, player_id)
);
create index game_events_host on public.game_events(host_id);
create index game_results_player on public.game_results(player_id, mode);
alter table public.game_events enable row level security;
alter table public.game_results enable row level security;
create policy events_read on public.game_events for select to authenticated
using (host_id = (select auth.uid()) or exists (select 1 from public.game_results r where r.event_id = id and r.player_id = (select auth.uid())));
-- Les résultats sont partagés entre les comptes, conformément au jeu entre amis.
create policy results_read on public.game_results for select to authenticated using (true);
revoke all on public.game_events, public.game_results from anon, authenticated;
grant select on public.game_events, public.game_results to authenticated;

-- Un organisateur connecté peut attribuer les résultats aux autres comptes.
-- Il ne peut écrire ni leur profil ni des résultats appartenant à un autre organisateur.
create function public.record_game_event(
  p_host_id uuid, p_event_id uuid, p_mode text, p_revision integer, p_occurred_at timestamptz,
  p_participants jsonb, p_payload jsonb default '{}'::jsonb
) returns boolean language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  saved_host uuid;
  saved_revision integer;
  saved_mode text;
  participant jsonb;
  metric record;
  account uuid;
  ids uuid[] := array[]::uuid[];
  allowed_metrics text[] := array['games','wins','points','white_games','white_wins','undercover_games','undercover_wins','civil_games','civil_wins',
    'questions_answered','correct_answers','answers_revealed','cards_seen','words_found','words_passed','turns','correct_places','distance_km','perfect_places'];
begin
  if actor is null then raise exception 'Connexion requise' using errcode = '42501'; end if;
  if p_host_id is null or p_host_id <> actor then raise exception 'Organisateur invalide' using errcode = '42501'; end if;
  if p_event_id is null or p_mode is null or p_mode not in ('undercover','heads','geography','culture','debut','hardcore','alcool','custom','rapidite')
    or p_revision is null or p_revision not between 1 and 100000
    or p_occurred_at is null or p_occurred_at > now() + interval '10 minutes'
    or p_participants is null or jsonb_typeof(p_participants) <> 'array'
    or jsonb_array_length(p_participants) not between 1 and 30
    or p_payload is null or jsonb_typeof(p_payload) <> 'object' or octet_length(p_payload::text) > 65536 then
    raise exception 'Résultat invalide' using errcode = '22023';
  end if;
  -- Sérialiser aussi les premières écritures concurrentes du même événement.
  perform pg_advisory_xact_lock(hashtextextended(p_event_id::text, 0));
  select host_id, revision, mode into saved_host, saved_revision, saved_mode from public.game_events where id = p_event_id for update;
  if saved_host is not null and saved_host <> actor then raise exception 'Résultat privé' using errcode = '42501'; end if;
  if saved_mode is not null and saved_mode <> p_mode then raise exception 'Jeu invalide' using errcode = '22023'; end if;
  if saved_revision is not null and p_revision <= saved_revision then return false; end if;
  for participant in select value from jsonb_array_elements(p_participants) loop
    if jsonb_typeof(participant) <> 'object' or jsonb_typeof(participant->'metrics') <> 'object' then
      raise exception 'Participant invalide' using errcode = '22023';
    end if;
    account := (participant->>'account_id')::uuid;
    if account is null or account = any(ids) or not exists(select 1 from public.profiles where id = account) then
      raise exception 'Compte invalide' using errcode = '22023';
    end if;
    ids := array_append(ids, account);
    for metric in select key, value from jsonb_each(participant->'metrics') loop
      if not (metric.key = any(allowed_metrics)) or jsonb_typeof(metric.value) <> 'number'
        or metric.value::text !~ '^[0-9]+$' or (metric.value::text)::numeric > 1000000 then
        raise exception 'Statistique invalide' using errcode = '22023';
      end if;
    end loop;
  end loop;
  insert into public.game_events(id, host_id, mode, revision, occurred_at, payload)
  values(p_event_id, actor, p_mode, p_revision, p_occurred_at, p_payload)
  on conflict (id) do update set revision = excluded.revision, payload = excluded.payload, updated_at = now();
  delete from public.game_results where event_id = p_event_id;
  insert into public.game_results(event_id, player_id, mode, metrics)
  select p_event_id, (value->>'account_id')::uuid, p_mode, value->'metrics' from jsonb_array_elements(p_participants);
  return true;
end;
$$;
revoke all on function public.record_game_event(uuid,uuid,text,integer,timestamptz,jsonb,jsonb) from public, anon;
grant execute on function public.record_game_event(uuid,uuid,text,integer,timestamptz,jsonb,jsonb) to authenticated;

create view public.player_statistics with (security_invoker = true) as
select r.player_id, r.mode, m.key as metric, sum((m.value::text)::bigint) as total
from public.game_results r cross join lateral jsonb_each(r.metrics) m
group by r.player_id, r.mode, m.key;
revoke all on public.player_statistics from anon;
grant select on public.player_statistics to authenticated;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('avatars','avatars',false,2097152,array['image/webp'])
on conflict (id) do update set public = false, file_size_limit = 2097152, allowed_mime_types = array['image/webp'];
create policy avatars_read on storage.objects for select to authenticated using (bucket_id = 'avatars');
create policy avatars_insert on storage.objects for insert to authenticated
with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy avatars_update on storage.objects for update to authenticated
using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy avatars_delete on storage.objects for delete to authenticated
using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

commit;
