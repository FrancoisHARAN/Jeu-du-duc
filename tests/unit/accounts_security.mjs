/* PostgreSQL embarqué, avec les rôles et schémas Auth/Storage de contrôle. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const modulePath = process.env.JDD_PGLITE_MODULE;
if (!modulePath)
  throw new Error(
    'Définir JDD_PGLITE_MODULE vers le module PGlite (voir docs/backend/supabase.md).'
  );
const { PGlite } = await import(pathToFileURL(modulePath).href);
const db = new PGlite();
const a = '10000000-0000-4000-8000-000000000001',
  b = '10000000-0000-4000-8000-000000000002';
const c = '10000000-0000-4000-8000-000000000003',
  event = '20000000-0000-4000-8000-000000000001';
const pending = '10000000-0000-4000-8000-000000000004',
  secondPending = '10000000-0000-4000-8000-000000000005';
await db.exec(`
  create role anon; create role authenticated;
  create schema auth; create schema storage;
  create table auth.users(id uuid primary key, raw_user_meta_data jsonb, email text, email_confirmed_at timestamptz default now());
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
await db.exec(
  await readFile(
    new URL('../../supabase/migrations/202610060001_accounts_and_statistics.sql', import.meta.url),
    'utf8'
  )
);
await db.exec(
  await readFile(
    new URL('../../supabase/migrations/202610060002_football.sql', import.meta.url),
    'utf8'
  )
);
await db.query(
  'insert into auth.users(id,raw_user_meta_data,email) values ($1,$2,$3),($4,$5,$6),($7,$8,$9)',
  [
    a,
    { display_name: 'François' },
    'private-francois@example.test',
    b,
    { display_name: 'Axel' },
    'private-axel@example.test',
    c,
    { display_name: 'Nico' },
    'private-nico@example.test',
  ]
);
await db.query('insert into auth.users values ($1,$2,$3,null)', [
  pending,
  { display_name: 'François' },
  'pending@example.test',
]);
const confirmationMigration = await readFile(
  new URL('../../supabase/migrations/202610060003_confirmed_profiles.sql', import.meta.url),
  'utf8'
);
await db.exec(confirmationMigration);
const initialProfiles = (await db.query('select id,display_name from public.profiles order by id'))
  .rows;
// Installation partielle : la colonne existe, mais pas encore le trigger ni le filtre.
await db.exec(`drop trigger sync_player_confirmation on auth.users;
  drop function public.sync_player_confirmation();
  alter policy profiles_read on public.profiles using (true);
  update public.profiles set is_confirmed=false;`);
await db.exec(confirmationMigration);
await db.exec(confirmationMigration);
assert.deepEqual(
  (await db.query('select id,display_name from public.profiles order by id')).rows,
  initialProfiles
);
console.log(
  'PASS: installation neuve, reprise avec colonne existante et relance complète sans doublon ni perte de profils'
);
await db.query('insert into auth.users values ($1,$2,$3,null)', [
  secondPending,
  { display_name: 'François' },
  'second-pending@example.test',
]);
async function as(role, id, fn) {
  await db.exec(`set role ${role}`);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id || '']);
  try {
    return await fn();
  } finally {
    await db.exec('reset role');
  }
}
async function rejects(fn, code) {
  await assert.rejects(fn, (error) => !code || error.code === code);
}
const participants = [
  { account_id: a, metrics: { games: 1, white_wins: 1, points: 6 } },
  { account_id: b, metrics: { games: 1, points: 0 } },
];
await as('authenticated', a, async () => {
  assert.deepEqual(
    (await db.query('select id from public.profiles order by id')).rows.map((r) => r.id),
    [a, b, c]
  );
  await rejects(
    () => db.query('update public.profiles set is_confirmed=true where id=$1', [a]),
    '42501'
  );
  await rejects(() => db.query('select email_confirmed_at from auth.users'), '42501');
});
await db.query('update auth.users set email_confirmed_at=now() where id=$1', [secondPending]);
await as('authenticated', a, async () => {
  const ids = (await db.query('select id from public.profiles order by id')).rows.map((r) => r.id);
  assert.deepEqual(ids, [a, b, c, secondPending]);
});
assert.equal(
  (await db.query('select is_confirmed from public.profiles where id=$1', [pending])).rows[0]
    .is_confirmed,
  false
);
await db.query('update auth.users set email_confirmed_at=null where id=$1', [secondPending]);
const immediate = '10000000-0000-4000-8000-000000000006';
await db.query('insert into auth.users(id,raw_user_meta_data,email) values ($1,$2,$3)', [
  immediate,
  { display_name: 'Confirmé' },
  'immediate@example.test',
]);
assert.equal(
  (await db.query('select is_confirmed from public.profiles where id=$1', [immediate])).rows[0]
    .is_confirmed,
  true
);
await db.query('delete from auth.users where id=$1', [immediate]);
console.log(
  'PASS: anciens et nouveaux profils non confirmés masqués, confirmation par UUID et impossible à usurper'
);
async function record(
  host,
  id = event,
  revision = 1,
  people = participants,
  mode = 'undercover',
  payload = { result: 'white' }
) {
  return (
    await db.query('select public.record_game_event($1,$2,$3,$4,now(),$5,$6) as written', [
      host,
      id,
      mode,
      revision,
      people,
      payload,
    ])
  ).rows[0].written;
}
await as('anon', null, async () => {
  for (const table of ['profiles', 'game_events', 'game_results', 'player_statistics'])
    await rejects(() => db.query(`select * from public.${table}`), '42501');
  await rejects(() => record(a), '42501');
});
console.log('PASS: aucun profil, résultat ou agrégat accessible anonymement');
await as('authenticated', a, async () => {
  const rows = (await db.query('select * from public.profiles')).rows;
  assert.equal(rows.length, 3);
  assert.ok(rows.every((row) => !('email' in row)));
  await db.query('update public.profiles set display_name=$1 where id=$2', ['Francis', a]);
  assert.equal(
    (
      await db.query('update public.profiles set display_name=$1 where id=$2 returning id', [
        'Hacked',
        b,
      ])
    ).rows.length,
    0
  );
  await rejects(() => db.query('update public.profiles set id=$1 where id=$2', [c, a]), '42501');
  await rejects(
    () =>
      db.query('update public.profiles set avatar_path=$1 where id=$2', [
        `${b}/00000000-0000-4000-8000-000000000001.webp`,
        a,
      ]),
    '23514'
  );
  await rejects(
    () =>
      db.query('insert into public.game_results values ($1,$2,$3,$4)', [
        event,
        a,
        'undercover',
        {},
      ]),
    '42501'
  );
  assert.equal(await record(a), true);
  assert.equal(await record(a), false);
  assert.equal(
    Number(
      (
        await db.query(
          "select total from public.player_statistics where player_id=$1 and metric='games'",
          [a]
        )
      ).rows[0].total
    ),
    1
  );
  assert.equal(
    await record(a, event, 2, [
      { account_id: a, metrics: { games: 1, points: 0 } },
      { account_id: b, metrics: { games: 1, points: 10 } },
    ]),
    true
  );
  assert.equal(await record(a, event, 1), false);
  assert.equal(
    Number(
      (
        await db.query(
          "select total from public.player_statistics where player_id=$1 and metric='points'",
          [b]
        )
      ).rows[0].total
    ),
    10
  );
  await rejects(() => record(b), '42501');
  await rejects(() => record(a, event, 3, participants, 'heads'), '22023');
  for (const metrics of [{ points: -1 }, { admin: 1 }, { games: 0.5 }, { games: 1000001 }]) {
    await rejects(() => record(a, event, 3, [{ account_id: a, metrics }]), '22023');
  }
  await rejects(
    () =>
      record(a, event, 3, [
        { account_id: c, metrics: {} },
        { account_id: c, metrics: {} },
      ]),
    '22023'
  );
});
console.log(
  'PASS: emails privés, profil propre uniquement, attribution aux amis, corrections et réessais sans doublon'
);
await as('authenticated', b, async () => {
  assert.equal((await db.query('select * from public.game_events')).rows.length, 1);
  await rejects(() => record(b, event, 3), '42501');
});
await as('authenticated', c, async () => {
  assert.equal((await db.query('select * from public.game_events')).rows.length, 0);
  assert.ok((await db.query('select * from public.player_statistics')).rows.length > 0);
});
console.log(
  'PASS: aucun organisateur ne peut écraser une autre partie ; détails réservés aux participants'
);
await as('authenticated', a, async () => {
  await db.query('insert into storage.objects(bucket_id,name) values ($1,$2)', [
    'avatars',
    `${a}/photo.webp`,
  ]);
  await rejects(
    () =>
      db.query('insert into storage.objects(bucket_id,name) values ($1,$2)', [
        'avatars',
        `${b}/photo.webp`,
      ]),
    '42501'
  );
});
await as('authenticated', b, async () => {
  assert.equal(
    (await db.query('delete from storage.objects where name=$1 returning id', [`${a}/photo.webp`]))
      .rows.length,
    0
  );
  assert.equal(
    (
      await db.query('update storage.objects set name=$1 where name=$2 returning id', [
        `${b}/stolen.webp`,
        `${a}/photo.webp`,
      ])
    ).rows.length,
    0
  );
});
console.log('PASS: photos privées ; écriture, remplacement et suppression limités au propriétaire');
await as('authenticated', a, async () => {
  const id = '20000000-0000-4000-8000-000000000002';
  const people = [
    { account_id: a, metrics: { games: 1, wins: 1, points: 4, turns: 5, correct_answers: 4 } },
  ];
  assert.equal(await record(a, id, 1, people, 'football'), true);
  assert.equal(await record(a, id, 1, people, 'football'), false);
  assert.equal(
    Number(
      (
        await db.query(
          "select total from public.player_statistics where player_id=$1 and mode='football' and metric='games'",
          [a]
        )
      ).rows[0].total
    ),
    1
  );
  await rejects(() => record(b, id, 2, people, 'football'), '42501');
  await rejects(
    () => record(a, '20000000-0000-4000-8000-000000000003', 1, people, 'invalid-mode'),
    '22023'
  );
});
console.log('PASS: migration foot, statistiques sans doublon et protections existantes conservées');
const initialResults = (
  await db.query('select * from public.game_results order by event_id,player_id')
).rows;
await db.exec(confirmationMigration);
assert.deepEqual(
  (await db.query('select * from public.game_results order by event_id,player_id')).rows,
  initialResults
);
// Compatibilité avant activation, puis reprise par UUID et corrections atomiques.
const geoEvent = '20000000-0000-4000-8000-000000000004';
const oldGeo = '20000000-0000-4000-8000-000000000005';
const geoPeople = [
  { account_id: a, metrics: { games: 1, turns: 8, distance_km: 70 } },
  { account_id: b, metrics: { games: 1, turns: 8, distance_km: 0 } },
];
const geoPayload = {
  map_mode: 'cities',
  zone: 'france',
  city_measurements: {
    [a]: { distance_turns: 5, measured_distance_km: 70 },
    [b]: { distance_turns: 3, measured_distance_km: 0 },
  },
};
await as('authenticated', a, async () => {
  assert.equal(await record(a, geoEvent, 1, geoPeople, 'geography', geoPayload), true);
  assert.equal(
    await record(a, oldGeo, 1, geoPeople, 'geography', {
      map_mode: 'cities',
      zone: 'france',
      rows: [],
    }),
    true
  );
});
const averagesMigration = await readFile(
  new URL('../../supabase/migrations/202610060004_geography_averages.sql', import.meta.url),
  'utf8'
);
await db.exec(averagesMigration);
await db.exec(averagesMigration);
const geoMetrics = async (id, player = a) =>
  (
    await db.query('select metrics from public.game_results where event_id=$1 and player_id=$2', [
      id,
      player,
    ])
  ).rows[0].metrics;
assert.deepEqual(await geoMetrics(geoEvent), {
  games: 1,
  turns: 8,
  distance_km: 70,
  distance_turns: 5,
  measured_distance_km: 70,
  city_france_turns: 5,
  city_france_km: 70,
});
assert.equal((await geoMetrics(geoEvent, b)).distance_turns, 3);
assert.equal((await geoMetrics(geoEvent, b)).measured_distance_km, 0);
assert.deepEqual(await geoMetrics(oldGeo), geoPeople[0].metrics);
for (const row of initialResults)
  assert.deepEqual(
    (
      await db.query('select * from public.game_results where event_id=$1 and player_id=$2', [
        row.event_id,
        row.player_id,
      ])
    ).rows[0],
    row
  );
await as('anon', null, async () => {
  await rejects(() => record(a, geoEvent, 2, geoPeople, 'geography', geoPayload), '42501');
  await rejects(() => db.query('select * from public.player_statistics'), '42501');
});
await as('authenticated', a, async () => {
  await rejects(
    () =>
      db.query('select public.geography_measurement_metrics($1,$2,$3,$4)', [
        'geography',
        a,
        geoPayload,
        geoPeople[0].metrics,
      ]),
    '42501'
  );
  await rejects(
    () =>
      record(
        a,
        geoEvent,
        2,
        [{ account_id: a, metrics: { games: 1, city_france_turns: 5 } }],
        'geography',
        geoPayload
      ),
    '22023'
  );
  for (const measurement of [
    { distance_turns: 9, measured_distance_km: 70 },
    { distance_turns: 0, measured_distance_km: 70 },
    { distance_turns: 5, measured_distance_km: 71 },
    { distance_turns: -1, measured_distance_km: 70 },
    { distance_turns: 0.5, measured_distance_km: 70 },
    { distance_turns: '5', measured_distance_km: 70 },
    { distance_turns: 5, measured_distance_km: null },
  ]) {
    await rejects(
      () =>
        record(a, geoEvent, 2, geoPeople, 'geography', {
          ...geoPayload,
          city_measurements: { [a]: measurement },
        }),
      '22023'
    );
  }
  await rejects(
    () => record(a, geoEvent, 2, geoPeople, 'geography', { ...geoPayload, zone: 'invalid' }),
    '22023'
  );
  assert.equal(
    (await db.query('select revision from public.game_events where id=$1', [geoEvent])).rows[0]
      .revision,
    1
  );
  assert.equal((await geoMetrics(geoEvent)).city_france_turns, 5);
  const corrected = [{ account_id: a, metrics: { games: 1, turns: 8, distance_km: 40 } }];
  const correctedPayload = {
    map_mode: 'cities',
    zone: 'world',
    city_measurements: { [a]: { distance_turns: 4, measured_distance_km: 40 } },
  };
  assert.equal(await record(a, geoEvent, 2, corrected, 'geography', correctedPayload), true);
  assert.equal(await record(a, geoEvent, 2, corrected, 'geography', correctedPayload), false);
  assert.deepEqual(await geoMetrics(geoEvent), {
    games: 1,
    turns: 8,
    distance_km: 40,
    distance_turns: 4,
    measured_distance_km: 40,
    city_world_turns: 4,
    city_world_km: 40,
  });
  assert.equal(
    (await db.query('select player_id from public.game_results where event_id=$1', [geoEvent])).rows
      .length,
    1
  );
  const metric = (
    await db.query(
      "select total from public.player_statistics where player_id=$1 and mode='geography' and metric='distance_turns'",
      [a]
    )
  ).rows;
  assert.equal(Number(metric[0].total), 4);
});
await as('authenticated', b, async () => {
  await rejects(() => record(b, geoEvent, 3, geoPeople, 'geography', geoPayload), '42501');
});
await db.exec(averagesMigration);
assert.equal((await geoMetrics(geoEvent)).city_world_km, 40);
console.log(
  'PASS: moyennes activables après les parties, migration relançable, UUID, zéro mesuré et anciens résultats conservés'
);
console.log(
  'PASS: mesures validées côté serveur, correction atomique par révision, droits et organisateur protégés'
);
await db.query('delete from auth.users where id=$1', [b]);
assert.equal((await db.query('select id from public.profiles where id=$1', [b])).rows.length, 0);
assert.equal(
  (await db.query('select player_id from public.game_results where player_id=$1', [b])).rows.length,
  0
);
assert.equal((await db.query('select id from public.profiles where id=$1', [a])).rows.length, 1);
assert.equal(
  (await db.query('select id from public.game_events where id=$1', [event])).rows.length,
  1
);
console.log(
  'PASS: suppression ciblée du compte de test et de ses résultats, autre compte conservé'
);
await db.close();
