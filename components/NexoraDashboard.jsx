
"use client"; import { supabase } from "@/lib/supabase";

import React, { useState, useEffect } from "react";
import {
  Home,
  Calendar,
  Clock,
  Inbox,
  Users,
  Settings,
  Search,
  Phone,
  Mail,
  Car,
  Check,
  X,
  ChevronLeft,
  ChevronRight,
  Gauge,
  MessageSquare,
  MapPin,
  Wrench,
  Sparkles,
  Bot,
  Globe,
  StickyNote,
  TrendingUp,
  CalendarPlus,
  CalendarClock,
  Star,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
// Vercel rebuild trigger
// =====================================================================================
// DESIGN TOKENS
// =====================================================================================
const NAVY = "#0F1B33";
const NAVY_SOFT = "#16264A";
const ACCENT = "#3D6BE0";
const ACCENT_SOFT = "#EAF0FF";
const BG = "#F5F7FA";

const CATEGORY_COLORS = {
  entretien: { bar: "#16A34A", bg: "#E7F6EC", text: "#15803D", label: "Entretien" },
  diagnostic: { bar: "#3D6BE0", bg: "#EAF0FF", text: "#2748A6", label: "Diagnostic" },
  reparation: { bar: "#D97706", bg: "#FEF3E2", text: "#B45309", label: "Réparation" },
  urgence: { bar: "#DC2626", bg: "#FDECEC", text: "#B91C1C", label: "Urgence" },
};
const catColor = (cat) => CATEGORY_COLORS[cat] || CATEGORY_COLORS.entretien;
function formatPhone(phone) {
  if (!phone) return "";

  const clean = phone.replace(/\s/g, "");

  if (clean.length === 10) {
    return clean.match(/.{1,2}/g).join(" ");
  }

  return phone;
}

const STATUT_TONE = { "Confirmé": "green", "En attente": "amber", "Terminé": "slate" };
const URGENCE_TONE = { "Élevée": "red", "Moyenne": "amber", "Faible": "slate" };

const SOURCE_META = {
  gmail: { label: "Gmail", icon: Mail, bg: "#FDECEC", text: "#B91C1C" },
  site: { label: "Site internet", icon: Globe, bg: "#EAF0FF", text: "#2748A6" },
  telephone_ia: { label: "IA vocale", icon: Phone, bg: "#F1EBFE", text: "#6D28D9" },
  whatsapp: { label: "WhatsApp", icon: MessageSquare, bg: "#E7F6EC", text: "#15803D" },
  nexora: { label: "Nexora", icon: Globe, bg: "#EAF0FF", text: "#2748A6" },
};

// =====================================================================================
// DONNÉES FICTIVES — structurées comme un futur schéma Supabase (tables commentées).
// Toutes les requêtes réelles filtreront par garage_id (préparation multi-garages).
// =====================================================================================

// Table: garages
const garage = {
  id: "garage_1",
  nom: "Garage Demo Nexora",
  ville: "Saint-Dizier",
  logo_url: null,
  horaire_ouverture: "08:00",
  horaire_fermeture: "18:00",
  nb_mecaniciens: 3,
  ouvert_aujourdhui: true,
  gmail_connecte: true,
  google_agenda_connecte: false,
  notifications_email: true,
  notifications_sms: false,
};

// Table: clients (garage_id fk)
const clientsTable = [
  { id: "cli_1", garage_id: "garage_1", nom: "Sophie Durand", telephone: "06 12 34 56 78", email: "sophie.durand@mail.com", fidele: true },
  { id: "cli_2", garage_id: "garage_1", nom: "Marc Martin", telephone: "06 98 76 54 32", email: "marc.martin@mail.com", fidele: false },
  { id: "cli_3", garage_id: "garage_1", nom: "Amandine Roy", telephone: "06 45 12 33 90", email: "amandine.roy@mail.com", fidele: false },
  { id: "cli_4", garage_id: "garage_1", nom: "Karim Belaïd", telephone: "07 11 22 33 44", email: "karim.belaid@mail.com", fidele: true },
  { id: "cli_5", garage_id: "garage_1", nom: "Léa Fontaine", telephone: "06 55 66 77 88", email: "lea.fontaine@mail.com", fidele: false },
];

// Table: vehicules (client_id fk)
const vehiculesTable = [
  { id: "veh_1", client_id: "cli_1", marque: "Renault", modele: "Clio", annee: 2019, immatriculation: "AB-123-CD" },
  { id: "veh_2", client_id: "cli_2", marque: "Peugeot", modele: "208", annee: 2021, immatriculation: "CD-456-EF" },
  { id: "veh_3", client_id: "cli_3", marque: "Citroën", modele: "C3", annee: 2020, immatriculation: "EF-789-GH" },
  { id: "veh_4", client_id: "cli_4", marque: "Dacia", modele: "Sandero", annee: 2018, immatriculation: "GH-012-IJ" },
  { id: "veh_5", client_id: "cli_5", marque: "Toyota", modele: "Yaris", annee: 2022, immatriculation: "IJ-345-KL" },
];

// Table: propositions_rdv (garage_id, client_id, vehicule_id) — en attente de validation garage
const propositionsRdvTable = [
  {
    id: "prop_1", garage_id: "garage_1", client_id: "cli_1", vehicule_id: "veh_1",
    prestation: "Diagnostic panne", categorie: "diagnostic",
    jour: "Vendredi 14 août", creneau: "09:00 - 10:00", duree_min: 60,
    source: "gmail", message: "Bruit anormal au freinage depuis 2 jours, client disponible toute la matinée.",
  },
  {
    id: "prop_2", garage_id: "garage_1", client_id: "cli_2", vehicule_id: "veh_2",
    prestation: "Révision complète", categorie: "entretien",
    jour: "Vendredi 14 août", creneau: "14:00 - 15:30", duree_min: 90,
    source: "site", message: "Révision des 30 000 km, souhaite un devis avant intervention.",
  },
];

// Table: rendez_vous (garage_id, client_id, vehicule_id) — confirmés, alimente l'agenda
const rendezVousTable = [
  { id: "rdv_1", garage_id: "garage_1", client_id: "cli_5", vehicule_id: "veh_5", jour: "lundi", debut: "08:00", fin: "09:00", prestation: "Vidange", categorie: "entretien", statut: "Confirmé", source: "gmail" },
  { id: "rdv_2", garage_id: "garage_1", client_id: "cli_1", vehicule_id: "veh_1", jour: "vendredi", debut: "09:00", fin: "10:00", prestation: "Diagnostic panne", categorie: "diagnostic", statut: "Confirmé", source: "gmail" },
  { id: "rdv_3", garage_id: "garage_1", client_id: "cli_3", vehicule_id: "veh_3", jour: "vendredi", debut: "10:30", fin: "11:30", prestation: "Contrôle technique", categorie: "entretien", statut: "Confirmé", source: "site" },
  { id: "rdv_4", garage_id: "garage_1", client_id: "cli_2", vehicule_id: "veh_2", jour: "vendredi", debut: "14:00", fin: "15:30", prestation: "Révision complète", categorie: "entretien", statut: "En attente", source: "site" },
  { id: "rdv_5", garage_id: "garage_1", client_id: "cli_4", vehicule_id: "veh_4", jour: "vendredi", debut: "16:00", fin: "17:00", prestation: "Changement pneus", categorie: "reparation", statut: "Confirmé", source: "telephone_ia" },
  { id: "rdv_6", garage_id: "garage_1", client_id: "cli_4", vehicule_id: "veh_4", jour: "mardi", debut: "10:00", fin: "11:00", prestation: "Freins", categorie: "reparation", statut: "Confirmé", source: "gmail" },
  { id: "rdv_7", garage_id: "garage_1", client_id: "cli_3", vehicule_id: "veh_3", jour: "mercredi", debut: "09:00", fin: "10:00", prestation: "Vidange", categorie: "entretien", statut: "Terminé", source: "whatsapp" },
  { id: "rdv_8", garage_id: "garage_1", client_id: "cli_5", vehicule_id: "veh_5", jour: "jeudi", debut: "15:00", fin: "16:00", prestation: "Panne moteur", categorie: "urgence", statut: "Confirmé", source: "telephone_ia" },
];

// Table: demandes (garage_id, client_id) — flux entrant brut, multi-canal
const demandesTable = [
  { id: "dem_1", client_id: "cli_1", vehicule_id: "veh_1", motif: "Bruit freinage", prestation: "Diagnostic panne", statut: "Nouveau", date: "13/08", date_souhaitee: "14/08", urgence: "Moyenne", source: "gmail" },
  { id: "dem_2", client_id: "cli_2", vehicule_id: "veh_2", motif: "Entretien", prestation: "Révision complète", statut: "Traité", date: "12/08", date_souhaitee: "14/08", urgence: "Faible", source: "site" },
  { id: "dem_3", client_id: "cli_3", vehicule_id: "veh_3", motif: "CT à jour", prestation: "Contrôle technique", statut: "Traité", date: "11/08", date_souhaitee: "14/08", urgence: "Faible", source: "gmail" },
  { id: "dem_4", client_id: "cli_4", vehicule_id: "veh_4", motif: "Pneus usés", prestation: "Changement pneus", statut: "Nouveau", date: "13/08", date_souhaitee: "16/08", urgence: "Moyenne", source: "telephone_ia" },
  { id: "dem_5", client_id: "cli_5", vehicule_id: "veh_5", motif: "Voyant moteur", prestation: "Diagnostic panne", statut: "En attente", date: "13/08", date_souhaitee: "13/08", urgence: "Élevée", source: "whatsapp" },
];

// Historique de prestations réalisées (dérivé d'une jointure rendez_vous passés) — enrichi statut + notes
const historiqueTable = [
  { client_id: "cli_1", prestation: "Vidange", date: "02/03/2026", statut: "Terminé", note: "" },
  { client_id: "cli_1", prestation: "Diagnostic panne", date: "14/08/2026", statut: "Confirmé", note: "" },
  { client_id: "cli_2", prestation: "Pneus", date: "10/01/2026", statut: "Terminé", note: "" },
  { client_id: "cli_3", prestation: "Contrôle technique", date: "11/08/2026", statut: "Terminé", note: "" },
  { client_id: "cli_4", prestation: "Vidange", date: "05/11/2025", statut: "Terminé", note: "Pression pneus arrière contrôlée." },
];

// Notes internes garage sur un client
const notesGarageTable = [
  { client_id: "cli_1", note: "Cliente fidèle, préfère les créneaux du matin." },
  { client_id: "cli_4", note: "Toujours vérifier la pression des pneus arrière, historique de sous-gonflage." },
];

// Table (future): actions_ia — timeline du centre de contrôle Nexora
const timelineTable = [
  { heure: "10:32", type: "reception", texte: "Nouvelle demande Gmail reçue — Sophie Durand" },
  { heure: "10:33", type: "analyse", texte: "Demande analysée automatiquement — Diagnostic panne détecté" },
  { heure: "10:34", type: "proposition", texte: "Créneau proposé au garage — Vendredi 09:00" },
  { heure: "10:35", type: "confirmation", texte: "Rendez-vous confirmé et envoyé au client" },
];
const TIMELINE_ICON = {
  reception: { icon: Mail, color: "#B91C1C" },
  analyse: { icon: Bot, color: "#6D28D9" },
  proposition: { icon: CalendarClock, color: "#B45309" },
  confirmation: { icon: CheckCircle2, color: "#15803D" },
};

// Table (future): prestations — catalogue garage, utilisé en page Paramètres
const prestationsCatalogue = [
  { nom: "Vidange", categorie: "entretien", duree_min: 45 },
  { nom: "Révision complète", categorie: "entretien", duree_min: 90 },
  { nom: "Contrôle technique", categorie: "entretien", duree_min: 30 },
  { nom: "Diagnostic panne", categorie: "diagnostic", duree_min: 60 },
  { nom: "Changement pneus", categorie: "reparation", duree_min: 45 },
  { nom: "Freins", categorie: "reparation", duree_min: 75 },
  { nom: "Urgence dépannage", categorie: "urgence", duree_min: 60 },
];

// Stat du jour pour Nexora Intelligence — proviendra d'une table logs_assistant plus tard
const aiStatsToday = {
  emailsAnalyses: 12,
  demandesDetectees: 8,
  creneauxCalcules: 5,
  propositionsEnvoyees: 3,
  rdvConfirmes: 2,
  tempsEconomiseMin: 135,
  tarifHoraireAdmin: 38,
};

// "Joins" côté front — à remplacer par des requêtes Supabase (.select('*, clients(*), vehicules(*)'))
const getClient = (id) => clientsTable.find((c) => c.id === id);
const getVehicule = (id) => vehiculesTable.find((v) => v.id === id);
const getVehiculeByClient = (clientId) => vehiculesTable.find((v) => v.client_id === clientId);
const getHistorique = (clientId) => historiqueTable.filter((h) => h.client_id === clientId);
const getNotes = (clientId) => notesGarageTable.filter((n) => n.client_id === clientId);
const getDerniereVisite = (clientId) => {
  const h = getHistorique(clientId);
  if (h.length === 0) return null;
  return h[h.length - 1].date;
};

const navItems = [
  { key: "dashboard", label: "Dashboard", icon: Home },
  { key: "agenda", label: "Agenda", icon: Calendar },
  { key: "valider", label: "Rendez-vous à valider", icon: Clock },
  { key: "demandes", label: "Demandes clients", icon: Inbox },
  { key: "clients", label: "Clients", icon: Users },
  { key: "parametres", label: "Paramètres", icon: Settings },
];

const joursSemaine = [
  "lundi",
  "mardi",
  "mercredi",
  "jeudi",
  "vendredi"
];

const joursLabel = {
  lundi: "Lun",
  mardi: "Mar",
  mercredi: "Mer",
  jeudi: "Jeu",
  vendredi: "Ven",
};
const heuresGrille = ["08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00"];

const durationRows = (debut, fin) => {
  const [h1, m1] = debut.split(":").map(Number);
  const [h2, m2] = fin.split(":").map(Number);
  return Math.max(1, ((h2 * 60 + m2) - (h1 * 60 + m1)) / 30);
};

// =====================================================================================
// BUILDING BLOCKS
// =====================================================================================
function Logo() {
  return (
    <div className="flex items-center gap-2.5 px-1">
      <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: ACCENT }}>
        <Gauge size={18} color="#fff" strokeWidth={2.2} />
      </div>
      <div className="leading-tight">
        <div className="text-white font-semibold text-[15px] tracking-tight">Nexora</div>
        <div className="text-[11px]" style={{ color: "#8CA0C9" }}>Solutions</div>
      </div>
    </div>
  );
}

