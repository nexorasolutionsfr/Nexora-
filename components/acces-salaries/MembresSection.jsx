"use client";

// Accès salariés V1 — écran de gestion des accès, réservé au dirigeant.
//
// Cet écran n'accorde aucun droit par lui-même : il appelle les RPC
// `lister_membres_garage`, `inviter_membre_garage`, `changer_role_membre` et
// `revoquer_membre_garage`, qui refusent toutes un appelant qui n'est pas
// dirigeant du garage visé. Le masquage de la section pour les autres rôles
// est un confort d'affichage, jamais une protection.
//
// Aucune invitation n'est envoyée : le compte doit déjà exister côté
// authentification. Le raccordement à un envoi d'e-mail est hors V1.

import { useCallback, useEffect, useState } from "react";
import { ShieldCheck, UserPlus, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  DESCRIPTIONS_ROLES,
  LIBELLES_ROLES,
  ROLES,
  ROLE_ACCUEIL,
  ROLE_MECANICIEN,
  peutGererLesAcces,
} from "./accesConstants";
import {
  changerRoleMembre,
  inviterMembre,
  listerMembres,
  revoquerMembre,
} from "./acces";

function Badge({ children, tone = "slate" }) {
  const tones = {
    green: { bg: "#E7F6EC", text: "#15803D" },
    slate: { bg: "#F1F5F9", text: "#475569" },
    red: { bg: "#FDECEC", text: "#B91C1C" },
  };
  const t = tones[tone] || tones.slate;
  return (
    <span
      className="text-[11.5px] font-medium px-2.5 py-1 rounded-full inline-block"
      style={{ backgroundColor: t.bg, color: t.text }}
    >
      {children}
    </span>
  );
}

