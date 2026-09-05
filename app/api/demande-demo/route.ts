import { NextResponse } from "next/server"

// Réception des demandes de démo du site vitrine.
//
// CE QUE CETTE ROUTE REMPLACE
//
// Le formulaire posait `window.location.href = "mailto:…"`. Sur un téléphone
// sans client mail configuré — le cas courant d'un garagiste qui consulte ses
// messages dans un navigateur — il ne se passe RIEN. Le visiteur remplit,
// appuie, croit avoir envoyé sa demande, et personne ne la reçoit jamais.
// C'est la fuite la plus coûteuse du parcours : elle porte sur les seuls
// visiteurs qui étaient prêts à parler.
//
// La demande part maintenant du serveur. Le visiteur sait si elle est passée,
// et si elle ne passe pas, on le lui dit et on lui rend le lien direct.

const DESTINATAIRE = "nexorasolutions.france@gmail.com"

// Expéditeur partagé de Resend : il fonctionne sans domaine vérifié, mais
// uniquement vers l'adresse du titulaire du compte — ce qui est exactement
// notre cas. À remplacer par une adresse du domaine Nexora dès qu'il existe.
const EXPEDITEUR = "Nexora <onboarding@resend.dev>"

const LIMITES = { name: 120, garage: 160, email: 200, phone: 40, need: 4000 }

function texte(valeur: unknown, max: number): string {
  if (typeof valeur !== "string") return ""
  return valeur.trim().slice(0, max)
}

function echapper(valeur: string): string {
  return valeur
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

export async function POST(request: Request) {
  let corps: unknown
  try {
    corps = await request.json()
  } catch {
    return NextResponse.json({ erreur: "requete_illisible" }, { status: 400 })
  }

  const donnees = corps as Record<string, unknown>
  const nom = texte(donnees.name, LIMITES.name)
  const garage = texte(donnees.garage, LIMITES.garage)
  const email = texte(donnees.email, LIMITES.email)
  const telephone = texte(donnees.phone, LIMITES.phone)
  const besoin = texte(donnees.need, LIMITES.need)

  // Le navigateur valide déjà ces champs, mais rien n'oblige un appelant à
  // passer par le navigateur.
  if (!nom || !garage || !email) {
    return NextResponse.json({ erreur: "champs_manquants" }, { status: 400 })
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ erreur: "email_invalide" }, { status: 400 })
  }
  // Piège à robots : un champ que rien n'affiche et qu'aucun humain ne remplit.
  if (texte(donnees.website, 100) !== "") {
    // On répond comme si tout allait bien : signaler le refus apprendrait au
    // robot à contourner le piège.
    return NextResponse.json({ ok: true })
  }

  const cle = process.env.RESEND_API_KEY
  if (!cle) {
    // La route existe mais n'est pas configurée. On le dit franchement plutôt
    // que de faire croire à un envoi : l'interface rendra le lien direct.
    console.error("RESEND_API_KEY absente : demande de démo non transmise")
    return NextResponse.json({ erreur: "envoi_indisponible" }, { status: 503 })
  }

  const lignes = [
    ["Nom", nom],
    ["Garage", garage],
    ["E-mail", email],
    ["Téléphone", telephone || "non renseigné"],
  ]
    .map(([libelle, valeur]) => `<p><strong>${libelle} :</strong> ${echapper(valeur)}</p>`)
    .join("")

  const html =
    `<h2>Demande de démo — ${echapper(garage)}</h2>${lignes}` +
    `<p><strong>Principal besoin :</strong></p>` +
    `<p style="white-space:pre-wrap">${echapper(besoin || "non renseigné")}</p>`

  try {
    const reponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${cle}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: EXPEDITEUR,
        to: [DESTINATAIRE],
        // Répondre au message écrit directement au prospect, sans recopier
        // son adresse à la main.
        reply_to: email,
        subject: `Demande de démo — ${garage}`,
        html,
      }),
    })

    if (!reponse.ok) {
      const detail = await reponse.text()
      console.error("Resend a refusé l'envoi :", reponse.status, detail.slice(0, 300))
      return NextResponse.json({ erreur: "envoi_refuse" }, { status: 502 })
    }
  } catch (erreur) {
    console.error("Envoi de la demande de démo impossible :", erreur)
    return NextResponse.json({ erreur: "envoi_impossible" }, { status: 502 })
  }

  return NextResponse.json({ ok: true })
}