function StatCard({ label, value, icon: Icon }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 flex items-start justify-between shadow-sm">
      <div>
        <div className="text-slate-500 text-[13px] font-medium">{label}</div>
        <div className="text-2xl font-semibold text-slate-900 mt-1.5">{value}</div>
      </div>
      <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: ACCENT_SOFT }}>
        <Icon size={18} color={ACCENT} strokeWidth={2} />
      </div>
    </div>
  );
}

function Badge({ children, tone = "amber" }) {
  const tones = {
    amber: { bg: "#FEF3E2", text: "#B45309" },
    green: { bg: "#E7F6EC", text: "#15803D" },
    slate: { bg: "#F1F5F9", text: "#475569" },
    red: { bg: "#FDECEC", text: "#B91C1C" },
  };
  const t = tones[tone];
  return (
    <span className="text-[11.5px] font-medium px-2.5 py-1 rounded-full inline-block" style={{ backgroundColor: t.bg, color: t.text }}>
      {children}
    </span>
  );
}

function SourceBadge({ source }) {
  const meta = SOURCE_META[source];
  if (!meta) return null;
  const Icon = meta.icon;
  return (
    <span className="text-[11.5px] font-medium px-2.5 py-1 rounded-full inline-flex items-center gap-1.5" style={{ backgroundColor: meta.bg, color: meta.text }}>
      <Icon size={11} /> {meta.label}
    </span>
  );
}

