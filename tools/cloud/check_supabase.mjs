try {
  const { supabase, checkSupabaseConnection } = await import('./supabase_client.mjs');
  if (!supabase.from || !supabase.auth)
    throw new Error('Le client Supabase n’a pas été initialisé.');
  console.log(
    'Variables d’environnement lues ; client Supabase initialisé avec la clé publishable.'
  );
  if (!process.argv.includes('--local')) {
    const result = await checkSupabaseConnection();
    console.log(`Connexion Supabase vérifiée en lecture seule (HTTP ${result.status}).`);
  }
} catch (error) {
  // Ne jamais afficher les valeurs de configuration ou les en-têtes de requête.
  console.error(error instanceof Error ? error.message : 'Échec du contrôle Supabase.');
  process.exitCode = 1;
}
