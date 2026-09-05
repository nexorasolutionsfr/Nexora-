"use client";

import { useState } from "react";
import { Check, Copy, Mail, MessageSquare } from "lucide-react";
import { lienMail, lienSms, lienWhatsApp, messagePartage } from "./lien";

const ACCENT = "#3D6BE0";

// Envoyer un lien au client sans quitter Nexora et sans rien réécrire.
//
// Chaque bouton ouvre l'application du garagiste avec le bon destinataire et
// le message déjà rédigé. Il ne lui reste qu'à appuyer sur envoyer — et c'est
// délibéré : rien ne part en son nom sans qu'il l'ait vu. Voir lien.js pour
// pourquoi ce n'est pas un envoi serveur.
//
// Un canal dont on n'a pas la coordonnée ne s'affiche pas. Un bouton « SMS »
// grisé parce que le client n'a pas de numéro n'aide personne : ce qui aide,
// c'est de voir qu'il faut renseigner le numéro.
export default function PartagerLien({
  url,
  type = "controle",
  garage,
  vehicule,
  telephone,
  email,
  decisionAttendue = false,
  onCopie,
}) {
  const [copie, setCopie] = useState(false);
  if (!url) return null;

  const { objet, corps } = messagePartage({ type, garage, vehicule, decisionAttendue, url });
  const sms = lienSms(telephone, corps);
  const whatsapp = lienWhatsApp(telephone, corps);
  const mail = lienMail(email, objet, corps);

  const copier = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopie(true);
      setTimeout(() => setCopie(false), 2000);
      if (onCopie) onCopie();
    } catch {
      if (onCopie) onCopie(false);
    }
  };

  const style = "px-3 py-2 rounded-xl text-[12.5px] font-medium border border-slate-200 text-slate-700 flex items-center gap-1.5 hover:border-slate-300 transition-colors";

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <div className="text-[12px] font-medium text-slate-500 mb-2">Envoyer au client</div>
      <div className="flex flex-wrap gap-2">
        {sms && (
          <a href={sms} className={style}>
            <MessageSquare size={13} /> SMS
          </a>
        )}
        {whatsapp && (
          <a href={whatsapp} target="_blank" rel="noopener noreferrer" className={style}>
            {/* Pas d'icône WhatsApp dans lucide : le nom suffit, et il est
                reconnu de tout le monde. */}
            <span aria-hidden style={{ color: "#16A34A", fontWeight: 700 }}>W</span> WhatsApp
          </a>
        )}
        {mail && (
          <a href={mail} className={style}>
            <Mail size={13} /> E-mail
          </a>
        )}
        <button type="button" onClick={copier} className={style} style={copie ? { borderColor: ACCENT, color: ACCENT } : undefined}>
          {copie ? <Check size={13} /> : <Copy size={13} />} {copie ? "Copié" : "Copier le lien"}
        </button>
      </div>
      {!sms && !mail && (
        <div className="mt-2 text-[11.5px] text-slate-400">
          Ce client n&apos;a ni numéro ni e-mail enregistré. Renseignez-les dans sa fiche
          pour l&apos;envoyer en un geste.
        </div>
      )}
      <div className="mt-2 text-[11px] text-slate-400 break-all">{url}</div>
    </div>
  );
}
