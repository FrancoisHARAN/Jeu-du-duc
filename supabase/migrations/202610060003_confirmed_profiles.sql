-- Appliquer après les deux migrations précédentes. Relançable, sans supprimer de comptes.
begin;

alter table public.profiles add column if not exists is_confirmed boolean not null default false;
update public.profiles p set is_confirmed = (u.email_confirmed_at is not null)
from auth.users u where u.id = p.id;

-- Le profil existe dès l'inscription, mais devient visible à la bande seulement
-- quand son email est confirmé. Chaque confirmation concerne son UUID propre.
create or replace function public.sync_player_confirmation() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles set is_confirmed = (new.email_confirmed_at is not null)
  where id = new.id;
  return new;
end;
$$;
revoke all on function public.sync_player_confirmation() from public, anon, authenticated;
-- Les triggers AFTER sont appelés par ordre alphabétique : celui-ci vient après
-- create_player_profile, y compris pour un compte créé déjà confirmé.
create or replace trigger sync_player_confirmation after insert or update of email_confirmed_at on auth.users
for each row execute function public.sync_player_confirmation();

alter policy profiles_read on public.profiles
using (is_confirmed or id = (select auth.uid()));
-- Les droits UPDATE restent limités à display_name et avatar_path.
-- Un joueur ne peut donc pas s'auto-confirmer en modifiant son profil.

commit;
