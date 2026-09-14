// Recette SERVEUR du suivi partagé et des relances de travaux différés — TEST.
//
// Joue, sous de vraies sessions, la chaîne sans n8n ni fournisseur :
//   candidat → brouillon à relire → autorisation → réservation → résultat.
// Le « transport » est ici le script lui-même : la ligne finit `envoye` avec un
// motif qui dit que rien de réel n'est parti.
//
// PÉRIMÈTRE : depuis l'incident du 14 septembre (docs/recette/incident-relance-2026-09-14.md),
// le script ne travaille QUE sur ce qu'il crée. La borne est passée à la base
// dans l'instruction elle-même (`p_travaux`, `p_relances`, 20260919000600),
// jamais vérifiée seulement avant coup. La section D le prouve avec une relance
// hors périmètre déjà en attente et une autorisation concurrente.
//
// Usage : node scripts/recette/relances-travaux-serveur.mjs <garage_id>

import { admin, compteur, garageDeRecette, session, utilisateurs } from "./outils-recette.mjs";

const garageId = process.argv[2];
if (!garageId) { console.error("Usage : relances-travaux-serveur.mjs <garage_id>"); process.exit(1); }
const garage = await garageDeRecette(garageId);
const { verifier, bilan } = compteur();
const INCIDENT = "fb259234-68bb-4aa0-ae1a-86ab34dead73";

const users = await utilisateurs();
const { data: membres } = await admin.from("garage_membres").select("user_id, role, actif").eq("garage_id", garageId);
const idDe = (role, actif = true) => membres.find((m) => m.role === role && m.actif === actif)?.user_id;
const emailDe = (id) => users.find((u) => u.id === id)?.email;
const dirigeant = await session(emailDe(garage.owner_user_id));
const accueil = await session(emailDe(idDe("accueil")));
const revoque = await session(emailDe(idDe("accueil", false)));
const mecano = await session(emailDe(idDe("mecanicien")));
const { data: vehicule } = await admin.from("vehicules").select("id, client_id").eq("garage_id", garageId).eq("immatriculation", "BA-101-AA").single();
const { data: client } = await admin.from("clients").select("id, email").eq("id", vehicule.client_id).single();
const jour = (decalage) => { const d = new Date(); d.setDate(d.getDate() + decalage); return d.toISOString().slice(0, 10); };
const relancesDe = async (travailId) => (await admin.from("relances_travaux").select("*").eq("travail_differe_id", travailId).order("created_at")).data || [];
const ligne = async (id) => (await admin.from("relances_travaux").select("id, statut, tentatives, updated_at, derniere_erreur, texte").eq("id", id).single()).data;

const { data: incidentAvant } = await admin.from("relances_travaux").select("statut, tentatives, updated_at").eq("id", INCIDENT).maybeSingle();

// Les travaux créés par ce script : la seule matière qu'il a le droit de toucher.
const mesTravaux = [];
async function travail(champs) {
  const { data, error } = await dirigeant.from("travaux_differes").insert({ garage_id: garageId, client_id: client.id, vehicule_id: vehicule.id, source: "manuel", niveau: "normal", ...champs }).select("id").single();
  if (error) { console.error("travail :", error.message); process.exit(1); }
  mesTravaux.push(data.id);
  return data.id;
}
const preparer = (travaux = mesTravaux) => admin.rpc("preparer_relances_travaux", { p_garages: [garageId], p_travaux: travaux });

console.log(`Garage ${garage.nom_garage}\n`);

console.log("A. Suivi partagé (opportunites_actions)");
{
  const t = await travail({ intervention: "Suivi partagé (recette)", statut: "a_relancer", date_relance: jour(-1) });
  const { error: eIns } = await accueil.from("opportunites_actions").insert({ garage_id: garageId, source_type: "travail_differe", source_id: t, action: "traite" });
  verifier("l'accueil enregistre « traité »", !eIns, eIns?.message);
  const { data: vu } = await dirigeant.from("opportunites_actions").select("effectue_par").eq("garage_id", garageId).eq("source_id", t);
  verifier("le dirigeant voit ce geste, avec son auteur (l'accueil)", vu?.length === 1 && vu[0].effectue_par === idDe("accueil"));
  verifier("l'accueil révoqué ne voit rien", ((await revoque.from("opportunites_actions").select("id").eq("garage_id", garageId)).data || []).length === 0);
  verifier("l'accueil révoqué n'écrit pas", Boolean((await revoque.from("opportunites_actions").insert({ garage_id: garageId, source_type: "travail_differe", source_id: t, action: "traite" })).error));
  verifier("le mécanicien ne voit rien", ((await mecano.from("opportunites_actions").select("id").eq("garage_id", garageId)).data || []).length === 0);
  await admin.from("opportunites_actions").delete().eq("source_id", t);
  // Ce travail ne sert qu'au suivi partagé : retiré avant la section B, sinon
  // il y produit une relance légitime qui fausserait le compte.
  await dirigeant.from("travaux_differes").delete().eq("id", t);
  mesTravaux.splice(mesTravaux.indexOf(t), 1);
}

