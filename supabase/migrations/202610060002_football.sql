-- Étendre les modes autorisés sans modifier les tables, droits ou protections existants.
begin;
alter table public.game_events drop constraint game_events_mode_check;
alter table public.game_events add constraint game_events_mode_check
  check (mode in ('undercover','heads','geography','culture','debut','hardcore','alcool','custom','rapidite','football'));

create or replace function public.record_game_event(
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
  if p_event_id is null or p_mode is null or p_mode not in ('undercover','heads','geography','culture','debut','hardcore','alcool','custom','rapidite','football')
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

commit;
