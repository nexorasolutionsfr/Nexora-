// Jeu de recette pour la VRAIE variante du workflow des relances, contre le
// serveur SMTP contrôlé (scripts/recette/smtp-controle.mjs) — Supabase TEST.
//
// `creer` : un garage NEUF « PROTO Constat SMTP … » (aucune autre file touchée),
// quatre travaux différés échus, préparés puis AUTORISÉS par le dirigeant en
// session réelle. Le début de l'adresse du client pilote le serveur SMTP :
//   accepte. / temporaire. / definitif. / coupure.  (@nexora-recette.invalid)
// `etat <garage>` : état des relances du garage.
//
// Usage : node scripts/recette/jeu-relances-smtp.mjs creer
//         node scripts/recette/jeu-relances-smtp.mjs etat <garage_id>

import { admin, creerUtilisateur, garageDeRecette, session } from "./outils-recette.mjs";

const [commande, garageArg] = process.argv.slice(2);
const CAS = ["accepte", "temporaire", "definitif", "coupure"];
const ok = (libelle, { data, error }) => { if (error) { console.error(`ÉCHEC ${libelle} :`, error.message); process.exit(1); } return data; };

if (commande === "creer") {
  const t = Date.now();
  const email = `recette.smtp.${t}@nexora-recette.invalid`;
  const u = await creerUtilisateur(email);
  const garage = ok("garage", await admin.from("garages").insert({ nom_garage: `PROTO Constat SMTP ${t}`, email, telephone: "0100000000", owner_user_id: u.id, acces_motif: "illimite" }).select().single());
  ok("membre", await admin.from("garage_membres").insert({ garage_id: garage.id, user_id: u.id, role: "dirigeant" }));
  const dirigeant = await session(email);
  const hier = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  for (const cle of CAS) {
    const c = ok("client", await dirigeant.from("clients").insert({ garage_id: garage.id, nom: `Client ${cle}`, email: `${cle}.${t}@nexora-recette.invalid` }).select().single());
    const v = ok("véhicule", await dirigeant.from("vehicules").insert({ garage_id: garage.id, client_id: c.id, marque: "Renault", modele: "Mégane", immatriculation: `SM-${CAS.indexOf(cle)}0${CAS.indexOf(cle)}-TP` }).select().single());
    const tr = ok("travail", await dirigeant.from("travaux_differes").insert({ garage_id: garage.id, client_id: c.id, vehicule_id: v.id, intervention: `Courroie (${cle})`, niveau: "normal", statut: "a_relancer", date_relance: hier, source: "manuel" }).select().single());
    ok("préparation", await admin.rpc("preparer_relances_travaux", { p_garages: [garage.id], p_travaux: [tr.id] }));
    const { data: r } = await admin.from("relances_travaux").select("id").eq("travail_differe_id", tr.id).single();
    const a = await dirigeant.rpc("autoriser_envoi_relance_travail", { p_relance_id: r.id, p_destinataire: c.email });
    if (!a.data?.ok) { console.error(`autorisation ${cle} :`, JSON.stringify(a.data || a.error)); process.exit(1); }
  }
  console.log(garage.id);
} else if (commande === "etat" && garageArg) {
  await garageDeRecette(garageArg);
  const { data } = await admin.from("relances_travaux").select("statut, tentatives, envoye, derniere_erreur, clients(email)").eq("garage_id", garageArg).order("created_at");
  for (const r of data) console.log(`${(r.clients?.email || "").split(".")[0].padEnd(11)} ${r.statut.padEnd(15)} tentatives=${r.tentatives} envoye=${r.envoye} ${r.derniere_erreur || ""}`);
} else {
  console.error("Usage : creer | etat <garage_id>");
  process.exit(1);
}