export default function MembresSection({ garageId, monRole, mecaniciens = [] }) {
  const [membres, setMembres] = useState([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState(null);
  const [formOuvert, setFormOuvert] = useState(false);
  const [userId, setUserId] = useState("");
  const [role, setRole] = useState(ROLE_ACCUEIL);
  const [mecanicienId, setMecanicienId] = useState("");
  const [enCours, setEnCours] = useState(false);

  const recharger = useCallback(async () => {
    if (!garageId) return;
    setChargement(true);
    setErreur(null);
    try {
      setMembres(await listerMembres(supabase, garageId));
    } catch (e) {
      setErreur(e?.message || "Chargement impossible");
    } finally {
      setChargement(false);
    }
  }, [garageId]);

  useEffect(() => {
    recharger();
  }, [recharger]);

  if (!peutGererLesAcces(monRole)) return null;

  const mecaniciensDisponibles = mecaniciens.filter((m) => m.actif !== false);

  async function soumettre(e) {
    e.preventDefault();
    setEnCours(true);
    setErreur(null);
    try {
      await inviterMembre(supabase, {
        garageId,
        userId: userId.trim(),
        role,
        mecanicienId: mecanicienId || null,
      });
      setUserId("");
      setMecanicienId("");
      setRole(ROLE_ACCUEIL);
      setFormOuvert(false);
      await recharger();
    } catch (e2) {
      setErreur(e2?.message || "Rattachement impossible");
    } finally {
      setEnCours(false);
    }
  }

  async function changer(membre, nouveauRole) {
    setErreur(null);
    try {
      await changerRoleMembre(supabase, {
        membreId: membre.membre_id,
        role: nouveauRole,
        mecanicienId: membre.mecanicien_id,
      });
      await recharger();
    } catch (e) {
      setErreur(e?.message || "Changement impossible");
    }
  }

  async function revoquer(membre) {
    setErreur(null);
    try {
      await revoquerMembre(supabase, membre.membre_id);
      await recharger();
    } catch (e) {
      setErreur(e?.message || "Révocation impossible");
    }
  }

  return (
    <section className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
      <header className="flex items-start gap-3 mb-5">
        <ShieldCheck className="w-5 h-5 mt-0.5 text-slate-500" aria-hidden="true" />
        <div className="flex-1">
          <h2 className="text-base font-semibold text-slate-900">Accès de l'équipe</h2>
          <p className="text-sm text-slate-500 mt-1 max-w-prose">
            Chaque personne se connecte avec son propre compte. Les droits sont
            appliqués par la base de données, pas par l'affichage : une révocation
            prend effet immédiatement.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setFormOuvert((v) => !v)}
          className="inline-flex items-center gap-2 text-sm font-medium px-3 py-2 rounded-lg border border-slate-200 hover:bg-slate-50"
        >
          {formOuvert ? <X className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
          {formOuvert ? "Annuler" : "Rattacher un compte"}
        </button>
      </header>

      {erreur && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mb-4">
          {erreur}
        </p>
      )}

      {formOuvert && (
        <form onSubmit={soumettre} className="border border-slate-200 rounded-xl p-4 mb-5 grid gap-3">
          <p className="text-[13px] text-slate-500">
            Le compte doit déjà exister. Aucune invitation n'est envoyée depuis
            cet écran.
          </p>
          <label className="grid gap-1 text-sm">
            <span className="font-medium text-slate-700">Identifiant du compte</span>
            <input
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              required
              placeholder="00000000-0000-0000-0000-000000000000"
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm"
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-medium text-slate-700">Rôle</span>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm"
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {LIBELLES_ROLES[r]}
                </option>
              ))}
            </select>
            <span className="text-[12.5px] text-slate-500">{DESCRIPTIONS_ROLES[role]}</span>
          </label>
          {role === ROLE_MECANICIEN && (
            <label className="grid gap-1 text-sm">
              <span className="font-medium text-slate-700">Fiche mécanicien</span>
              <select
                value={mecanicienId}
                onChange={(e) => setMecanicienId(e.target.value)}
                required
                className="border border-slate-200 rounded-lg px-3 py-2 text-sm"
              >
                <option value="">Choisir…</option>
                {mecaniciensDisponibles.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nom}
                  </option>
                ))}
              </select>
              <span className="text-[12.5px] text-slate-500">
                C'est elle qui relie ce compte aux ordres de réparation qui lui
                sont affectés.
              </span>
            </label>
          )}
          <div>
            <button
              type="submit"
              disabled={enCours}
              className="text-sm font-medium px-4 py-2 rounded-lg bg-slate-900 text-white disabled:opacity-60"
            >
              {enCours ? "Enregistrement…" : "Rattacher"}
            </button>
          </div>
        </form>
      )}

      {chargement ? (
        <p className="text-sm text-slate-500">Chargement…</p>
      ) : membres.length === 0 ? (
        <p className="text-sm text-slate-500">
          Personne n'est encore rattaché. Vous êtes seul à accéder à ce garage.
        </p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {membres.map((m) => (
            <li key={m.membre_id} className="py-3 flex flex-wrap items-center gap-3">
              <span className="text-sm text-slate-900 font-medium">{m.email}</span>
              {m.mecanicien_nom && (
                <span className="text-[12.5px] text-slate-500">{m.mecanicien_nom}</span>
              )}
              <span className="ml-auto flex items-center gap-3">
                {m.actif ? (
                  <Badge tone="green">{LIBELLES_ROLES[m.role] || m.role}</Badge>
                ) : (
                  <Badge tone="red">Accès révoqué</Badge>
                )}
                {m.actif && (
                  <>
                    <select
                      value={m.role}
                      onChange={(e) => changer(m, e.target.value)}
                      aria-label={`Rôle de ${m.email}`}
                      className="border border-slate-200 rounded-lg px-2 py-1 text-[13px]"
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {LIBELLES_ROLES[r]}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => revoquer(m)}
                      className="text-[13px] font-medium text-red-700 hover:underline"
                    >
                      Révoquer
                    </button>
                  </>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
