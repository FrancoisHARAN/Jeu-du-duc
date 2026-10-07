// Client des outils cloud : aucune configuration n'est intégrée au site statique.
import { createClient } from '@supabase/supabase-js';

const urlValue = process.env.SUPABASE_URL?.trim();
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY?.trim();
if (!urlValue || !publishableKey) {
  throw new Error(
    'SUPABASE_URL et SUPABASE_PUBLISHABLE_KEY doivent être définies dans l’environnement du projet.'
  );
}

let projectUrl;
try {
  projectUrl = new URL(urlValue);
} catch {
  throw new Error('SUPABASE_URL doit être une URL HTTPS valide.');
}
if (
  projectUrl.protocol !== 'https:' ||
  projectUrl.username ||
  projectUrl.password ||
  projectUrl.pathname !== '/' ||
  projectUrl.search ||
  projectUrl.hash
) {
  throw new Error(
    'SUPABASE_URL doit être l’URL HTTPS du projet, sans identifiants ni chemin supplémentaire.'
  );
}
if (!publishableKey.startsWith('sb_publishable_')) {
  throw new Error(
    'SUPABASE_PUBLISHABLE_KEY doit contenir une clé publishable ; aucune clé privilégiée n’est acceptée.'
  );
}

export const supabase = createClient(projectUrl.origin, publishableKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});

// Contrôle authentifié en lecture seule, sans choisir de table ni modifier la base.
export async function checkSupabaseConnection() {
  const response = await fetch(new URL('auth/v1/settings', projectUrl), {
    headers: { apikey: publishableKey },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`La vérification Supabase a reçu HTTP ${response.status}.`);
  const settings = await response.json();
  if (!settings || typeof settings.external !== 'object' || settings.external === null) {
    throw new Error('La réponse ne correspond pas aux paramètres Supabase attendus.');
  }
  return { status: response.status };
}
