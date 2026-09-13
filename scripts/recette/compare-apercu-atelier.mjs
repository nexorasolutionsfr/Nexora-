// L'aperçu SQL et le message n8n disent-ils la même chose, au caractère près ?
//
// Deux compositions séparées existent : le nœud « Construire le message » du
// workflow (JavaScript, dans n8n) et `apercu_message_atelier` (SQL, dans la
// base). On ne peut pas les fusionner sans toucher à n8n — interdit dans ce
// lot. On peut, en revanche, PROUVER qu'elles coïncident sur des cas réels,
// et savoir quand elles cesseront de le faire.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(RACINE + "/package.json");
const { createClient } = require("@supabase/supabase-js");
const env = Object.fromEntries(readFileSync(RACINE + "/.env.local","utf8").split("\n").filter(l=>l.includes("=")&&!l.trim().startsWith("#")).map(l=>[l.slice(0,l.indexOf("=")).trim(),l.slice(l.indexOf("=")+1).trim()]));
if (!env.NEXT_PUBLIC_SUPABASE_URL.includes("slawilafseganlbghgwx")) process.exit(2);
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} });
const GARAGE = "76147ea8-4071-4bf5-a135-969324c24c13";

// Reproduction FIDÈLE du nœud « Construire le message » de
// jXsssqkdKFR3Hnf9 (« Véhicule prêt (socle) »), export du 11 septembre 2026.
function messageN8n({ client, vehicule, garage, lien_paiement_final }) {
  const nomAffiche = (garage && garage.nom_garage ? garage.nom_garage : 'Votre garage').replace(/["\\]/g, ' ').trim();
  const nomVehicule = `${vehicule.marque || ''} ${vehicule.modele || ''}`.trim();
  const immat = (vehicule && vehicule.immatriculation) ? ' (' + vehicule.immatriculation + ')' : '';
  let texte = `Bonjour ${client.nom || ''},\n\nVotre véhicule ${nomVehicule}${immat} est prêt, vous pouvez venir le récupérer chez ${garage.nom_garage || 'notre garage'}.`;
  if (lien_paiement_final) {
    texte += `\n\nVous pouvez régler en ligne dès maintenant : ${lien_paiement_final}`;
  }
  texte += `\n\nÀ bientôt,\n${nomAffiche}`;
  return texte;
}

async function session(email) {
  const { data: lien } = await db.auth.admin.generateLink({ type:"magiclink", email });
  const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth:{persistSession:false} });
  await anon.auth.verifyOtp({ email, token: lien.properties.email_otp, type:"email" });
  return anon;
}
const dirigeant = await session("recette.proto.atelier.2026091308h38@nexora-recette.invalid");

const { data: rdvs } = await db.from("rendez_vous").select("id, lien_paiement, client_id, vehicule_id, garage_id, vehicules(marque, modele, immatriculation), clients(nom)").eq("garage_id", GARAGE);
const { data: garage } = await db.from("garages").select("nom_garage").eq("id", GARAGE).single();

let identiques = 0, differents = 0;
const casLimites = [];
for (const r of rdvs) {
  if (!r.vehicule_id) continue;
  const { data: apercu } = await dirigeant.rpc("apercu_message_atelier", { p_rendez_vous_id: r.id });
  if (!apercu?.ok) { console.log("aperçu indisponible :", r.id, apercu?.raison); continue; }
  const attendu = messageN8n({
    client: r.clients || {}, vehicule: r.vehicules || {}, garage,
    lien_paiement_final: (r.lien_paiement || "").trim() || null,
  });
  const plaque = r.vehicules?.immatriculation || "sans plaque";
  if (apercu.texte === attendu) identiques++;
  else {
    differents++;
    casLimites.push(`${plaque}\n  SQL : ${JSON.stringify(apercu.texte)}\n  n8n : ${JSON.stringify(attendu)}`);
  }
}
console.log(`\nComparés : ${identiques + differents} messages`);
console.log(`Identiques au caractère près : ${identiques}`);
console.log(`Différents : ${differents}`);
for (const c of casLimites) console.log("\n" + c);
