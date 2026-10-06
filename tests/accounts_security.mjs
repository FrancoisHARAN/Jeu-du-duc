/* PostgreSQL embarqué, avec les rôles et schémas Auth/Storage de contrôle. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const modulePath = process.env.JDD_PGLITE_MODULE;
if (!modulePath) throw new Error('Définir JDD_PGLITE_MODULE vers le module PGlite (voir SUPABASE.md).');
const { PGlite } = await import(pathToFileURL(modulePath).href);
const db = new PGlite();
const a = '10000000-0000-4000-8000-000000000001', b = '10000000-0000-4000-8000-000000000002';
const c = '10000000-0000-4000-8000-000000000003', event = '20000000-0000-4000-8000-000000000001';
await db.exec(`
  create role anon; create role authenticated;
  create schema auth; create schema storage;
  create table auth.users(id uuid primary key, raw_user_meta_data jsonb, email text);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth, storage, public to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects(id uuid primary key default gen_random_uuid(), bucket_id text, name text);
  alter table storage.objects enable row level security;
  grant select,insert,update,delete on storage.objects to authenticated;
  create function storage.foldername(text) returns text[] language sql immutable as
    $$ select (string_to_array($1, '/'))[1:array_length(string_to_array($1, '/'),1)-1] $$;
`);
await db.exec(await readFile(new URL('../supabase/migrations/202610060001_accounts_and_statistics.sql', import.meta.url), 'utf8'));
await db.query('insert into auth.users values ($1,$2,$3),($4,$5,$6),($7,$8,$9)',
  [a,{display_name:'François'},'private-francois@example.test',b,{display_name:'Axel'},'private-axel@example.test',c,{display_name:'Nico'},'private-nico@example.test']);
async function as(role, id, fn) {
  await db.exec(`set role ${role}`); await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id || '']);
  try { return await fn(); } finally { await db.exec('reset role'); }
}
async function rejects(fn, code) { await assert.rejects(fn, error => !code || error.code === code); }
const participants = [{account_id:a,metrics:{games:1,white_wins:1,points:6}}, {account_id:b,metrics:{games:1,points:0}}];
async function record(host, id = event, revision = 1, people = participants, mode = 'undercover') {
  return (await db.query('select public.record_game_event($1,$2,$3,$4,now(),$5,$6) as written',
    [host,id,mode,revision,people,{result:'white'}])).rows[0].written;
}
await as('anon', null, async () => {
  for (const table of ['profiles','game_events','game_results','player_statistics']) await rejects(() => db.query(`select * from public.${table}`),'42501');
  await rejects(() => record(a),'42501');
});
console.log('PASS: aucun profil, résultat ou agrégat accessible anonymement');
await as('authenticated', a, async () => {
  const rows = (await db.query('select * from public.profiles')).rows;
  assert.equal(rows.length,3); assert.ok(rows.every(row => !('email' in row)));
  await db.query('update public.profiles set display_name=$1 where id=$2',['Francis',a]);
  assert.equal((await db.query('update public.profiles set display_name=$1 where id=$2 returning id',['Hacked',b])).rows.length,0);
  await rejects(() => db.query('update public.profiles set id=$1 where id=$2',[c,a]),'42501');
  await rejects(() => db.query('update public.profiles set avatar_path=$1 where id=$2',[`${b}/00000000-0000-4000-8000-000000000001.webp`,a]),'23514');
  await rejects(() => db.query('insert into public.game_results values ($1,$2,$3,$4)',[event,a,'undercover',{}]),'42501');
  assert.equal(await record(a),true);
  assert.equal(await record(a),false);
  assert.equal(Number((await db.query("select total from public.player_statistics where player_id=$1 and metric='games'",[a])).rows[0].total),1);
  assert.equal(await record(a,event,2,[{account_id:a,metrics:{games:1,points:0}},{account_id:b,metrics:{games:1,points:10}}]),true);
  assert.equal(await record(a,event,1),false);
  assert.equal(Number((await db.query("select total from public.player_statistics where player_id=$1 and metric='points'",[b])).rows[0].total),10);
  await rejects(() => record(b),'42501');
  await rejects(() => record(a,event,3,participants,'heads'),'22023');
  for (const metrics of [{points:-1},{admin:1},{games:0.5},{games:1000001}]) {
    await rejects(() => record(a,event,3,[{account_id:a,metrics}]),'22023');
  }
  await rejects(() => record(a,event,3,[{account_id:c,metrics:{}},{account_id:c,metrics:{}}]),'22023');
});
console.log('PASS: emails privés, profil propre uniquement, attribution aux amis, corrections et réessais sans doublon');
await as('authenticated', b, async () => {
  assert.equal((await db.query('select * from public.game_events')).rows.length,1);
  await rejects(() => record(b,event,3),'42501');
});
await as('authenticated', c, async () => {
  assert.equal((await db.query('select * from public.game_events')).rows.length,0);
  assert.ok((await db.query('select * from public.player_statistics')).rows.length > 0);
});
console.log('PASS: aucun organisateur ne peut écraser une autre partie ; détails réservés aux participants');
await as('authenticated', a, async () => {
  await db.query('insert into storage.objects(bucket_id,name) values ($1,$2)',['avatars',`${a}/photo.webp`]);
  await rejects(() => db.query('insert into storage.objects(bucket_id,name) values ($1,$2)',['avatars',`${b}/photo.webp`]),'42501');
});
await as('authenticated', b, async () => {
  assert.equal((await db.query('delete from storage.objects where name=$1 returning id',[`${a}/photo.webp`])).rows.length,0);
  assert.equal((await db.query('update storage.objects set name=$1 where name=$2 returning id',[`${b}/stolen.webp`,`${a}/photo.webp`])).rows.length,0);
});
console.log('PASS: photos privées ; écriture, remplacement et suppression limités au propriétaire');
await db.close();
