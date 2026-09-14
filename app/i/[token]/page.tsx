"use client";

import { use, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { CATEGORIE_LABEL, ETAT_POINT_LABEL, NIVEAU_CARBURANT_LABEL } from "@/components/inspections/inspectionsConstants";
import PhotoEnGrand from "@/components/inspections/PhotoEnGrand";
import { ouvreAuClavier } from "@/components/inspections/photoEnGrand";

const ETAT_COLOR = { ok: "#16A34A", a_surveiller: "#D97706", a_valider_client: "#D97706", dommage: "#DC2626" };

function PointCard({ point, photoUrls, onDecider, pending, onConfirmer, onAnnuler, deciding, onOuvrirPhoto }) {
  const photos = (point.photos || []).filter((p) => photoUrls[p]);
  const titrePoint = `${CATEGORIE_LABEL[point.categorie]} · ${point.libelle}`;
  return (
    <div style={{ background: "white", borderRadius: 14, padding: 14, marginBottom: 10, border: "1px solid #E7EAF0" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: "#0F1B33" }}>{CATEGORIE_LABEL[point.categorie]} · {point.libelle}</div>
        <span style={{ fontSize: 11, fontWeight: 600, color: "white", background: ETAT_COLOR[point.etat], borderRadius: 999, padding: "3px 9px", whiteSpace: "nowrap" }}>
          {ETAT_POINT_LABEL[point.etat]}
        </span>
      </div>
      {point.commentaire && <div style={{ fontSize: 13, color: "#475569", marginTop: 6 }}>{point.commentaire}</div>}
      {photos.length > 0 && (
        <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap", alignItems: "center" }}>
          {photos.map((p, i) => (
            <button
              key={p}
              type="button"
              onClick={() => onOuvrirPhoto(photos.map((c) => photoUrls[c]), i, titrePoint, point.commentaire)}
              onKeyDown={(e) => {
                if (!ouvreAuClavier(e.key)) return;
                e.preventDefault();
                onOuvrirPhoto(photos.map((c) => photoUrls[c]), i, titrePoint, point.commentaire);
              }}
              aria-label={`Voir la photo en grand — ${titrePoint}${photos.length > 1 ? ` (${i + 1} sur ${photos.length})` : ""}`}
              style={{ padding: 0, border: "1px solid #E7EAF0", borderRadius: 10, background: "white", cursor: "pointer", lineHeight: 0 }}
            >
              <img src={photoUrls[p]} alt="" style={{ width: 64, height: 64, borderRadius: 9, objectFit: "cover", display: "block" }} />
            </button>
          ))}
          <span style={{ fontSize: 12, color: "#94A3B8" }}>Touchez la photo pour l&apos;agrandir</span>
        </div>
      )}
      {point.soumis_client && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid #F1F3F7" }}>
          {point.decision_client ? (
            <div style={{ fontSize: 13, fontWeight: 600, color: point.decision_client === "valide" ? "#16A34A" : "#DC2626" }}>
              {point.decision_client === "valide" ? "Vous avez validé ce point." : "Vous avez refusé ce point."}
              {point.decision_le && (
                <span style={{ fontWeight: 400, color: "#94A3B8", marginLeft: 6 }}>
                  {new Date(point.decision_le).toLocaleString("fr-FR", { timeZone: "Europe/Paris" })}
                </span>
              )}
            </div>
          ) : pending === point.id ? (
            <div style={{ display: "flex", gap: 8 }}>
              <button disabled={deciding} onClick={onConfirmer} style={{ flex: 1, padding: "10px 12px", borderRadius: 10, border: "none", background: "#0F1B33", color: "white", fontSize: 13, fontWeight: 600 }}>
                Confirmer
              </button>
              <button disabled={deciding} onClick={onAnnuler} style={{ flex: 1, padding: "10px 12px", borderRadius: 10, border: "1px solid #E2E8F0", background: "white", color: "#64748B", fontSize: 13, fontWeight: 600 }}>
                Annuler
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => onDecider(point.id, "valide")} style={{ flex: 1, padding: "10px 12px", borderRadius: 10, border: "none", background: "#16A34A", color: "white", fontSize: 13, fontWeight: 600 }}>
                Valider ce point
              </button>
              <button onClick={() => onDecider(point.id, "refuse")} style={{ flex: 1, padding: "10px 12px", borderRadius: 10, border: "1px solid #DC2626", background: "white", color: "#DC2626", fontSize: 13, fontWeight: 600 }}>
                Refuser
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function InspectionTokenPage({ params }) {
  const { token } = use(params);
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pending, setPending] = useState({ id: null, choix: null });
  const [deciding, setDeciding] = useState(false);
  const [photoUrls, setPhotoUrls] = useState({});
  // Photo affichée en grand : aucune écriture, aucun effet sur les décisions du contrôle.
  const [photoOuverte, setPhotoOuverte] = useState(null);
  const ouvrirPhoto = (urls, index, titre, commentaire) => setPhotoOuverte({ urls, index, titre, commentaire });

  const load = async () => {
    const { data, error } = await supabase.rpc("lire_inspection_par_jeton", { p_token: token });
    if (error || !data) {
      setError("Ce lien n'est plus valable. Il a peut-être expiré ou été révoqué par le garage. Contactez votre garage pour obtenir un nouveau lien.");
      setLoading(false);
      return;
    }
    setInfo(data);
    setLoading(false);

    // Bucket privé : les photos ne s'obtiennent que via des URLs signées de
    // courte durée, générées côté serveur après revalidation du jeton.
    const paths = Array.from(new Set((data.points || []).flatMap((p) => p.photos || [])));
    if (paths.length > 0) {
      try {
        const res = await fetch("/api/inspections/photos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const json = await res.json();
        if (res.ok) setPhotoUrls(json.urls || {});
      } catch (fetchError) {
        console.error("Erreur chargement des photos :", fetchError);
      }
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const confirmer = async () => {
    if (!pending.id) return;
    setDeciding(true);
    const { data, error } = await supabase.rpc("repondre_point_inspection_par_jeton", { p_token: token, p_point_id: pending.id, p_decision: pending.choix });
    setDeciding(false);
    if (error || data !== true) {
      setError("Cette décision n'a pas pu être enregistrée. Le lien a peut-être expiré. Rechargez la page ou contactez votre garage.");
      return;
    }
    setPending({ id: null, choix: null });
    await load();
  };

  const pointsSoumis = useMemo(() => (info?.points || []).filter((p) => p.soumis_client), [info]);
  const pointsInfo = useMemo(() => (info?.points || []).filter((p) => !p.soumis_client), [info]);
  const toutesDecidees = pointsSoumis.length > 0 && pointsSoumis.every((p) => p.decision_client);

  if (loading) return <div style={{ padding: 24, fontFamily: "-apple-system, sans-serif", color: "#64748B" }}>Chargement...</div>;
  if (error) return <div style={{ padding: 24, fontFamily: "-apple-system, sans-serif", color: "#DC2626", maxWidth: 420, margin: "40px auto", textAlign: "center" }}>{error}</div>;

  return (
    <div style={{ minHeight: "100vh", background: "#F5F7FA", padding: 20, fontFamily: "-apple-system, sans-serif" }}>
      <div style={{ maxWidth: 480, margin: "0 auto" }}>
        <div style={{ background: "#0F1B33", color: "white", borderRadius: 16, padding: 20, marginBottom: 16 }}>
          <div style={{ fontSize: 13, opacity: 0.7 }}>{info.garage_nom || "Votre garage"}</div>
          <div style={{ fontSize: 18, fontWeight: 600, marginTop: 4 }}>{info.vehicule_libelle || "Votre véhicule"}</div>
          {info.immatriculation && <div style={{ fontSize: 13, opacity: 0.7, marginTop: 2 }}>{info.immatriculation}</div>}
          <div style={{ display: "flex", gap: 16, marginTop: 12, fontSize: 13, opacity: 0.85 }}>
            {info.kilometrage != null && <span>{Number(info.kilometrage).toLocaleString("fr-FR")} km</span>}
            {info.niveau_carburant && <span>Carburant : {NIVEAU_CARBURANT_LABEL[info.niveau_carburant]}</span>}
          </div>
        </div>

        {toutesDecidees && (
          <div style={{ background: "#E7F6EC", color: "#15803D", borderRadius: 12, padding: 12, fontSize: 13, fontWeight: 600, marginBottom: 14, textAlign: "center" }}>
            Merci, toutes vos décisions ont été enregistrées.
          </div>
        )}

        {pointsSoumis.length > 0 && (
          <>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#0F1B33", margin: "4px 0 8px" }}>Points nécessitant votre décision</div>
            <div style={{ fontSize: 12, color: "#94A3B8", marginBottom: 10 }}>
              Chaque décision porte uniquement sur le point concerné — elle ne vaut pas accord général pour d'autres travaux.
            </div>
            {pointsSoumis.map((p) => (
              <PointCard
                key={p.id}
                point={p}
                photoUrls={photoUrls}
                pending={pending.id}
                deciding={deciding}
                onDecider={(id, choix) => setPending({ id, choix })}
                onConfirmer={confirmer}
                onAnnuler={() => setPending({ id: null, choix: null })}
                onOuvrirPhoto={ouvrirPhoto}
              />
            ))}
          </>
        )}

        {pointsInfo.length > 0 && (
          <>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#0F1B33", margin: "18px 0 8px" }}>Autres constats</div>
            <div style={{ fontSize: 12, color: "#94A3B8", marginBottom: 10 }}>
              Ces points sont communiqués à titre d'information et ne demandent aucune décision de votre part.
            </div>
            {pointsInfo.map((p) => (
              <PointCard key={p.id} point={p} photoUrls={photoUrls} pending={null} deciding={false} onDecider={() => {}} onConfirmer={() => {}} onAnnuler={() => {}} onOuvrirPhoto={ouvrirPhoto} />
            ))}
          </>
        )}

        {pointsSoumis.length === 0 && pointsInfo.length === 0 && (
          <div style={{ fontSize: 13, color: "#94A3B8", textAlign: "center", padding: "24px 0" }}>Aucun constat renseigné pour cette inspection.</div>
        )}
      </div>

      {photoOuverte && (
        <PhotoEnGrand
          photos={photoOuverte.urls}
          indexInitial={photoOuverte.index}
          titre={photoOuverte.titre}
          commentaire={photoOuverte.commentaire}
          onFermer={() => setPhotoOuverte(null)}
        />
      )}
    </div>
  );
}