function EmptyState({ icon: Icon, title, subtitle }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center shadow-sm">
      <div className="w-11 h-11 rounded-xl flex items-center justify-center mx-auto mb-3" style={{ backgroundColor: ACCENT_SOFT }}>
        <Icon size={19} color={ACCENT} />
      </div>
      <div className="text-slate-900 font-medium text-sm">{title}</div>
      {subtitle && <div className="text-slate-500 text-[13px] mt-1">{subtitle}</div>}
    </div>
  );
}

function SkeletonCard({ h = "h-24" }) {
  return <div className={`bg-white rounded-2xl border border-slate-200 shadow-sm ${h} animate-pulse`} />;
}

function Toast({ toast }) {
  if (!toast?.message) return null;
  const isError = toast.tone === "error";
  return (
    <div
      className="fixed bottom-6 right-6 text-white text-sm px-4 py-3 rounded-xl shadow-lg z-50 flex items-center gap-2"
      style={{ backgroundColor: isError ? "#B91C1C" : "#0F1B33" }}
    >
      <CheckCircle2 size={15} color={isError ? "#fff" : "#8FB0FF"} />
      {toast.message}
    </div>
  );
}

function Toggle({ checked }) {
  return (
    <div className="w-10 h-5.5 h-6 rounded-full flex items-center px-0.5 shrink-0" style={{ backgroundColor: checked ? ACCENT : "#E2E8F0" }}>
      <div className="w-4.5 h-4.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform" style={{ transform: checked ? "translateX(16px)" : "translateX(0)" }} />
    </div>
  );
}

function GarageIdentityCard() {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex flex-col sm:flex-row sm:items-center gap-5">
      <div className="w-16 h-16 rounded-2xl flex items-center justify-center shrink-0 border-2 border-dashed" style={{ borderColor: "#CBD5E1", backgroundColor: "#F8FAFC" }} title="Emplacement du logo du garage">
        <Wrench size={22} className="text-slate-400" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="text-lg font-semibold text-slate-900">{garage.nom}</div>
          <Badge tone={garage.ouvert_aujourdhui ? "green" : "red"}>
            {garage.ouvert_aujourdhui ? "🟢 Ouvert aujourd'hui" : "🔴 Fermé aujourd'hui"}
          </Badge>
        </div>
        <div className="flex items-center gap-4 mt-1.5 flex-wrap">
          <span className="flex items-center gap-1.5 text-[13px] text-slate-500"><MapPin size={13} /> {garage.ville}</span>
          <span className="flex items-center gap-1.5 text-[13px] text-slate-500"><Clock size={13} /> {garage.horaire_ouverture}–{garage.horaire_fermeture}</span>
          <span className="flex items-center gap-1.5 text-[13px] text-slate-500"><Users size={13} /> {garage.nb_mecaniciens} mécaniciens disponibles</span>
        </div>
      </div>
    </div>
  );
}

