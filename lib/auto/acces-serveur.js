// Accès à Nexora Auto, lu par le SERVEUR (mise en page /auto, routes /api/auto).
// Règles : lib/auto/acces.js. Toute erreur de lecture vaut « fermé ».

import { supabaseAdmin } from "@/lib/supabase-admin";
import { decisionAcces, fermetureImposee } from "@/lib/auto/acces";

export async function accesAutoServeur(env = process.env) {
  const imposee = fermetureImposee(env);
  if (imposee) return imposee;
  try {
    const { data, error } = await supabaseAdmin.from("auto_acces_parametres").select("mode").eq("unique_ligne", true).maybeSingle();
    return decisionAcces({ env, modeBase: data?.mode ?? null, erreurBase: Boolean(error) });
  } catch {
    return decisionAcces({ env, erreurBase: true });
  }
}

// La personne derrière ce jeton peut-elle utiliser Nexora Auto ? Lu avec SES
// droits (fonction auto_etat_acces), jamais déduit du jeton seul.
export async function personneAutorisee(clientPersonne) {
  try {
    const { data, error } = await clientPersonne.rpc("auto_etat_acces");
    return !error && data?.autorise === true;
  } catch {
    return false;
  }
}