console.log("B. Préparation (bornée aux travaux du script)");
const echu = await travail({ intervention: "Pneus arrière à remplacer (recette)", niveau: "important", statut: "a_relancer", date_relance: jour(-2), montant_ttc: 180 });
const futur = await travail({ intervention: "Vidange dans 6 mois (recette)", statut: "planifie", date_relance: jour(30) });
const clos = await travail({ intervention: "Clos (recette)", statut: "recupere", date_relance: jour(-5) });
{
  const p1 = await preparer();
  verifier("premier passage : une relance, pour le travail échu seulement", !p1.error && p1.data.length === 1 && p1.data[0].action === "preparee" && p1.data[0].travail_id === echu, JSON.stringify(p1.data || p1.error));
  verifier("second passage : rien", (await preparer()).data?.length === 0);
  const [r] = await relancesDe(echu);
  verifier("brouillon à relire, composé en base", r?.statut === "a_relire" && /Un point sur votre/.test(r.sujet) && /Pneus arrière/.test(r.texte) && /180/.test(r.texte));
  verifier("rien pour le futur ni pour le clos", (await relancesDe(futur)).length === 0 && (await relancesDe(clos)).length === 0);
  await dirigeant.from("travaux_differes").update({ date_relance: jour(10) }).eq("id", echu);
  const p3 = await preparer();
  verifier("report → obsolète, rien avant la nouvelle date", p3.data?.some((x) => x.action === "obsolete" && x.relance_id === r.id) && !p3.data.some((x) => x.action === "preparee"));
  await dirigeant.from("travaux_differes").update({ date_relance: jour(-1) }).eq("id", echu);
  await preparer();
  const apres = await relancesDe(echu);
  verifier("nouvelle échéance → nouvelle relance, l'ancienne reste obsolète", apres.length === 2 && apres.filter((x) => x.statut === "obsolete").length === 1 && apres.filter((x) => x.statut === "a_relire").length === 1);
}

console.log("C. Relire, corriger, autoriser");
const relance = (await relancesDe(echu)).find((x) => x.statut === "a_relire");
{
  verifier("l'accueil lit le brouillon", ((await accueil.from("relances_travaux").select("id").eq("id", relance.id)).data || []).length === 1);
  verifier("l'accueil révoqué ne le voit pas", ((await revoque.from("relances_travaux").select("id").eq("id", relance.id)).data || []).length === 0);
  const m = await accueil.rpc("modifier_relance_travail", { p_relance_id: relance.id, p_sujet: relance.sujet, p_texte: relance.texte + "\n\nPS : ouverts le samedi matin." });
  verifier("l'accueil corrige le texte", m.data?.ok === true, JSON.stringify(m.data || m.error));
  const mauvais = await accueil.rpc("autoriser_envoi_relance_travail", { p_relance_id: relance.id, p_destinataire: "autre@nexora-recette.invalid" });
  verifier("autre destinataire → destinataire_different", mauvais.data?.raison === "destinataire_different");
  verifier("révoqué → refus", Boolean((await revoque.rpc("autoriser_envoi_relance_travail", { p_relance_id: relance.id, p_destinataire: client.email })).error));
  verifier("mécanicien → refus", Boolean((await mecano.rpc("autoriser_envoi_relance_travail", { p_relance_id: relance.id, p_destinataire: client.email })).error));
  const okA = await accueil.rpc("autoriser_envoi_relance_travail", { p_relance_id: relance.id, p_destinataire: client.email });
  const autorisee = await ligne(relance.id);
  verifier("l'accueil autorise → en_attente", okA.data?.ok === true && autorisee.statut === "en_attente");
  verifier("ré-autoriser → deja_autorise", (await accueil.rpc("autoriser_envoi_relance_travail", { p_relance_id: relance.id, p_destinataire: client.email })).data?.deja_autorise === true);
  verifier("plus de modification après autorisation", (await accueil.rpc("modifier_relance_travail", { p_relance_id: relance.id, p_sujet: "X", p_texte: "Y" })).data?.raison === "statut");
}