// Centre de contrôle Nexora IA — carte ROI + timeline des actions automatisées
function NexoraControlCenter() {
  const heures = Math.floor(aiStatsToday.tempsEconomiseMin / 60);
  const minutes = aiStatsToday.tempsEconomiseMin % 60;
  const valeurRecuperee = Math.round((aiStatsToday.tempsEconomiseMin / 60) * aiStatsToday.tarifHoraireAdmin);
  const rows = [
    { label: "Emails analysés", value: aiStatsToday.emailsAnalyses },
    { label: "Demandes clients détectées", value: aiStatsToday.demandesDetectees },
    { label: "Créneaux calculés", value: aiStatsToday.creneauxCalcules },
    { label: "Propositions envoyées", value: aiStatsToday.propositionsEnvoyees },
    { label: "Rendez-vous confirmés", value: aiStatsToday.rdvConfirmes },
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
      <div className="lg:col-span-2 rounded-2xl shadow-sm p-5 text-white relative overflow-hidden" style={{ backgroundColor: NAVY }}>
        <div className="absolute -right-6 -top-6 w-28 h-28 rounded-full opacity-10" style={{ backgroundColor: ACCENT }} />
        <div className="flex items-center gap-2 relative">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ backgroundColor: "rgba(61,107,224,0.25)" }}>
            <Bot size={16} color="#8FB0FF" />
          </div>
          <div className="font-semibold text-[15px]">Nexora Intelligence</div>
        </div>
        <div className="text-[12.5px] mt-1" style={{ color: "#8CA0C9" }}>Aujourd'hui</div>

        <div className="mt-4 space-y-2.5 relative">
          {rows.map((r) => (
            <div key={r.label} className="flex items-center justify-between text-[13.5px]">
              <span style={{ color: "#C3D0EA" }}>{r.label}</span>
              <span className="font-semibold">{r.value}</span>
            </div>
          ))}
        </div>

        <div className="mt-4 pt-4 border-t space-y-2" style={{ borderColor: "#22335C" }}>
          <div className="flex items-center gap-2 text-[13.5px]">
            <Sparkles size={14} color="#8FB0FF" />
            <span className="font-semibold">{heures}h{minutes ? minutes : ""}</span>
            <span style={{ color: "#C3D0EA" }}>de temps administratif économisé</span>
          </div>
          <div className="flex items-center gap-2 text-[13.5px]">
            <TrendingUp size={14} color="#8FB0FF" />
            <span className="font-semibold">{valeurRecuperee}€</span>
            <span style={{ color: "#C3D0EA" }}>de valeur administrative récupérée</span>
          </div>
        </div>
      </div>

      <div className="lg:col-span-3 bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
        <div className="font-semibold text-slate-900 text-[15px] mb-4">Activité automatisée en direct</div>
        <div className="space-y-0">
          {timelineTable.map((t, i) => {
            const meta = TIMELINE_ICON[t.type];
            const Icon = meta.icon;
            const isLast = i === timelineTable.length - 1;
            return (
              <div key={i} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${meta.color}1A` }}>
                    <Icon size={13} color={meta.color} />
                  </div>
                  {!isLast && <div className="w-px flex-1 my-1" style={{ backgroundColor: "#E2E8F0" }} />}
                </div>
                <div className="pb-4">
                  <div className="text-[12px] text-slate-400 font-medium">{t.heure}</div>
                  <div className="text-[13.5px] text-slate-700 mt-0.5">{t.texte}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ApptDetailModal({ appt, onClose }) {
  if (!appt) return null;

  const client = appt.client;
  const vehicule = appt.vehicule;
  const colors = catColor(appt.categorie);
  return (
    <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge tone={STATUT_TONE[appt.statut] || "slate"}>{appt.statut}</Badge>
            <SourceBadge source={appt.source} />
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
        </div>
        <div className="text-lg font-semibold text-slate-900 mt-3">{client}</div>
        <div className="mt-4 space-y-2.5">
          <div className="flex items-center gap-2 text-sm text-slate-700"><Car size={15} className="text-slate-400" /> {vehicule} · {appt.immatriculation}</div>
          <div className="flex items-center gap-2 text-sm text-slate-700"><Clock size={15} className="text-slate-400" /> {appt.debut} – {appt.fin}</div>
          <div className="flex items-center gap-2 text-sm">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: colors.bar }} />
            <span style={{ color: colors.text }} className="font-medium">{appt.prestation}</span>
            <span className="text-slate-400">· {colors.label}</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-slate-700">
          <Phone size={15} className="text-slate-400" /> {formatPhone(appt.telephone)}
          </div>
        </div>
      </div>
    </div>
  );
}

// =====================================================================================
// VIEWS
// =====================================================================================
function DashboardView({ stats, propositions, setView, onSelectAppt, loading, rendezVous }) {
  const upcomingAppts = [...rendezVous]
  .sort(
    (a, b) =>
      new Date(a.date_debut) - new Date(b.date_debut)
  );

console.log("UPCOMING APPTS :", upcomingAppts);
  const todayCount = upcomingAppts.filter(
  (r) => new Date(r.date_debut).toLocaleDateString("fr-FR") === new Date().toLocaleDateString("fr-FR")
).length;
  if (loading) {
    return (
      <div className="space-y-6">
        <SkeletonCard h="h-24" />
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          <SkeletonCard h="h-56" />
          <div className="lg:col-span-3"><SkeletonCard h="h-56" /></div>
        </div>
        <SkeletonCard h="h-40" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <GarageIdentityCard />

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <StatCard label="Demandes en attente" value={stats.pending} icon={Inbox} />
        <StatCard label="RDV à valider" value={stats.toValidate} icon={Clock} />
        <StatCard label="RDV aujourd'hui" value={todayCount} icon={Calendar} />
        <StatCard label="Clients" value={stats.clients} icon={Users} />
      </div>

      <NexoraControlCenter />

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="font-semibold text-slate-900 text-[15px]">Rendez-vous à valider</div>
          <button onClick={() => setView("valider")} className="text-[13px] font-medium flex items-center gap-1" style={{ color: ACCENT }}>
            Voir tout <ChevronRight size={14} />
          </button>
        </div>
        {propositions.length === 0 ? (
          <div className="px-5 py-8 text-center text-slate-400 text-[13px]">Aucune proposition en attente pour le moment.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {propositions.slice(0, 2).map((p) => {
              const client = getClient(p.client_id);
              const vehicule = getVehicule(p.vehicule_id);
              return (
                <div key={p.id} className="px-5 py-4 flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <div className="text-sm font-medium text-slate-900">{p.client} — {p.vehicule}</div>
                      <SourceBadge source={p.source} />
                    </div>
                    <div className="text-[13px] text-slate-500 mt-0.5">{p.prestation} · {p.jour}, {p.debut} - {p.fin}</div>
                    <div className="text-[13px] text-slate-500 mt-2">
                    {p.message}
                    </div>
                  </div>
                  <Badge tone="amber">En attente</Badge>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
        <div className="px-5 py-4 border-b border-slate-100 font-semibold text-slate-900 text-[15px]">Agenda du jour</div>
        <div className="divide-y divide-slate-100">
          {rendezVous.slice(0, 4).map((a) => {
            const colors = catColor(a.categorie);
            return (
              <button key={a.id} onClick={() => onSelectAppt(a)} className="w-full px-5 py-3.5 flex items-center gap-4 hover:bg-slate-50/70 text-left">
               <div className="text-[13px] font-medium text-slate-500 w-24 shrink-0">
              {a.debut} - {a.fin}
              </div>

              <span 
             className="w-2 h-2 rounded-full shrink-0" 
             style={{ backgroundColor: colors.bar }} 
              />

              <div className="text-sm text-slate-800">
              {a.vehicule}
              </div>
              <div className="text-sm text-slate-500">
                {a.client}
              </div>

              <div className="text-[13px] text-slate-400">
                ·
              </div>

              <div className="text-sm text-slate-500">
                {a.prestation}
              </div>

              <Badge tone={STATUT_TONE[a.statut] || "slate"}>
                {a.statut}
              </Badge>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ValiderView({ propositions, onAccept, onRefuse }) {
  if (propositions.length === 0) {
    return <EmptyState icon={Check} title="Aucun rendez-vous en attente" subtitle="Nexora vous préviendra dès qu'une nouvelle proposition arrive." />;
  }
  return (
    <div className="space-y-4">
      {propositions.map((p) => {
        return (
          <div key={p.id} className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
            <div className="flex items-start justify-between flex-wrap gap-2">
              <div>
                <div className="flex items-center gap-2.5 flex-wrap">
                  <div className="font-semibold text-slate-900 text-[15px]">{p.client}</div>
                  <Badge tone="amber">En attente de validation</Badge>
                  <SourceBadge source={p.source} />
                </div>
                <div className="text-[13px] text-slate-500 mt-1">{formatPhone(p.telephone)}</div>
              </div>
              <div className="text-right">
                <div className="text-sm font-medium text-slate-900">{p.jour}</div>
                <div className="text-[13px] text-slate-500">{p.debut} - {p.fin} · {p.duree} min</div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
              <div className="flex items-center gap-2 text-sm text-slate-700"><Car size={15} className="text-slate-400" /> {p.vehicule} · {p.immatriculation}</div>
              <div className="text-sm text-slate-700 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: catColor(p.categorie).bar }} /> {p.prestation}
              </div>
            </div>

            <div className="mt-3 bg-slate-50 rounded-xl p-3 flex gap-2 items-start">
              <MessageSquare size={14} className="text-slate-400 mt-0.5 shrink-0" />
              <div className="text-[13px] text-slate-600 whitespace-pre-line">
                {p.message}
              </div>
            </div>
            <div className="flex gap-2.5 mt-4">
              {/* Accepter -> webhook n8n : validation proposition_rdv -> création rendez_vous -> confirmation client -> sync Google Calendar */}
              <button onClick={() => onAccept(p.id)} className="flex items-center gap-1.5 text-sm font-medium text-white px-4 py-2 rounded-xl" style={{ backgroundColor: "#16A34A" }}>
                <Check size={15} /> Accepter
              </button>
              {/* Refuser -> webhook n8n : message garage -> nouvelle proposition envoyée au client */}
              <button onClick={() => onRefuse(p.id)} className="flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-xl border border-slate-200 text-slate-600">
                <X size={15} /> Refuser
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AgendaView({ onSelectAppt, rendezVous }) {
  const [mode, setMode] = useState("jour");

const [currentDate, setCurrentDate] = useState(new Date());
const changeDate = (direction) => {
  setCurrentDate((prev) => {
    const date = new Date(prev);

    if (mode === "jour") {
      date.setDate(date.getDate() + direction);
    }

    if (mode === "semaine") {
      date.setDate(date.getDate() + (direction * 7));
    }

    return date;
  });
};

const dayKey = currentDate.toLocaleDateString("fr-FR", {
  weekday: "long",
});

const dayAppts = rendezVous.filter((r) => r.jour === dayKey);
const startOfWeek = new Date(currentDate);
startOfWeek.setDate(currentDate.getDate() - currentDate.getDay() + 1);
const endOfWeek = new Date(startOfWeek);
endOfWeek.setDate(startOfWeek.getDate() + 6);

const weekDays = Array.from({ length: 7 }, (_, index) => {
  const date = new Date(startOfWeek);
  date.setDate(startOfWeek.getDate() + index);

  return {
    key: date.toISOString().split("T")[0],
    date,
    label: date.toLocaleDateString("fr-FR", {
      weekday: "short",
      day: "numeric",
    }),
  };
});

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <button 
          onClick={() => changeDate(-1)} className="p-1.5 rounded-lg border border-slate-200 text-slate-500"><ChevronLeft size={16} /></button>
          <div className="w-[260px] text-center font-semibold text-slate-900 text-[15px] capitalize">
{mode === "jour"
  ? currentDate.toLocaleDateString("fr-FR", {
      weekday: "long",
      day: "numeric",
      month: "long",
    })
  : `Semaine du ${startOfWeek.toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "long",
    })} au ${endOfWeek.toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "long",
    })}`
}
          </div>
          <button 
         onClick={() => changeDate(1)} className="p-1.5 rounded-lg border border-slate-200 text-slate-500"><ChevronRight size={16} /></button>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-xl border border-slate-200 overflow-hidden text-[13px]">
            {["jour", "semaine"].map((m) => (
              <button key={m} onClick={() => setMode(m)} className="px-3.5 py-1.5 font-medium capitalize" style={mode === m ? { backgroundColor: ACCENT, color: "#fff" } : { backgroundColor: "#fff", color: "#64748B" }}>
                {m}
              </button>
            ))}
          </div>
          {/* Préparé pour une future synchronisation bidirectionnelle Google Calendar */}
          <button className="flex items-center gap-1.5 text-[13px] font-medium text-white px-3.5 py-1.5 rounded-xl" style={{ backgroundColor: ACCENT }}>
            <CalendarPlus size={14} /> Ajouter un rendez-vous
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 px-5 py-3 border-b border-slate-100">
        {Object.values(CATEGORY_COLORS).map((c) => (
          <div key={c.label} className="flex items-center gap-1.5 text-[12px] text-slate-500">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: c.bar }} /> {c.label}
          </div>
        ))}
      </div>

      {mode === "jour" ? (
        <div className="grid" style={{ gridTemplateColumns: "70px 1fr" }}>
          {heuresGrille.map((h) => {
            const slotAppts = dayAppts.filter((a) => a.debut === h);
            return (
              <React.Fragment key={h}>
                <div className="text-[12px] text-slate-400 px-3 py-3 border-t border-slate-100">{h}</div>
                <div className="border-t border-l border-slate-100 py-1.5 px-2 min-h-[52px] relative">
                  {slotAppts.length === 0 && (
                    <div className="text-[11.5px] text-slate-300 px-1 py-1.5">Créneau disponible</div>
                  )}
                  {slotAppts.map((a) => {
                    const c = catColor(a.categorie);
                    const vehicule = a.vehicule;
                    const client = a.client;
                    const rows = durationRows(a.debut, a.fin);
                    return (
                      <button key={a.id} onClick={() => onSelectAppt(a)} className="text-left rounded-lg px-3 py-2 w-full mb-1" style={{ backgroundColor: c.bg, borderLeft: `3px solid ${c.bar}`, minHeight: `${rows * 40}px` }}>
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-[13px] font-medium" style={{ color: c.text }}>{client} — {vehicule}</div>
                          <Badge tone={STATUT_TONE[a.statut] || "slate"}>{a.statut}</Badge>
                        </div>
                        <div className="text-[12px] text-slate-500">{a.prestation} · {a.debut}-{a.fin} · {rows * 30} min</div>
                      </button>
                    );
                  })}
                </div>
              </React.Fragment>
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-5 divide-x divide-slate-100">
          {weekDays.map((day) => {
            const appts = rendezVous.filter(
  (a) => a.jour === day.key
);
            return (
              <div key={day.key}>
                <div className="text-[12.5px] font-medium text-slate-600 text-center py-2.5 border-b border-slate-100 capitalize">{day.label}</div>
                <div className="p-2 space-y-1.5 min-h-[320px]">
                  {appts.length === 0 && <div className="text-[11.5px] text-slate-300 text-center pt-4">Aucun RDV</div>}
                  {appts.map((a) => {
                    const c = catColor(a.categorie);
                    const vehicule = getVehicule(a.vehicule_id);
                    return (
                      <button key={a.id} onClick={() => onSelectAppt(a)} className="w-full text-left rounded-lg px-2.5 py-2" style={{ backgroundColor: c.bg, borderLeft: `3px solid ${c.bar}` }}>
                        <div className="text-[11.5px] font-medium" style={{ color: c.text }}>{a.debut} · {a.vehicule}</div>
                        <div className="text-[11px] text-slate-500 truncate">{a.prestation}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function DemandesView({ demandes, onSelectDemande }) {
  const statutTone = (s) => {
  if (s === "nouveau") return "amber";
  if (s === "rendez_vous_confirme") return "green";
  return "slate";
};


const statutLabel = (s) => {
  if (s === "nouveau") return "Nouveau";
  if (s === "rendez_vous_confirme") return "Rendez-vous confirmé";
  return s;
};
  if (demandes.length === 0) {
    return <EmptyState icon={Inbox} title="Aucune demande pour le moment" subtitle="Les nouvelles demandes clients apparaîtront ici automatiquement." />;
  }
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
      <table className="w-full text-sm min-w-[820px]">
        <thead>
          <tr className="bg-slate-50 text-slate-500 text-[12.5px] text-left">
            {["Client", "Véhicule", "Motif", "Source", "Urgence", "Date souhaitée", "Statut", "Action"].map((h) => (
              <th key={h} className="px-5 py-3 font-medium">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {demandes.map((d) => {
  return (
    <tr key={d.id} className="hover:bg-slate-50/60">

      <td className="px-5 py-3.5 font-medium text-slate-900">
        {d.clients?.nom || "Client inconnu"}
      </td>

      <td className="px-5 py-3.5 text-slate-600">
        {d.vehicules
          ? `${d.vehicules.marque} ${d.vehicules.modele}`
          : ""}
      </td>

      <td className="px-5 py-3.5 text-slate-600">
        {d.message_original
          ?.split("Demande :")
          ?.pop()
          ?.trim() || d.type_demande}
      </td>

      <td className="px-5 py-3.5">
        <SourceBadge source={d.source} />
      </td>

      <td className="px-5 py-3.5">
        <Badge tone={URGENCE_TONE[d.urgence]}>
          {d.urgence || "-"}
        </Badge>
      </td>

      <td className="px-5 py-3.5 text-slate-500">
        {new Date(d.created_at).toLocaleDateString("fr-FR")}
      </td>

      <td className="px-5 py-3.5">
  <Badge tone={statutTone(d.statut)}>
    {statutLabel(d.statut)}
  </Badge>
</td>

<td className="px-5 py-3.5">
  {d.statut === "nouveau" && (
    <button
      className="text-sm font-medium text-white px-3 py-2 rounded-xl"
      style={{ backgroundColor: "#3D6BE0" }}
      onClick={() => setSelectedDemande(d)}
    >
      Proposer un RDV
    </button>
  )}
</td>

</tr>
  );
})}
        </tbody>
      </table>
    </div>
  );
}

function ClientsView() {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(clientsTable[0].id);
  const filtered = clientsTable.filter((c) => c.nom.toLowerCase().includes(query.toLowerCase()));
  const selected = getClient(selectedId);
  const vehicule = getVehiculeByClient(selectedId);
  const historique = getHistorique(selectedId);
  const notes = getNotes(selectedId);
  const derniereVisite = getDerniereVisite(selectedId);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
      <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-3 border-b border-slate-100">
          <div className="flex items-center gap-2 bg-slate-50 rounded-xl px-3 py-2">
            <Search size={15} className="text-slate-400" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher un client..." className="bg-transparent text-sm outline-none w-full placeholder:text-slate-400" />
          </div>
        </div>
        {filtered.length === 0 ? (
          <div className="px-4 py-8 text-center text-slate-400 text-[13px]">Aucun client ne correspond à cette recherche.</div>
        ) : (
          <div className="divide-y divide-slate-100 max-h-[560px] overflow-y-auto">
            {filtered.map((c) => {
              const v = getVehiculeByClient(c.id);
              return (
                <button key={c.id} onClick={() => setSelectedId(c.id)} className="w-full text-left px-4 py-3 hover:bg-slate-50/70 flex items-center justify-between" style={selectedId === c.id ? { backgroundColor: ACCENT_SOFT } : {}}>
                  <div>
                    <div className="text-sm font-medium text-slate-900">{c.nom}</div>
                    <div className="text-[12.5px] text-slate-500">{v?.marque} {v?.modele}</div>
                  </div>
                  {c.fidele && <Star size={13} className="text-amber-400 fill-amber-400 shrink-0" />}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="lg:col-span-3 bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="text-lg font-semibold text-slate-900">{selected?.nom}</div>
          {selected?.fidele && <Badge tone="amber">⭐ Client fidèle</Badge>}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
          <Phone size={14} className="text-slate-400" /> {formatPhone(selected?.telephone)}
          <div className="flex items-center gap-2 text-sm text-slate-600"><Mail size={14} className="text-slate-400" /> {selected?.email}</div>
        </div>

        <div className="mt-6">
          <div className="text-[13px] font-medium text-slate-500 mb-2">Véhicule</div>
          <div className="bg-slate-50 rounded-xl p-3.5 flex items-center gap-3">
            <Car size={16} className="text-slate-400" />
            <div className="text-sm text-slate-800">{vehicule?.marque} {vehicule?.modele} ({vehicule?.annee}) · <span className="text-slate-500">{vehicule?.immatriculation}</span></div>
          </div>
        </div>

        <div className="mt-6">
          <div className="text-[13px] font-medium text-slate-500 mb-2">Informations garage</div>
          <div className="bg-slate-50 rounded-xl p-3.5 flex items-center justify-between text-sm">
            <span className="text-slate-600">Dernière visite</span>
            <span className="font-medium text-slate-800">{derniereVisite || "Aucune visite enregistrée"}</span>
          </div>
        </div>

        <div className="mt-6">
          <div className="text-[13px] font-medium text-slate-500 mb-2">Historique</div>
          <div className="space-y-2">
            {historique.length === 0 && <div className="text-[13px] text-slate-400">Aucune prestation antérieure enregistrée.</div>}
            {historique.map((h, i) => (
              <div key={i} className="bg-slate-50 rounded-xl px-3.5 py-2.5">
                <div className="flex items-center justify-between text-sm text-slate-700">
                  <span className="flex items-center gap-2"><Clock size={14} className="text-slate-400" /> {h.prestation}</span>
                  <div className="flex items-center gap-2">
                    <Badge tone={STATUT_TONE[h.statut] || "slate"}>{h.statut}</Badge>
                    <span className="text-slate-500 text-[13px]">{h.date}</span>
                  </div>
                </div>
                {h.note && <div className="text-[12.5px] text-slate-500 mt-1.5 pl-6">{h.note}</div>}
              </div>
            ))}
          </div>
        </div>

        <div className="mt-6">
          <div className="text-[13px] font-medium text-slate-500 mb-2">Notes internes</div>
          <div className="space-y-2">
            {notes.length === 0 && <div className="text-[13px] text-slate-400">Aucune note enregistrée pour ce client.</div>}
            {notes.map((n, i) => (
              <div key={i} className="flex items-start gap-2 bg-amber-50 rounded-xl px-3.5 py-2.5 text-sm text-amber-900">
                <StickyNote size={14} className="text-amber-500 mt-0.5 shrink-0" /> {n.note}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function SettingsSection({ title, children }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
      <div className="font-semibold text-slate-900 text-[14.5px] mb-4">{title}</div>
      {children}
    </div>
  );
}

function SettingsRow({ label, value, right }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-slate-100 last:border-0">
      <div className="text-sm text-slate-600">{label}</div>
      {right || <div className="text-sm font-medium text-slate-900">{value}</div>}
    </div>
  );
}

function ParametresView() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      <SettingsSection title="Informations garage">
        <SettingsRow label="Nom du garage" value={garage.nom} />
        <SettingsRow label="Ville" value={garage.ville} />
        <SettingsRow label="Mécaniciens" value={`${garage.nb_mecaniciens} disponibles`} />
        <SettingsRow label="Multi-garages" right={<Badge tone="slate">Bientôt disponible</Badge>} />
      </SettingsSection>

      <SettingsSection title="Horaires d'ouverture">
        <SettingsRow label="Lundi – Vendredi" value={`${garage.horaire_ouverture} – ${garage.horaire_fermeture}`} />
        <SettingsRow label="Samedi" value="09:00 – 12:00" />
        <SettingsRow label="Dimanche" value="Fermé" />
      </SettingsSection>

      <SettingsSection title="Prestations disponibles">
        <div className="space-y-2">
          {prestationsCatalogue.map((p) => (
            <div key={p.nom} className="flex items-center justify-between text-sm py-1.5">
              <span className="flex items-center gap-2 text-slate-700">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: catColor(p.categorie).bar }} /> {p.nom}
              </span>
              <span className="text-slate-500 text-[13px]">{p.duree} min</span>
            </div>
          ))}
        </div>
      </SettingsSection>

      <SettingsSection title="Connexions">
        <SettingsRow
          label="Boîte Gmail"
          right={<Badge tone={garage.gmail_connecte ? "green" : "slate"}>{garage.gmail_connecte ? "Connectée" : "Non connectée"}</Badge>}
        />
        <SettingsRow
          label="Google Agenda"
          right={<Badge tone={garage.google_agenda_connecte ? "green" : "slate"}>{garage.google_agenda_connecte ? "Connecté" : "Non connecté"}</Badge>}
        />
      </SettingsSection>

      <SettingsSection title="Notifications">
        <div className="flex items-center justify-between py-2.5 border-b border-slate-100">
          <div className="text-sm text-slate-600">Notifications par email</div>
          <Toggle checked={garage.notifications_email} />
        </div>
        <div className="flex items-center justify-between py-2.5">
          <div className="text-sm text-slate-600">Notifications par SMS</div>
          <Toggle checked={garage.notifications_sms} />
        </div>
      </SettingsSection>
    </div>
  );
}

// =====================================================================================
// APP SHELL
// =====================================================================================
export default function NexoraDashboard() {
  const [view, setView] = useState("dashboard");
  const [stats, setStats] = useState({
  pending: 0,
  toValidate: 0,
  today: 0,
  clients: 0
});
  const [propositions, setPropositions] = useState([]);
  const [toast, setToast] = useState(null);
  const [selectedAppt, setSelectedAppt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [rendezVous, setRendezVous] = useState([]);
  const [demandes, setDemandes] = useState([]);
  const [selectedDemande, setSelectedDemande] = useState(null);
 
  useEffect(() => {
  async function loadRendezVous() {
    const { data, error } = await supabase
  .from("rendez_vous")
  .select(`
  *,
  prestations (
    nom,
    categorie
  ),
  clients (
    nom,
    telephone,
    email
  ),
  vehicules (
    marque,
    modele,
    annee,
    immatriculation
  )
`)
  .eq(
    "garage_id",
    "bcd7f692-1c28-435c-87d1-92f84aa0e6bb"
  );

    if (error) {
      console.error("Erreur chargement RDV :", error);
      setLoading(false);
      return;
    }

    console.log("RDV Nexora :", data);

  const formattedRdv = (data || []).map((rdv) => {
  const debut = new Date(rdv.date_debut);
  const fin = new Date(rdv.date_fin);

  return {
    ...rdv,
    jour: debut.toLocaleDateString("fr-FR", { weekday: "long" }),
    debut: debut.toLocaleTimeString("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
    }),
    fin: fin.toLocaleTimeString("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
    }),
    prestation: rdv.prestations?.nom || "Prestation",
    client: rdv.clients?.nom || "Client inconnu",
    telephone: rdv.clients?.telephone || "",
    email: rdv.clients?.email || "",
    vehicule: `${rdv.vehicules?.marque || ""} ${rdv.vehicules?.modele || ""}`.trim(),
    immatriculation: rdv.vehicules?.immatriculation || "",
    categorie: rdv.prestations?.categorie || "",
  };
});

setRendezVous(formattedRdv);
setLoading(false);
  }

    loadRendezVous();
}, []);


useEffect(() => {

  async function loadDemandes() {

    const { data, error } = await supabase
      .from("demandes")
      .select(`
        *,
        clients (
          nom,
          telephone
        ),
        vehicules (
        marque,
        modele,
        annee
        )
     `)
      .eq(
        "garage_id",
        "bcd7f692-1c28-435c-87d1-92f84aa0e6bb"
      )
      .order("created_at", { ascending: false });


    if (error) {
      console.error(
        "Erreur chargement demandes :",
        error
      );
      return;
    }


    setDemandes(data || []);
    console.log(
  "DEMANDES CHARGEES :",
  JSON.stringify(data, null, 2)
);
  }


  loadDemandes();

}, []);


useEffect(() => {
  async function loadStats() {

    const today = new Date().toISOString().split("T")[0];

    const [
      clientsResult,
      propositionsResult,
      demandesResult,
      rdvTodayResult
    ] = await Promise.all([

      supabase
        .from("clients")
        .select("id", { count: "exact", head: true })
        .eq(
          "garage_id",
          "bcd7f692-1c28-435c-87d1-92f84aa0e6bb"
        ),

      supabase
        .from("propositions_rdv")
        .select("id", { count: "exact", head: true })
        .eq(
          "garage_id",
          "bcd7f692-1c28-435c-87d1-92f84aa0e6bb"
        )
        .eq("statut", "en_attente"),

      supabase
        .from("demandes")
        .select("id", { count: "exact", head: true })
        .eq(
          "garage_id",
          "bcd7f692-1c28-435c-87d1-92f84aa0e6bb"
        )
        .neq("statut", "rendez_vous_confirme"),

      supabase
        .from("rendez_vous")
        .select("id", { count: "exact", head: true })
        .eq(
          "garage_id",
          "bcd7f692-1c28-435c-87d1-92f84aa0e6bb"
        )
        .gte("date_debut", `${today}T00:00:00`)
        .lte("date_debut", `${today}T23:59:59`)
    ]);


    setStats({
      pending: demandesResult.count || 0,
      toValidate: propositionsResult.count || 0,
      today: rdvTodayResult.count || 0,
      clients: clientsResult.count || 0
    });

  }

  loadStats();

}, []);
  useEffect(() => {
  async function loadPropositions() {

    const { data, error } = await supabase
  .from("propositions_rdv")
  .select(`
  *,
  demandes (
    message_original
  )