console.log("D. Réservation bornée dans l'instruction");
{
  // Une relance HORS périmètre, déjà autorisée avant la réservation — dont le
  // texte dérive, pour vérifier que même la mise de côté ne la touche pas.
  const tHors = await travail({ intervention: "Hors périmètre déjà en attente (recette)", statut: "a_relancer", date_relance: jour(-1) });
  await preparer([tHors]);
  const [rHors] = await relancesDe(tHors);
  await accueil.rpc("autoriser_envoi_relance_travail", { p_relance_id: rHors.id, p_destinataire: client.email });
  await admin.from("relances_travaux").update({ texte: rHors.texte + " (dérive)" }).eq("id", rHors.id);
  const horsAvant = await ligne(rHors.id);
  // Une relance qui sera autorisée PENDANT la réservation.
  const tConc = await travail({ intervention: "Autorisée pendant la réservation (recette)", statut: "a_relancer", date_relance: jour(-1) });
  await preparer([tConc]);
  const [rConc] = await relancesDe(tConc);

  // Ma ligne : son message dérive après l'autorisation → mise de côté.
  await admin.from("relances_travaux").update({ texte: "texte modifié après autorisation" }).eq("id", relance.id);
  const r1 = await admin.rpc("reserver_relances_travaux", { p_limite: 10, p_garages: [garageId], p_relances: [relance.id] });
  const mienne1 = await ligne(relance.id);
  verifier("ma ligne modifiée après validation → bloquée, non réservée", !r1.error && (r1.data || []).length === 0 && mienne1.statut === "bloque" && /message a changé/.test(mienne1.derniere_erreur || ""), JSON.stringify(r1.data || r1.error));
  const horsApres1 = await ligne(rHors.id);
  verifier("hors périmètre dérivée : ni mise de côté, ni réservée, ni modifiée", horsApres1.statut === "en_attente" && horsApres1.tentatives === horsAvant.tentatives && horsApres1.updated_at === horsAvant.updated_at, JSON.stringify(horsApres1));

  verifier("revalidation à la main → en_attente", (await accueil.rpc("autoriser_envoi_relance_travail", { p_relance_id: relance.id, p_destinataire: client.email })).data?.ok === true);

  // Concurrence : deux réservations bornées à ma ligne + une autorisation d'une
  // autre ligne du même garage, lancées ensemble.
  const [r2, r3, autorisation] = await Promise.all([
    admin.rpc("reserver_relances_travaux", { p_limite: 10, p_garages: [garageId], p_relances: [relance.id] }),
    admin.rpc("reserver_relances_travaux", { p_limite: 10, p_garages: [garageId], p_relances: [relance.id] }),
    accueil.rpc("autoriser_envoi_relance_travail", { p_relance_id: rConc.id, p_destinataire: client.email }),
  ]);
  const prises = [...(r2.data || []), ...(r3.data || [])];
  verifier("deux réservations simultanées → ma ligne prise une seule fois, et elle seule", prises.length === 1 && prises[0].id === relance.id, JSON.stringify(prises.map((p) => p.id)));
  const conc = await ligne(rConc.id);
  verifier("autorisée pendant la réservation : en_attente, 0 tentative, jamais réservée", autorisation.data?.ok === true && conc.statut === "en_attente" && conc.tentatives === 0, JSON.stringify(conc));
  const horsApres2 = await ligne(rHors.id);
  verifier("hors périmètre toujours intacte (statut, tentatives, updated_at)", horsApres2.statut === "en_attente" && horsApres2.tentatives === horsAvant.tentatives && horsApres2.updated_at === horsAvant.updated_at);
  verifier("un tableau vide ne réserve rien", ((await admin.rpc("reserver_relances_travaux", { p_limite: 10, p_garages: [garageId], p_relances: [] })).data || []).length === 0);

  verifier("envoi_en_cours jamais repris", ((await admin.rpc("reserver_relances_travaux", { p_limite: 10, p_garages: [garageId], p_relances: [relance.id] })).data || []).length === 0);
  await admin.rpc("terminer_relance_travail", { p_id: relance.id, p_resultat: "a_reprendre", p_motif: "échec certain avant envoi (simulé)" });
  const reprendre = await ligne(relance.id);
  verifier("a_reprendre → en_attente, tentative comptée", reprendre.statut === "en_attente" && reprendre.tentatives === 1);
  verifier("reprise : réservée à nouveau", ((await admin.rpc("reserver_relances_travaux", { p_limite: 10, p_garages: [garageId], p_relances: [relance.id] })).data || []).length === 1);
  await admin.rpc("terminer_relance_travail", { p_id: relance.id, p_resultat: "envoye", p_motif: "transport simulé (recette) : aucun message réel n'est parti" });
  const fin = await ligne(relance.id);
  verifier("résultat : envoye, motif « simulé »", fin.statut === "envoye" && /simulé/.test(fin.derniere_erreur || ""));
  verifier("annuler une relance envoyée → refus", (await accueil.rpc("annuler_relance_travail", { p_relance_id: relance.id, p_motif: "test" })).data?.raison === "statut");

  await dirigeant.from("travaux_differes").update({ statut: "refus_definitif" }).eq("id", tConc);
  const p6 = await preparer([tConc]);
  verifier("refus définitif → la relance autorisée non partie est annulée", p6.data?.some((x) => x.action === "annulee") && (await ligne(rConc.id)).statut === "annulee");
}

const { data: incidentApres } = await admin.from("relances_travaux").select("statut, tentatives, updated_at").eq("id", INCIDENT).maybeSingle();
verifier("la ligne de l'incident n'a pas été touchée", JSON.stringify(incidentAvant) === JSON.stringify(incidentApres), `${JSON.stringify(incidentAvant)} → ${JSON.stringify(incidentApres)}`);

for (const id of mesTravaux) await dirigeant.from("travaux_differes").delete().eq("id", id);
process.exit(bilan() ? 0 : 1);