`)
  .eq(
    "garage_id",
    "bcd7f692-1c28-435c-87d1-92f84aa0e6bb"
  )
  .eq("statut", "en_attente");


    if (error) {
 console.error(
   "Erreur chargement propositions :",
   JSON.stringify(error, null, 2)
 );
 return;
}


console.log(
  JSON.stringify(data, null, 2)
);
    console.log(
  "DEMANDE LIEE :",
  data?.[0]?.demandes
);

const formattedPropositions = await Promise.all(
  (data || []).map(async (p) => {

    const { data: client } = await supabase
      .from("clients")
      .select("*")
      .eq("id", p.client_id)
      .single();

    const { data: vehicule } = await supabase
      .from("vehicules")
      .select("*")
      .eq("id", p.vehicule_id)
      .single();
    const { data: demande } = await supabase
  .from("demandes")
  .select("message_original")
  .eq("id", p.demande_id)
  .single();

    const { data: prestation } = await supabase
      .from("prestations")
      .select("*")
      .eq("id", p.prestation_id)
      .single();


    const debut = new Date(p.date_debut_proposee);
    const fin = new Date(p.date_fin_proposee);


    return {
      ...p,

      client: client?.nom || "Client inconnu",

      telephone: client?.telephone || "",

      vehicule:
        `${vehicule?.marque || ""} ${vehicule?.modele || ""}`.trim(),

      immatriculation:
        vehicule?.immatriculation || "",

      annee:
        vehicule?.annee || "",

      prestation:
        prestation?.nom || "Prestation",

      
      message:
        demande?.message_original || "",


      jour:
        debut.toLocaleDateString("fr-FR", {
          weekday: "long",
        }),


      date:
        debut.toLocaleDateString("fr-FR"),


      debut:
        debut.toLocaleTimeString("fr-FR", {
          hour: "2-digit",
          minute: "2-digit",
        }),


      fin:
        fin.toLocaleTimeString("fr-FR", {
          hour: "2-digit",
          minute: "2-digit",
        }),


      duree:
        Math.round((fin - debut) / 60000),
    };
  })
);

console.log(
  "PROPOSITIONS FORMATEES :",
  formattedPropositions
);
console.log(
  "PREMIERE PROPOSITION JSON :",
  JSON.stringify(formattedPropositions[0], null, 2)
);

    console.log(
  "MESSAGE FINAL :",
  formattedPropositions?.[0]?.message
);
setPropositions(formattedPropositions);


  }

  loadPropositions();

}, []);
  const flashToast = (message, tone = "success") => {
    setToast({ message, tone });
    setTimeout(() => setToast(null), 2800);
  };

  // Remplacer par : fetch(N8N_WEBHOOK_URL + '/rdv-accepte', { method: 'POST', body: JSON.stringify({ proposition_id: id, garage_id: garage.id }) })
  const handleAccept = async (id) => {

  console.log("CLICK ACCEPTER ID :", id);

  const proposition = propositions.find(
    (p) => p.id === id
  );

  console.log("PROPOSITION ACCEPTEE :", proposition);

  if (!proposition) return;


// Vérifier qu'un rendez-vous n'existe pas déjà
const { data: existingRDV } = await supabase
  .from("rendez_vous")
  .select("id")
  .eq("demande_id", proposition.demande_id)
  .maybeSingle();


if (existingRDV) {
  console.log("RDV déjà existant :", existingRDV.id);
  flashToast("Ce rendez-vous existe déjà");
  return;
}



  // 1 - créer le rendez-vous réel
  const { error: insertError } = await supabase
  .from("rendez_vous")
  .insert({
    garage_id: proposition.garage_id,
    client_id: proposition.client_id,
    vehicule_id: proposition.vehicule_id,
    prestation_id: proposition.prestation_id,
    demande_id: proposition.demande_id,
    date_debut: proposition.date_debut_proposee,
    date_fin: proposition.date_fin_proposee,
    statut: "confirme",
    source: "nexora",
    notes: proposition.message || null,
  });


  if (insertError) {
  console.error(
    "Erreur création rendez-vous :",
    JSON.stringify(insertError, null, 2)
  );
  return;
}


    
  // 2 - valider la proposition seulement après création du RDV
  const { error: updateError } = await supabase
  .from("propositions_rdv")
  .update({
    statut: "accepte",
    date_validation: new Date().toISOString(),
  })
  .eq("id", id);


if (updateError) {
  console.error(
    "Erreur validation proposition :",
    JSON.stringify(updateError, null, 2)
  );
  return;
}

  // 3 - rafraîchir l'écran
  setPropositions((prev) =>
    prev.filter((p) => p.id !== id)
  );


  setStats((s) => ({
    ...s,
    toValidate: Math.max(0, s.toValidate - 1),
  }));


  flashToast(
    "Rendez-vous confirmé — le client a été notifié"
  );

};
  // Remplacer par : fetch(N8N_WEBHOOK_URL + '/rdv-refuse', { method: 'POST', body: JSON.stringify({ proposition_id: id, garage_id: garage.id }) })
  const handleRefuse = (id) => {
    setPropositions((prev) => prev.filter((p) => p.id !== id));
    setStats((s) => ({ ...s, toValidate: Math.max(0, s.toValidate - 1) }));
    flashToast("Rendez-vous refusé — une nouvelle proposition sera envoyée au client", "error");
  };

  const titles = {
    dashboard: "Dashboard",
    agenda: "Agenda",
    valider: "Rendez-vous à valider",
    demandes: "Demandes clients",
    clients: "Clients",
    parametres: "Paramètres",
  };

  return (
    <div className="flex min-h-[800px] w-full font-sans" style={{ backgroundColor: BG }}>
      <aside className="w-60 shrink-0 py-5 px-3.5 hidden md:flex flex-col" style={{ backgroundColor: NAVY }}>
        <Logo />
        <nav className="mt-8 flex flex-col gap-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = view === item.key;
            return (
              <button key={item.key} onClick={() => setView(item.key)} className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[13.5px] font-medium transition-colors" style={active ? { backgroundColor: NAVY_SOFT, color: "#fff" } : { color: "#93A4C7" }}>
                <Icon size={16} />
                {item.label}
              </button>
            );
          })}
        </nav>
        <div className="mt-auto pt-4 border-t" style={{ borderColor: "#22335C" }}>
          <div className="flex items-center gap-2.5 px-2 py-2">
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-[12.5px] font-semibold text-white shrink-0" style={{ backgroundColor: ACCENT }}>GD</div>
            <div className="leading-tight">
              <div className="text-[13px] font-medium text-white">{garage.nom}</div>
              <div className="text-[11.5px]" style={{ color: "#8CA0C9" }}>{garage.ville}</div>
            </div>
          </div>
        </div>
      </aside>

      <main className="flex-1 min-w-0">
        <div className="flex items-center justify-between px-5 md:px-8 py-5 border-b border-slate-200 bg-white">
          <div>
            <div className="text-lg font-semibold text-slate-900">{titles[view]}</div>
            <div className="text-[13px] text-slate-500">{garage.nom}</div>
          </div>
        </div>

        <div className="p-5 md:p-8">
          {view === "dashboard" && <DashboardView stats={stats} propositions={propositions} setView={setView} onSelectAppt={setSelectedAppt} loading={loading} rendezVous={rendezVous} />}
          {view === "valider" && <ValiderView propositions={propositions} onAccept={handleAccept} onRefuse={handleRefuse} />}
          {view === "agenda" && <AgendaView onSelectAppt={setSelectedAppt} rendezVous={rendezVous} />}
          {view === "demandes" && (
            <DemandesView
              demandes={demandes}
              onSelectDemande={setSelectedDemande}
            />
          )}
          {view === "clients" && <ClientsView />}
          {view === "parametres" && <ParametresView />}
        </div>
      </main>

      <Toast toast={toast} />
      <ApptDetailModal appt={selectedAppt} onClose={() => setSelectedAppt(null)} />
    </div>
  );
}
