
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
  BellRing,
  CircleDollarSign,
  ClipboardList,
  Send,
  Plus,
  Save,
  Pencil,
  Trash2,
  CalendarDays,
  CalendarRange,
  ArrowRight,
  ReceiptText,
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
let ACTIVE_GARAGE_ID = "bcd7f692-1c28-435c-87d1-92f84aa0e6bb";
const APP_TIME_ZONE = "Europe/Paris";
const WORKSHOP_STAGES = [
  { key: "a_venir", label: "À venir", color: "#64748B" },
  { key: "depose", label: "Véhicule déposé", color: "#3D6BE0" },
  { key: "diagnostic", label: "Diagnostic", color: "#7C3AED" },
  { key: "attente_client", label: "En attente client", color: "#D97706" },
  { key: "intervention", label: "En intervention", color: "#0F766E" },
  { key: "pret", label: "Prêt", color: "#16A34A" },
];
const WORKSHOP_RESOURCES = [
  { id: "mec_1", name: "Lucas Martin", role: "Mécanicien", color: "#3D6BE0" },
  { id: "mec_2", name: "Inès Robert", role: "Mécanicienne", color: "#7C3AED" },
  { id: "mec_3", name: "Thomas Leroy", role: "Mécanicien", color: "#0F766E" },
  { id: "pont_1", name: "Pont 1", role: "Pont", color: "#D97706" },
  { id: "pont_2", name: "Pont 2", role: "Pont", color: "#DC2626" },
];

const dateKey = (value) => {
  if (!value) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));
  const part = (type) => parts.find((item) => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
};
const timeLabel = (value) => new Intl.DateTimeFormat("fr-FR", {
  timeZone: APP_TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
}).format(new Date(value));
const dayLabel = (value) => new Intl.DateTimeFormat("fr-FR", {
  timeZone: APP_TIME_ZONE,
  weekday: "long",
}).format(new Date(value));
const cleanMotif = (value = "") => value.replace(/[.\s]+$/, "").trim();
const isToday = (value) => dateKey(value) === dateKey(new Date());
const dateTimeLabel = (value) => new Intl.DateTimeFormat("fr-FR", {
  timeZone: APP_TIME_ZONE,
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
}).format(new Date(value));

function getGarageOpenState(garageData) {
  const now = new Date();
  const localDay = new Intl.DateTimeFormat("en-US", { timeZone: APP_TIME_ZONE, weekday: "short" }).format(now);
  if (["Sat", "Sun"].includes(localDay)) return { open: false, label: "Fermé aujourd’hui" };
  const time = new Intl.DateTimeFormat("fr-FR", { timeZone: APP_TIME_ZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(now);
  const opening = garageData.horaire_ouverture || "08:00";
  const closing = garageData.horaire_fermeture || "18:00";
  const open = opening <= time && time < closing;
  return { open, label: open ? "Ouvert maintenant" : `Ouvre ${opening}–${closing}` };
}

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

const RDV_STATUS_LABEL = { confirme: "Confirmé", en_attente: "En attente", termine: "Terminé", annule: "Annulé" };
const STATUT_TONE = { "Confirmé": "green", "En attente": "amber", "Terminé": "slate", "Annulé": "red" };
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
  { key: "atelier", label: "Atelier en direct", icon: Wrench },
  { key: "agenda", label: "Agenda", icon: Calendar },
  { key: "valider", label: "Rendez-vous à valider", icon: Clock },
  { key: "devis", label: "Devis", icon: ReceiptText },
  { key: "factures", label: "Factures", icon: CircleDollarSign },
  { key: "demandes", label: "Demandes clients", icon: Inbox },
  { key: "clients", label: "Clients", icon: Users },
  { key: "verifier", label: "À vérifier", icon: AlertTriangle },
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
const findSuggestedSlot = (rendezVous, duration = 60) => {
  const candidate = new Date();
  candidate.setMinutes(0, 0, 0);
  for (let offset = 0; offset < 14; offset += 1) {
    const day = new Date(candidate);
    day.setDate(candidate.getDate() + offset);
    if ([0, 6].includes(day.getDay())) continue;
    for (let hour = 8; hour < 18; hour += 1) {
      const start = new Date(day);
      start.setHours(hour, 0, 0, 0);
      if (start <= new Date()) continue;
      const end = new Date(start.getTime() + duration * 60_000);
      const unavailable = rendezVous.some((rdv) => new Date(rdv.date_debut) < end && new Date(rdv.date_fin) > start);
      if (!unavailable) return { date: dateKey(start), time: timeLabel(start) };
    }
  }
  return { date: dateKey(candidate), time: "09:00" };
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

function GarageIdentityCard({ garageData = garage }) {
  const openState = getGarageOpenState(garageData);
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex flex-col sm:flex-row sm:items-center gap-5">
      <div className="w-16 h-16 rounded-2xl flex items-center justify-center shrink-0 border-2 border-dashed" style={{ borderColor: "#CBD5E1", backgroundColor: "#F8FAFC" }} title="Emplacement du logo du garage">
        <Wrench size={22} className="text-slate-400" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="text-lg font-semibold text-slate-900">{garageData.nom}</div>
          <Badge tone={openState.open ? "green" : "red"}>
            {openState.open ? "🟢 Ouvert maintenant" : "🔴 Fermé actuellement"}
          </Badge>
        </div>
        <div className="flex items-center gap-4 mt-1.5 flex-wrap">
          <span className="flex items-center gap-1.5 text-[13px] text-slate-500"><MapPin size={13} /> {garageData.ville}</span>
          <span className="flex items-center gap-1.5 text-[13px] text-slate-500"><Clock size={13} /> {garageData.horaire_ouverture}–{garageData.horaire_fermeture}</span>
          <span className="flex items-center gap-1.5 text-[13px] text-slate-500"><Users size={13} /> {garageData.nb_mecaniciens} mécaniciens disponibles · {openState.label}</span>
        </div>
      </div>
    </div>
  );
}

// Centre de contrôle Nexora IA — carte ROI + timeline des actions automatisées
function NexoraControlCenter({ aiStats = aiStatsToday, timeline = timelineTable }) {
  const heures = Math.floor(aiStats.tempsEconomiseMin / 60);
  const minutes = aiStats.tempsEconomiseMin % 60;
  const valeurRecuperee = Math.round((aiStats.tempsEconomiseMin / 60) * aiStats.tarifHoraireAdmin);
  const rows = [
    { label: "Demandes détectées", value: aiStats.demandesDetectees },
    { label: "Créneaux calculés", value: aiStats.creneauxCalcules },
    { label: "Propositions à traiter", value: aiStats.propositionsEnvoyees },
    { label: "Rendez-vous confirmés", value: aiStats.rdvConfirmes },
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
        <div className="text-[12.5px] mt-1" style={{ color: "#8CA0C9" }}>Données opérationnelles du jour</div>

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
        <div className="flex items-center justify-between mb-4"><div className="font-semibold text-slate-900 text-[15px]">Activité automatisée en direct</div><span className="flex items-center gap-1.5 text-[11px] font-medium text-emerald-700"><span className="w-2 h-2 rounded-full bg-emerald-500" />Synchronisé</span></div>
        <div className="space-y-0">
          {timeline.length === 0 ? <div className="py-8 text-center text-[13px] text-slate-400">L’activité n8n et Supabase apparaîtra ici en direct.</div> : timeline.map((t, i) => {
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

function WorkshopControlPanel({ rendezVous, demandes, clients, garageData, onNavigate }) {
  const now = new Date();
  const dayAppointments = rendezVous.filter((r) => isToday(r.date_debut));
  const urgent = demandes.filter((d) => d.urgence === "Élevée" && d.statut !== "rendez_vous_confirme").length;
  const overdue = rendezVous.filter((r) => new Date(r.date_fin) < now && !["Terminé", "Annulé"].includes(r.statut)).length;
  const imminent = dayAppointments.filter((r) => {
    const minutes = (new Date(r.date_debut) - now) / 60000;
    return minutes >= 0 && minutes <= 120;
  }).length;
  const toRecall = clients.filter((c) => c.fidele).length;
  const occupiedMinutes = dayAppointments.reduce((sum, r) => sum + Math.max(0, (new Date(r.date_fin) - new Date(r.date_debut)) / 60000), 0);
  const capacity = Math.max(1, (garageData.nb_mecaniciens || 1) * 9 * 60);
  const occupancy = Math.min(100, Math.round((occupiedMinutes / capacity) * 100));
  const cards = [
    { label: "Urgences à traiter", value: urgent, hint: urgent ? "À appeler en priorité" : "Aucune urgence", icon: AlertTriangle, tone: "#DC2626", target: "demandes" },
    { label: "Retards atelier", value: overdue, hint: overdue ? "Intervention à vérifier" : "Tout est à l’heure", icon: Clock, tone: "#D97706", target: "atelier" },
    { label: "RDV dans 2 heures", value: imminent, hint: imminent ? "Préparez les dossiers" : "Rien d’imminent", icon: CalendarClock, tone: "#3D6BE0", target: "agenda" },
    { label: "Clients à rappeler", value: toRecall, hint: "Fidélisation à déclencher", icon: Phone, tone: "#7C3AED", target: "clients" },
  ];
  return (
    <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
      {cards.map((card) => {
        const Icon = card.icon;
        return <button key={card.label} onClick={() => onNavigate(card.target)} className="bg-white border border-slate-200 hover:border-slate-300 hover:shadow-sm rounded-2xl p-4 text-left transition-all">
          <div className="flex justify-between gap-2"><div className="text-[12.5px] font-medium text-slate-500">{card.label}</div><div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${card.tone}18` }}><Icon size={15} color={card.tone} /></div></div>
          <div className="text-2xl font-semibold text-slate-900 mt-2">{card.value}</div><div className="text-[12px] text-slate-400 mt-1">{card.hint}</div>
        </button>;
      })}
      <button onClick={() => onNavigate("agenda")} className="rounded-2xl p-4 text-left text-white overflow-hidden relative" style={{ backgroundColor: NAVY }}>
        <div className="absolute -right-7 -top-7 w-24 h-24 rounded-full bg-blue-400/20" />
        <div className="text-[12.5px] text-blue-200">Taux de remplissage</div><div className="flex items-end gap-2 mt-2"><div className="text-2xl font-semibold">{occupancy}%</div><div className="text-[12px] text-blue-200 mb-1">aujourd’hui</div></div>
        <div className="mt-3 h-1.5 rounded-full bg-white/15 overflow-hidden"><div className="h-full rounded-full bg-blue-300" style={{ width: `${occupancy}%` }} /></div>
      </button>
    </div>
  );
}

function WorkshopTimeline({ rendezVous, onSelectAppt, compact = false }) {
  const grouped = WORKSHOP_STAGES.map((stage) => ({
    ...stage,
    appointments: rendezVous.filter((r) => (r.statut_atelier || "a_venir") === stage.key && isToday(r.date_debut)),
  }));
  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
      <div className="px-5 py-4 flex items-center justify-between border-b border-slate-100"><div><div className="font-semibold text-slate-900 text-[15px]">Flux atelier en direct</div><div className="text-[12.5px] text-slate-500 mt-0.5">Chaque véhicule est visible, de son arrivée à sa restitution.</div></div><Badge tone="green">{grouped.reduce((sum, stage) => sum + stage.appointments.length, 0)} véhicules suivis</Badge></div>
      <div className={`grid grid-cols-1 ${compact ? "md:grid-cols-3" : "xl:grid-cols-6"} gap-px bg-slate-200`}>
        {grouped.map((stage, index) => <div key={stage.key} className="bg-white min-h-[150px] p-3">
          <div className="flex items-center justify-between gap-2 mb-3"><div className="flex items-center gap-1.5 text-[12px] font-semibold" style={{ color: stage.color }}><span className="w-2 h-2 rounded-full" style={{ backgroundColor: stage.color }} />{stage.label}</div><span className="text-[11px] text-slate-400">{stage.appointments.length}</span></div>
          <div className="space-y-2">{stage.appointments.length === 0 ? <div className="text-[11.5px] text-slate-300 pt-3">Aucun véhicule</div> : stage.appointments.map((appt) => <button key={appt.id} onClick={() => onSelectAppt(appt)} className="w-full text-left rounded-lg p-2 hover:bg-slate-50 border border-slate-100"><div className="text-[12px] font-medium text-slate-800 truncate">{appt.client}</div><div className="text-[11px] text-slate-500 truncate">{appt.vehicule}</div><div className="text-[11px] font-medium mt-1" style={{ color: stage.color }}>{appt.debut}</div></button>)}</div>
          {index < grouped.length - 1 && !compact && <ArrowRight size={14} className="hidden xl:block absolute" />}
        </div>)}
      </div>
    </div>
  );
}

function SmartAlerts({ clients, demandes, rendezVous, onNavigate }) {
  const now = new Date();
  const oneYearAgo = new Date(now);
  oneYearAgo.setFullYear(now.getFullYear() - 1);
  const dormantClients = clients.filter((client) => {
    if (!client.fidele) return false;
    const last = rendezVous.filter((rdv) => rdv.client_id === client.id && rdv.statut === "Terminé").sort((a, b) => new Date(b.date_debut) - new Date(a.date_debut))[0];
    return !last || new Date(last.date_debut) < oneYearAgo;
  });
  const technicalControl = clients.filter((client) => {
    const vehicles = Array.isArray(client.vehicules) ? client.vehicules : [];
    return vehicles.some((vehicle) => vehicle.controle_technique_echeance && new Date(vehicle.controle_technique_echeance) <= new Date(now.getTime() + 45 * 86_400_000));
  });
  const quotesToFollow = demandes.filter((demande) => demande.statut === "en_attente").length;
  const unconfirmed = rendezVous.filter((rdv) => ["En attente", "en_attente"].includes(rdv.statut) && new Date(rdv.date_debut) > now).length;
  const alerts = [
    { label: "Clients fidèles à rappeler", value: dormantClients.length, note: "Aucune visite depuis 12 mois", target: "clients", tone: "#7C3AED" },
    { label: "Contrôles techniques proches", value: technicalControl.length, note: "Échéance dans les 45 jours", target: "clients", tone: "#D97706" },
    { label: "Devis à relancer", value: quotesToFollow, note: "Demande en attente client", target: "demandes", tone: "#3D6BE0" },
    { label: "RDV non confirmés", value: unconfirmed, note: "À sécuriser avant l’atelier", target: "agenda", tone: "#DC2626" },
  ];
  return <div className="bg-white border border-slate-200 rounded-2xl shadow-sm"><div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between"><div><div className="font-semibold text-slate-900 text-[15px]">Opportunités et alertes intelligentes</div><div className="text-[12.5px] text-slate-500 mt-0.5">Ce que l’équipe peut faire pour éviter une perte de temps ou de chiffre d’affaires.</div></div><Sparkles size={17} color={ACCENT} /></div><div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 divide-x-0 sm:divide-x divide-y sm:divide-y-0 divide-slate-100">{alerts.map((alert) => <button key={alert.label} onClick={() => onNavigate(alert.target)} className="p-4 text-left hover:bg-slate-50 transition-colors"><div className="text-[12px] font-medium text-slate-500">{alert.label}</div><div className="text-2xl font-semibold mt-2" style={{ color: alert.tone }}>{alert.value}</div><div className="text-[11.5px] text-slate-400 mt-1">{alert.note}</div></button>)}</div></div>;
}

function FinancialOverview({ rendezVous, demandes, propositions }) {
  const todayRdv = rendezVous.filter((r) => isToday(r.date_debut));
  const completed = rendezVous.filter((r) => r.statut === "Terminé");
  const estimate = (r) => Number(r.montant_ttc || r.montant || 0);
  const forecast = todayRdv.reduce((sum, r) => sum + estimate(r), 0);
  const average = completed.length ? Math.round(completed.reduce((sum, r) => sum + estimate(r), 0) / completed.length) : 0;
  const accepted = propositions.filter((p) => p.statut === "accepte").length;
  const rate = accepted + propositions.length ? Math.round((accepted / (accepted + propositions.length)) * 100) : 0;
  const bySource = Object.keys(SOURCE_META).map((source) => ({ source, count: demandes.filter((d) => d.source === source).length })).filter((x) => x.count);
  const max = Math.max(1, ...bySource.map((x) => x.count));
  return <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
    <div className="lg:col-span-2 bg-white border border-slate-200 rounded-2xl p-5 shadow-sm"><div className="flex items-center justify-between"><div><div className="font-semibold text-slate-900 text-[15px]">Pilotage financier</div><div className="text-[12.5px] text-slate-500">Estimation basée sur les montants renseignés.</div></div><CircleDollarSign size={19} color={ACCENT} /></div><div className="grid grid-cols-2 gap-3 mt-5"><div className="bg-blue-50 rounded-xl p-3"><div className="text-[11.5px] text-blue-700">CA prévisionnel jour</div><div className="text-xl font-semibold text-blue-950 mt-1">{forecast ? `${forecast.toLocaleString("fr-FR")} €` : "À renseigner"}</div></div><div className="bg-slate-50 rounded-xl p-3"><div className="text-[11.5px] text-slate-500">Panier moyen</div><div className="text-xl font-semibold text-slate-900 mt-1">{average ? `${average.toLocaleString("fr-FR")} €` : "—"}</div></div><div className="text-[13px] text-slate-600">Taux de validation <strong className="text-slate-900">{rate}%</strong></div><div className="text-[13px] text-slate-600">No-shows <strong className="text-slate-900">0</strong></div></div></div>
    <div className="lg:col-span-3 bg-white border border-slate-200 rounded-2xl p-5 shadow-sm"><div className="font-semibold text-slate-900 text-[15px]">Origine des demandes</div><div className="text-[12.5px] text-slate-500 mt-0.5">Pour investir là où les clients vous trouvent vraiment.</div><div className="mt-4 space-y-3">{bySource.length === 0 ? <div className="text-[13px] text-slate-400 py-3">Les sources apparaîtront avec les demandes clients.</div> : bySource.map(({ source, count }) => { const meta = SOURCE_META[source]; return <div key={source} className="grid grid-cols-[110px_1fr_28px] items-center gap-3"><div className="text-[12px] text-slate-600">{meta?.label || source}</div><div className="h-2 rounded-full bg-slate-100 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${(count / max) * 100}%`, backgroundColor: meta?.text || ACCENT }} /></div><div className="text-[12px] font-semibold text-slate-700 text-right">{count}</div></div>; })}</div></div>
  </div>;
}

function AutomationPanel({ events = [], garageData }) {
  const status = garageData.google_agenda_connecte ? "Synchronisé" : "Connexion requise";
  const chips = [
    { label: "SMS", value: events.filter((e) => e.type === "sms").length, tone: "green" },
    { label: "Emails", value: events.filter((e) => e.type === "email").length, tone: "green" },
    { label: "Rappels", value: events.filter((e) => e.type === "rappel").length, tone: "amber" },
    { label: "Google Calendar", value: status, tone: garageData.google_agenda_connecte ? "green" : "amber" },
  ];
  return <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><div><div className="font-semibold text-slate-900 text-[15px]">Automatisations suivies</div><div className="text-[12.5px] text-slate-500 mt-0.5">Chaque action n8n sera traçable ici.</div></div><BellRing size={18} color={ACCENT} /></div><div className="grid grid-cols-2 gap-2 mt-4">{chips.map((chip) => <div key={chip.label} className="bg-slate-50 rounded-xl px-3 py-2.5"><div className="text-[11px] text-slate-500">{chip.label}</div><div className="mt-1"><Badge tone={chip.tone}>{chip.value || "En attente"}</Badge></div></div>)}</div>{!garageData.google_agenda_connecte && <div className="mt-3 text-[12px] text-amber-800 bg-amber-50 rounded-lg p-2.5">Google Calendar n’est pas connecté : les rendez-vous restent suivis dans Nexora.</div>}{events.some((event) => event.statut === "erreur") && <div className="mt-3 text-[12px] text-red-800 bg-red-50 rounded-lg p-2.5">Une automatisation nécessite votre attention.</div>}</div>;
}

function AtelierView({ rendezVous, onSelectAppt, garageData }) {
  const todayAppts = rendezVous.filter((r) => isToday(r.date_debut));
  const resourceAppointments = (resource, index) => todayAppts.filter((appt, appointmentIndex) => (appt.mecanicien_id || appt.pont_id || WORKSHOP_RESOURCES[appointmentIndex % Math.max(1, garageData.nb_mecaniciens || 3)]?.id) === resource.id);
  return <div className="space-y-5">
    <div className="rounded-2xl overflow-hidden p-5 text-white relative" style={{ backgroundColor: NAVY }}><div className="absolute -right-10 -top-10 w-44 h-44 rounded-full bg-blue-500/20" /><div className="relative flex items-start justify-between flex-wrap gap-4"><div><div className="flex items-center gap-2"><Wrench size={18} color="#8FB0FF" /><span className="font-semibold">Atelier en direct</span></div><div className="text-2xl font-semibold mt-3">Votre équipe sait quoi faire, maintenant.</div><div className="text-[13px] mt-1 text-blue-200">Répartissez les véhicules, suivez les retards et gardez le client informé.</div></div><div className="grid grid-cols-2 gap-2"><div className="bg-white/10 rounded-xl p-3"><div className="text-[11px] text-blue-200">Véhicules aujourd’hui</div><div className="text-xl font-semibold mt-1">{todayAppts.length}</div></div><div className="bg-white/10 rounded-xl p-3"><div className="text-[11px] text-blue-200">Équipe disponible</div><div className="text-xl font-semibold mt-1">{garageData.nb_mecaniciens || 0}</div></div></div></div></div>
    <WorkshopTimeline rendezVous={rendezVous} onSelectAppt={onSelectAppt} />
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden"><div className="px-5 py-4 border-b border-slate-100"><div className="font-semibold text-slate-900 text-[15px]">Planning des ressources</div><div className="text-[12.5px] text-slate-500 mt-0.5">Affectez prochainement chaque rendez-vous à un mécanicien et à un pont.</div></div><div className="overflow-x-auto"><div className="min-w-[850px]"><div className="grid grid-cols-[180px_repeat(10,minmax(65px,1fr))] border-b border-slate-100">{["Ressource", ...heuresGrille].map((hour) => <div key={hour} className="px-3 py-2 text-[11px] font-medium text-slate-400 border-r border-slate-100">{hour}</div>)}</div>{WORKSHOP_RESOURCES.map((resource, index) => { const assigned = resourceAppointments(resource, index); return <div key={resource.id} className="grid grid-cols-[180px_repeat(10,minmax(65px,1fr))] min-h-[74px] border-b border-slate-100 last:border-0"><div className="px-3 py-3 border-r border-slate-100"><div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: resource.color }} /><div><div className="text-[12.5px] font-medium text-slate-800">{resource.name}</div><div className="text-[11px] text-slate-400">{resource.role}</div></div></div></div><div className="col-span-10 relative p-1.5 flex gap-1.5">{assigned.map((appt) => <button key={appt.id} onClick={() => onSelectAppt(appt)} className="h-[58px] max-w-[180px] px-2 rounded-lg text-left overflow-hidden" style={{ backgroundColor: `${resource.color}1A`, borderLeft: `3px solid ${resource.color}`, width: `${Math.max(76, durationRows(appt.debut, appt.fin) * 66)}px` }}><div className="text-[11px] font-semibold truncate" style={{ color: resource.color }}>{appt.client}</div><div className="text-[10.5px] text-slate-500 truncate">{appt.prestation}</div></button>)}</div></div>; })}</div></div></div>
  </div>;
}

// =====================================================================================
// VIEWS
// =====================================================================================
function RapportHebdomadaire() {
  const [rapport, setRapport] = useState(null);
  const [loadingRapport, setLoadingRapport] = useState(true);
  const [ouvert, setOuvert] = useState(true);

  useEffect(() => {
    async function chargerRapport() {
      const debutSemaine = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

      const [
        demandesRes,
        rdvRes,
        devisEnvoyesRes,
        devisAcceptesRes,
        devisRefusesRes,
        facturesRes,
        clientsRes,
        urgentesRes,
      ] = await Promise.all([
        supabase.from("demandes").select("id", { count: "exact", head: true }).eq("garage_id", ACTIVE_GARAGE_ID).gte("created_at", debutSemaine),
        supabase.from("rendez_vous").select("id", { count: "exact", head: true }).eq("garage_id", ACTIVE_GARAGE_ID).gte("date_debut", debutSemaine).in("statut", ["confirme", "termine"]),
        supabase.from("devis").select("id", { count: "exact", head: true }).eq("garage_id", ACTIVE_GARAGE_ID).gte("created_at", debutSemaine),
        supabase.from("devis").select("id", { count: "exact", head: true }).eq("garage_id", ACTIVE_GARAGE_ID).eq("statut", "accepte").gte("created_at", debutSemaine),
        supabase.from("devis").select("id", { count: "exact", head: true }).eq("garage_id", ACTIVE_GARAGE_ID).eq("statut", "refuse").gte("created_at", debutSemaine),
        supabase.from("factures").select("montant_ttc, statut").eq("garage_id", ACTIVE_GARAGE_ID).gte("created_at", debutSemaine),
        supabase.from("clients").select("id", { count: "exact", head: true }).eq("garage_id", ACTIVE_GARAGE_ID).gte("created_at", debutSemaine),
        supabase.from("demandes").select("id", { count: "exact", head: true }).eq("garage_id", ACTIVE_GARAGE_ID).eq("urgence", "Élevée").gte("created_at", debutSemaine),
      ]);

      const factures = facturesRes.data || [];
      const caFacture = factures.reduce((s, f) => s + Number(f.montant_ttc || 0), 0);
      const caEncaisse = factures.filter((f) => f.statut === "payee").reduce((s, f) => s + Number(f.montant_ttc || 0), 0);

      setRapport({
        demandes: demandesRes.count || 0,
        rdv: rdvRes.count || 0,
        devisEnvoyes: devisEnvoyesRes.count || 0,
        devisAcceptes: devisAcceptesRes.count || 0,
        devisRefuses: devisRefusesRes.count || 0,
        nbFactures: factures.length,
        caFacture,
        caEncaisse,
        nouveauxClients: clientsRes.count || 0,
        urgentes: urgentesRes.count || 0,
      });
      setLoadingRapport(false);
    }
    chargerRapport();
  }, []);

  if (loadingRapport || !rapport) {
    return <SkeletonCard h="h-32" />;
  }

  const tauxAcceptation = rapport.devisEnvoyes > 0 ? Math.round((rapport.devisAcceptes / rapport.devisEnvoyes) * 100) : null;

  const lignes = [
    { label: "Demandes reçues", value: rapport.demandes },
    { label: "RDV confirmés", value: rapport.rdv },
    { label: "Nouveaux clients", value: rapport.nouveauxClients },
    { label: "Demandes urgentes", value: rapport.urgentes },
    { label: "Devis envoyés", value: rapport.devisEnvoyes },
    { label: "Devis acceptés", value: rapport.devisAcceptes },
    { label: "Devis refusés", value: rapport.devisRefuses },
    { label: "Factures émises", value: rapport.nbFactures },
  ];

  return (
    <div className="rounded-2xl overflow-hidden p-5 text-white relative" style={{ backgroundColor: NAVY }}>
      <div className="absolute -right-10 -top-10 w-44 h-44 rounded-full bg-blue-500/20" />
      <div className="relative">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <Bot size={18} color="#8FB0FF" />
            <span className="font-semibold">Rapport de la semaine — Nexora</span>
          </div>
          <button onClick={() => setOuvert((v) => !v)} className="text-[12px] text-blue-200 hover:text-white">
            {ouvert ? "Réduire" : "Voir le détail"}
          </button>
        </div>

        <div className="mt-3 flex items-baseline gap-2 flex-wrap">
          <span className="text-2xl font-semibold">{rapport.caFacture.toFixed(0)} €</span>
          <span className="text-[13px] text-blue-200">facturés · {rapport.caEncaisse.toFixed(0)} € déjà encaissés</span>
          {tauxAcceptation !== null && (
            <span className="text-[13px] text-blue-200">· {tauxAcceptation}% des devis acceptés</span>
          )}
        </div>

        {ouvert && (
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
            {lignes.map((l) => (
              <div key={l.label} className="bg-white/10 rounded-xl p-3">
                <div className="text-[11px] text-blue-200">{l.label}</div>
                <div className="text-xl font-semibold mt-1">{l.value}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function DashboardView({ stats, propositions, setView, onSelectAppt, loading, rendezVous, demandes, clients, garageData, aiStats, timeline, automationEvents, factures = [], devisList = [] }) {
  const upcomingAppts = [...rendezVous]
    .filter((r) => new Date(r.date_fin) >= new Date())
    .sort((a, b) => new Date(a.date_debut) - new Date(b.date_debut));
  const todayKey = dateKey(new Date());
  const todayAppts = upcomingAppts.filter((r) => r.date_key === todayKey);
  const urgentRequests = stats.urgent || 0;

  const debutMois = new Date();
  debutMois.setDate(1);
  debutMois.setHours(0, 0, 0, 0);
  const facturesCeMois = factures.filter((f) => new Date(f.created_at) >= debutMois);
  const caEncaisse = facturesCeMois.filter((f) => f.statut === "payee").reduce((s, f) => s + Number(f.montant_ttc || 0), 0);
  const caEnAttente = factures.filter((f) => f.statut !== "payee").reduce((s, f) => s + Number(f.montant_ttc || 0), 0);
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
      <GarageIdentityCard garageData={garageData} />

      <RapportHebdomadaire />

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <StatCard label="Demandes en attente" value={stats.pending} icon={Inbox} />
        <StatCard label="RDV à valider" value={stats.toValidate} icon={Clock} />
        <StatCard label="RDV aujourd'hui" value={todayAppts.length} icon={Calendar} />
        <StatCard label="Clients" value={stats.clients} icon={Users} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <StatCard label={`Encaissé ce mois (${facturesCeMois.length} facture${facturesCeMois.length > 1 ? "s" : ""})`} value={`${caEncaisse.toFixed(0)} €`} icon={CircleDollarSign} />
        <StatCard label="En attente de paiement" value={`${caEnAttente.toFixed(0)} €`} icon={ReceiptText} />
      </div>

      <WorkshopControlPanel rendezVous={rendezVous} demandes={demandes} clients={clients} garageData={garageData} onNavigate={setView} />

      <SmartAlerts clients={clients} demandes={demandes} rendezVous={rendezVous} onNavigate={setView} />

      {(urgentRequests > 0 || propositions.length > 0) && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-amber-100"><AlertTriangle size={18} className="text-amber-700" /></div>
            <div>
              <div className="text-sm font-semibold text-amber-950">Votre attention est requise</div>
              <div className="text-[13px] text-amber-800">{urgentRequests ? `${urgentRequests} demande${urgentRequests > 1 ? "s" : ""} urgente${urgentRequests > 1 ? "s" : ""}` : ""}{urgentRequests && propositions.length ? " · " : ""}{propositions.length ? `${propositions.length} proposition${propositions.length > 1 ? "s" : ""} à valider` : ""}</div>
            </div>
          </div>
          <button onClick={() => setView(urgentRequests ? "demandes" : "valider")} className="text-[13px] font-semibold px-3.5 py-2 rounded-xl bg-white border border-amber-200 text-amber-800">Traiter maintenant</button>
        </div>
      )}

      <NexoraControlCenter aiStats={aiStats} timeline={timeline} />

      <WorkshopTimeline rendezVous={rendezVous} onSelectAppt={onSelectAppt} compact />

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
        <div className="xl:col-span-3"><FinancialOverview rendezVous={rendezVous} demandes={demandes} propositions={propositions} /></div>
        <div className="xl:col-span-2"><AutomationPanel events={automationEvents} garageData={garageData} /></div>
      </div>

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
          {todayAppts.length === 0 ? (
            <div className="px-5 py-8 text-center text-slate-400 text-[13px]">Aucun rendez-vous prévu aujourd’hui.</div>
          ) : todayAppts.slice(0, 4).map((a) => {
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

function ValiderView({ propositions, onAccept, onRefuse, onReschedule, garageId }) {
  const [rescheduling, setRescheduling] = useState(null);
  if (propositions.length === 0) {
    return <EmptyState icon={Check} title="Aucun rendez-vous en attente" subtitle="Nexora vous préviendra dès qu'une nouvelle proposition arrive." />;
  }
  return (
    <div className="space-y-4">
      {propositions.map((p) => (
        <PropositionCard
          key={p.id}
          p={p}
          onAccept={onAccept}
          onRefuse={onRefuse}
          onOpenReschedule={() => setRescheduling(p)}
        />
      ))}
      {rescheduling && (
        <RescheduleModal
          proposition={rescheduling}
          garageId={garageId}
          onClose={() => setRescheduling(null)}
          onConfirm={(newStart, newEnd) => {
            onReschedule(rescheduling.id, newStart, newEnd);
            setRescheduling(null);
          }}
        />
      )}
    </div>
  );
}
function PropositionCard({ p, onAccept, onRefuse, onOpenReschedule }) {
  const [showMessage, setShowMessage] = useState(false);
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
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
      <div className="mt-3 bg-slate-50 rounded-xl p-3">
        <div className="flex gap-2 items-start">
          <MessageSquare size={14} className="text-slate-400 mt-0.5 shrink-0" />
          <div className="text-[13px] text-slate-700 flex-1">{p.motif || "Motif non précisé"}</div>
        </div>
        {p.message && (
          <>
            <button
              onClick={() => setShowMessage((v) => !v)}
              className="mt-2 text-[12px] font-medium text-slate-500 hover:text-slate-700"
            >
              {showMessage ? "Masquer le message original" : "Afficher le message original"}
            </button>
            {showMessage && (
              <div className="mt-2 text-[13px] text-slate-600 whitespace-pre-line border-t border-slate-200 pt-2">
                {p.message}
              </div>
            )}
          </>
        )}
      </div>
      <div className="flex gap-2.5 mt-4">
        <button onClick={() => onAccept(p.id)} className="flex items-center gap-1.5 text-sm font-medium text-white px-4 py-2 rounded-xl" style={{ backgroundColor: "#16A34A" }}>
          <Check size={15} /> Accepter
        </button>
        <button onClick={onOpenReschedule} className="flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-xl border border-slate-200 text-slate-600">
          <Pencil size={15} /> Modifier la date
        </button>
        <button onClick={() => onRefuse(p.id)} className="flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-xl border border-slate-200 text-slate-600">
          <X size={15} /> Refuser
        </button>
      </div>
    </div>
  );
}
function RescheduleModal({ proposition, garageId, onClose, onConfirm }) {
  const initialDate = new Date(proposition.date_debut_proposee).toISOString().slice(0, 10);
  const [date, setDate] = useState(initialDate);
  const [time, setTime] = useState(proposition.debut || "09:00");
  const [dayBookings, setDayBookings] = useState([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    async function loadDay() {
      setLoading(true);
      const start = `${date}T00:00:00`;
      const end = `${date}T23:59:59`;
      const { data } = await supabase
        .from("rendez_vous")
        .select("date_debut, date_fin, clients(nom)")
        .eq("garage_id", garageId)
        .gte("date_debut", start)
        .lte("date_debut", end)
        .order("date_debut");
      setDayBookings(data || []);
      setLoading(false);
    }
    loadDay();
  }, [date]);
  const duree = proposition.duree || 60;
  const [dateError, setDateError] = useState("");
  const confirm = () => {
    const newStart = `${date}T${time}:00`;
    const startDate = new Date(newStart);
    const isValidDate = /^\d{4}-\d{2}-\d{2}$/.test(date) && /^\d{2}:\d{2}$/.test(time) && !isNaN(startDate.getTime());
    if (!isValidDate) {
      setDateError("Date ou heure invalide — vérifiez le format.");
      return;
    }
    setDateError("");
    const endDate = new Date(startDate.getTime() + duree * 60000);
    onConfirm(startDate.toISOString(), endDate.toISOString());
  };
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-lg text-slate-900" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
          <Calendar size={18} /> Modifier la date — {proposition.client}
        </h2>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div>
            <label className="text-[12px] text-slate-500">Date</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-[12px] text-slate-500">Heure de début</label>
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
          </div>
        </div>
        <div className="mt-4">
          <div className="text-[12px] font-medium text-slate-500 mb-2">Disponibilités du garage ce jour-là</div>
          {loading ? (
            <div className="text-[13px] text-slate-400">Chargement…</div>
          ) : dayBookings.length === 0 ? (
            <div className="text-[13px] text-emerald-600">Aucun rendez-vous ce jour — journée libre</div>
          ) : (
            <div className="space-y-1.5 max-h-40 overflow-y-auto">
              {dayBookings.map((b, i) => (
                <div key={i} className="flex items-center gap-2 text-[13px] text-slate-600 bg-slate-50 rounded-lg px-2.5 py-1.5">
                  <Clock size={13} className="text-slate-400" />
                  {timeLabel(b.date_debut)} - {timeLabel(b.date_fin)} · {b.clients?.nom || "Client"}
                </div>
              ))}
            </div>
          )}
        </div>
        {dateError && <div className="mt-3 text-[13px] text-red-600">{dateError}</div>}
        <div className="flex gap-2.5 mt-6">
          <button onClick={confirm} className="flex items-center gap-1.5 text-sm font-medium text-white px-4 py-2 rounded-xl" style={{ backgroundColor: ACCENT }}>
            <Check size={15} /> Confirmer la nouvelle date
          </button>
          <button onClick={onClose} className="text-sm font-medium px-4 py-2 rounded-xl border border-slate-200 text-slate-600">
            Annuler
          </button>
        </div>
      </div>
    </div>
  );
}

function GenererDevisModal({ clients, prestations, clientPreselectionne, onClose, onCreate }) {
  const [query, setQuery] = useState("");
  const [clientId, setClientId] = useState(clientPreselectionne?.id || "");
  const [prestationId, setPrestationId] = useState("");
  const [montantHt, setMontantHt] = useState(0);
  const [creating, setCreating] = useState(false);

  const clientChoisi = clientPreselectionne || clients.find((c) => c.id === clientId) || null;
  const vehiculesClient = Array.isArray(clientChoisi?.vehicules) ? clientChoisi.vehicules : clientChoisi?.vehicules ? [clientChoisi.vehicules] : [];
  const vehiculeChoisi = vehiculesClient[0] || null;
  const clientsFiltres = clients.filter((c) => !query || c.nom?.toLowerCase().includes(query.toLowerCase()));

  const choisirPrestation = (id) => {
    setPrestationId(id);
    const p = prestations.find((p) => p.id === id);
    setMontantHt(Number(p?.prix_ht || 0));
  };

  const creer = async () => {
    if (!clientChoisi) return;
    setCreating(true);
    await onCreate({
      client_id: clientChoisi.id,
      vehicule_id: vehiculeChoisi?.id || null,
      prestation_id: prestationId || null,
      montant_ht: montantHt,
    });
    setCreating(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-lg text-slate-900" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold text-slate-900">Créer un devis</h2>

        {!clientPreselectionne && (
          <div className="mt-4">
            <label className="text-[12px] font-medium text-slate-500">Client</label>
            {clientChoisi ? (
              <div className="mt-1 flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2 text-sm">
                <span>{clientChoisi.nom}</span>
                <button onClick={() => setClientId("")} className="text-[12px] text-slate-500">Changer</button>
              </div>
            ) : (
              <>
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher un client..." className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
                <div className="mt-1 max-h-40 overflow-y-auto border border-slate-100 rounded-lg divide-y divide-slate-50">
                  {clientsFiltres.slice(0, 20).map((c) => (
                    <button key={c.id} onClick={() => setClientId(c.id)} className="w-full text-left px-3 py-2 text-[13px] hover:bg-slate-50">{c.nom}</button>
                  ))}
                  {clientsFiltres.length === 0 && <div className="px-3 py-2 text-[13px] text-slate-400">Aucun client trouvé.</div>}
                </div>
              </>
            )}
          </div>
        )}

        {clientChoisi && vehiculeChoisi && (
          <div className="mt-3 text-[12.5px] text-slate-500">Véhicule : {vehiculeChoisi.marque} {vehiculeChoisi.modele} — {vehiculeChoisi.immatriculation}</div>
        )}

        <div className="mt-4">
          <label className="text-[12px] font-medium text-slate-500">Prestation</label>
          <select value={prestationId} onChange={(e) => choisirPrestation(e.target.value)} className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
            <option value="">— Choisir —</option>
            {prestations.map((p) => (
              <option key={p.id} value={p.id}>{p.nom} ({Number(p.prix_ht || 0).toFixed(2)} € HT)</option>
            ))}
          </select>
        </div>

        <div className="mt-4">
          <label className="text-[12px] font-medium text-slate-500">Montant HT</label>
          <input type="number" min="0" step="0.01" value={montantHt} onChange={(e) => setMontantHt(Number(e.target.value))} className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
          <div className="text-[12px] text-slate-400 mt-1">TTC : {(Math.round(montantHt * 1.2 * 100) / 100).toFixed(2)} €</div>
        </div>

        <div className="flex gap-2.5 mt-6">
          <button onClick={creer} disabled={!clientChoisi || creating} className="flex items-center gap-1.5 text-sm font-medium text-white px-4 py-2 rounded-xl disabled:opacity-50" style={{ backgroundColor: ACCENT }}>
            <ReceiptText size={15} /> {creating ? "Création..." : "Créer le devis"}
          </button>
          <button onClick={onClose} className="text-sm font-medium px-4 py-2 rounded-xl border border-slate-200 text-slate-600">Annuler</button>
        </div>
      </div>
    </div>
  );
}

function DevisView({ devisList, clients, prestations, onAccept, onRefuse, onUpdateMontant, onCreer }) {
  const [modalOuvert, setModalOuvert] = useState(false);
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={() => setModalOuvert(true)} className="flex items-center gap-1.5 text-sm font-medium text-white px-4 py-2 rounded-xl" style={{ backgroundColor: ACCENT }}>
          <Plus size={15} /> Créer un devis
        </button>
      </div>
      {devisList.length === 0 ? (
        <EmptyState icon={ReceiptText} title="Aucun devis en attente" subtitle="Les demandes de devis apparaîtront ici, prêtes à valider ou ajuster." />
      ) : (
        devisList.map((d) => (
          <DevisCard key={d.id} d={d} onAccept={onAccept} onRefuse={onRefuse} onUpdateMontant={onUpdateMontant} />
        ))
      )}
      {modalOuvert && (
        <GenererDevisModal clients={clients} prestations={prestations} onClose={() => setModalOuvert(false)} onCreate={onCreer} />
      )}
    </div>
  );
}

function DevisCard({ d, onAccept, onRefuse, onUpdateMontant }) {
  const [editing, setEditing] = useState(false);
  const [montant, setMontant] = useState(d.montant_ht ?? 0);
  const [showMessage, setShowMessage] = useState(false);

  const saveMontant = () => {
    const value = Number(montant);
    if (isNaN(value) || value < 0) return;
    onUpdateMontant(d.id, value);
    setEditing(false);
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
      <div className="flex items-start justify-between flex-wrap gap-2">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <div className="font-semibold text-slate-900 text-[15px]">{d.client}</div>
            <Badge tone="amber">Devis en attente</Badge>
          </div>
          <div className="text-[13px] text-slate-500 mt-1">{formatPhone(d.telephone)}</div>
        </div>
        <div className="text-right">
          <div className="text-sm font-medium text-slate-900">{d.date}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
        <div className="flex items-center gap-2 text-sm text-slate-700"><Car size={15} className="text-slate-400" /> {d.vehicule} · {d.immatriculation}</div>
        <div className="text-sm text-slate-700 flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: catColor(d.categorie).bar }} /> {d.prestation}
        </div>
      </div>

      <div className="mt-3 bg-slate-50 rounded-xl p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm text-slate-700">
            {editing ? (
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={montant}
                  onChange={(e) => setMontant(e.target.value)}
                  className="w-28 border border-slate-200 rounded-lg px-2 py-1 text-sm"
                />
                <span className="text-slate-500 text-[12px]">€ HT (TTC calculé auto.)</span>
              </div>
            ) : (
              <div>
                <span className="font-semibold text-slate-900">{Number(d.montant_ttc || 0).toFixed(2)} € TTC</span>
                <span className="text-slate-500 text-[12.5px]"> · {Number(d.montant_ht || 0).toFixed(2)} € HT</span>
              </div>
            )}
          </div>
          {editing ? (
            <div className="flex gap-2">
              <button onClick={saveMontant} className="text-[12px] font-medium text-white px-3 py-1.5 rounded-lg" style={{ backgroundColor: ACCENT }}>Enregistrer</button>
              <button onClick={() => setEditing(false)} className="text-[12px] font-medium text-slate-500 px-3 py-1.5">Annuler</button>
            </div>
          ) : (
            <button onClick={() => setEditing(true)} className="flex items-center gap-1 text-[12px] font-medium text-slate-500 hover:text-slate-700">
              <Pencil size={12} /> Modifier le montant
            </button>
          )}
        </div>

        {d.message_original && (
          <>
            <button onClick={() => setShowMessage((v) => !v)} className="mt-3 text-[12px] font-medium text-slate-500 hover:text-slate-700">
              {showMessage ? "Masquer le message original" : "Afficher le message original"}
            </button>
            {showMessage && (
              <div className="mt-2 text-[13px] text-slate-600 whitespace-pre-line border-t border-slate-200 pt-2">{d.message_original}</div>
            )}
          </>
        )}
      </div>

      <div className="flex gap-2.5 mt-4">
        <button onClick={() => onAccept(d.id)} className="flex items-center gap-1.5 text-sm font-medium text-white px-4 py-2 rounded-xl" style={{ backgroundColor: "#16A34A" }}>
          <Check size={15} /> Valider et envoyer au client
        </button>
        <button onClick={() => onRefuse(d.id)} className="flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-xl border border-slate-200 text-slate-600">
          <X size={15} /> Refuser
        </button>
      </div>
    </div>
  );
}

function AgendaView({ onSelectAppt, rendezVous, garageData, onConnectCalendar }) {
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

    if (mode === "mois") {
      date.setMonth(date.getMonth() + direction);
    }

    if (mode === "annee") {
      date.setFullYear(date.getFullYear() + direction);
    }

    return date;
  });
};

const selectedDateKey = dateKey(currentDate);
const dayAppts = rendezVous.filter((r) => r.date_key === selectedDateKey);
const startOfWeek = new Date(currentDate);
startOfWeek.setDate(currentDate.getDate() - currentDate.getDay() + 1);
const endOfWeek = new Date(startOfWeek);
endOfWeek.setDate(startOfWeek.getDate() + 6);

const weekDays = Array.from({ length: 7 }, (_, index) => {
  const date = new Date(startOfWeek);
  date.setDate(startOfWeek.getDate() + index);

  return {
    key: dateKey(date),
    date,
    label: date.toLocaleDateString("fr-FR", {
      weekday: "short",
      day: "numeric",
    }),
  };
});
const monthStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
const monthGridStart = new Date(monthStart);
monthGridStart.setDate(monthStart.getDate() - ((monthStart.getDay() + 6) % 7));
const monthDays = Array.from({ length: 42 }, (_, index) => {
  const date = new Date(monthGridStart);
  date.setDate(monthGridStart.getDate() + index);
  return { date, key: dateKey(date), inMonth: date.getMonth() === currentDate.getMonth() };
});
const monthLabel = currentDate.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });

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
  : mode === "semaine" ? `Semaine du ${startOfWeek.toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "long",
    })} au ${endOfWeek.toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "long",
    })}` : mode === "mois" ? monthLabel : `${currentDate.getFullYear()}`
}
          </div>
          <button 
         onClick={() => changeDate(1)} className="p-1.5 rounded-lg border border-slate-200 text-slate-500"><ChevronRight size={16} /></button>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-xl border border-slate-200 overflow-hidden text-[13px]">
            {["jour", "semaine", "mois", "annee"].map((m) => (
              <button key={m} onClick={() => setMode(m)} className="px-3.5 py-1.5 font-medium capitalize" style={mode === m ? { backgroundColor: ACCENT, color: "#fff" } : { backgroundColor: "#fff", color: "#64748B" }}>
                {m}
              </button>
            ))}
          </div>
          {/* Préparé pour une future synchronisation bidirectionnelle Google Calendar */}
          <button onClick={onConnectCalendar} className="flex items-center gap-1.5 text-[13px] font-medium text-white px-3.5 py-1.5 rounded-xl" style={{ backgroundColor: garageData.google_agenda_connecte ? "#16A34A" : ACCENT }}>
            <CalendarPlus size={14} /> {garageData.google_agenda_connecte ? "Google synchronisé" : "Connecter Google"}
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
      ) : mode === "semaine" ? (
        <div className="grid grid-cols-5 divide-x divide-slate-100">
          {weekDays.map((day) => {
            const appts = rendezVous.filter((a) => a.date_key === day.key);
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
      ) : mode === "mois" ? (
        <div className="grid grid-cols-7 divide-x divide-y divide-slate-100 border-t border-slate-100">{["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"].map((day) => <div key={day} className="px-2 py-2 text-center text-[11px] font-medium text-slate-400 bg-slate-50">{day}</div>)}{monthDays.map((day) => { const appts = rendezVous.filter((appt) => appt.date_key === day.key); return <div key={day.key} className={`min-h-[105px] p-2 ${day.inMonth ? "bg-white" : "bg-slate-50/70"}`}><div className={`text-[11px] font-medium mb-1 ${day.inMonth ? "text-slate-600" : "text-slate-300"}`}>{day.date.getDate()}</div><div className="space-y-1">{appts.slice(0, 3).map((appt) => <button key={appt.id} onClick={() => onSelectAppt(appt)} className="w-full truncate text-left text-[10.5px] px-1.5 py-1 rounded" style={{ color: catColor(appt.categorie).text, backgroundColor: catColor(appt.categorie).bg }}>{appt.debut} · {appt.client}</button>)}{appts.length > 3 && <div className="text-[10px] text-slate-400">+{appts.length - 3} RDV</div>}</div></div>; })}</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 p-5">{Array.from({ length: 12 }, (_, month) => { const label = new Date(currentDate.getFullYear(), month, 1).toLocaleDateString("fr-FR", { month: "long" }); const count = rendezVous.filter((appt) => { const date = new Date(appt.date_debut); return date.getFullYear() === currentDate.getFullYear() && date.getMonth() === month; }).length; return <button key={month} onClick={() => { setCurrentDate(new Date(currentDate.getFullYear(), month, 1)); setMode("mois"); }} className="rounded-xl border border-slate-200 p-4 text-left hover:border-blue-300 hover:bg-blue-50/30"><div className="capitalize text-sm font-semibold text-slate-800">{label}</div><div className="text-[12px] text-slate-500 mt-1">{count} rendez-vous</div><div className="mt-3 h-1.5 rounded-full bg-slate-100"><div className="h-full rounded-full" style={{ width: `${Math.min(100, count * 12)}%`, backgroundColor: ACCENT }} /></div></button>; })}</div>
      )}
    </div>
  );
}

  function DemandesView({ demandes, onSelectDemande, onRecommend }) {
  const [detailDemande, setDetailDemande] = useState(null);
  const [query, setQuery] = useState("");

  const demandesFiltrees = demandes.filter((d) => {
    const q = query.toLowerCase();
    if (!q) return true;
    return (
      d.clients?.nom?.toLowerCase().includes(q) ||
      d.motif?.toLowerCase().includes(q) ||
      d.vehicules?.marque?.toLowerCase().includes(q) ||
      d.vehicules?.immatriculation?.toLowerCase().includes(q)
    );
  });

  const statutTone = (s) => {
  if (s === "nouveau") return "amber";
  if (s === "rendez_vous_confirme") return "green";
  if (s === "infos_manquantes") return "amber";
  return "slate";
};


const statutLabel = (s) => {
  if (s === "nouveau") return "Nouveau";
  if (s === "rendez_vous_confirme") return "Rendez-vous confirmé";
  if (s === "infos_manquantes") return "Infos manquantes";
  if (s === "traitee") return "Traitée";
  return s;
};
  if (demandes.length === 0) {
    return <EmptyState icon={Inbox} title="Aucune demande pour le moment" subtitle="Les nouvelles demandes clients apparaîtront ici automatiquement." />;
  }
  return (
    <div className="space-y-3">
    <div className="flex items-center gap-2 bg-white rounded-xl px-3 py-2 border border-slate-200 max-w-xs">
      <Search size={14} className="text-slate-400" />
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Client, motif, véhicule..."
        className="bg-transparent text-[12.5px] outline-none w-full text-slate-800 placeholder:text-slate-400"
      />
    </div>
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
          {demandesFiltrees.map((d) => {
  return (
    <tr
  key={d.id}
  className="hover:bg-slate-50/60"
>

      <td className="px-5 py-3.5 font-medium text-slate-900">
        {d.clients?.nom || "Client inconnu"}
      </td>

      <td className="px-5 py-3.5 text-slate-600">
        {d.vehicules
          ? `${d.vehicules.marque} ${d.vehicules.modele}`
          : ""}
      </td>

      <td className="px-5 py-3.5 text-slate-600">
        {d.motif || d.type_demande || "—"}
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
  {d.statut === "infos_manquantes" ? (
    <button onClick={() => setDetailDemande(d)} className="cursor-pointer">
      <Badge tone={statutTone(d.statut)}>{statutLabel(d.statut)} ↗</Badge>
    </button>
  ) : (
    <Badge tone={statutTone(d.statut)}>{statutLabel(d.statut)}</Badge>
  )}
</td>

<td className="px-5 py-3.5">
  {d.statut === "nouveau" && (
    <button
      className="text-sm font-medium text-white px-3 py-2 rounded-xl cursor-pointer"
      style={{ backgroundColor: "#3D6BE0" }}
      onClick={() => onRecommend ? onRecommend(d) : onSelectDemande(d)}
    >
      Action recommandée
    </button>
  )}
</td>

</tr>
  );
})}
        </tbody>
      </table>
    </div>
      {detailDemande && (
        <InfosManquantesModal demande={detailDemande} onClose={() => setDetailDemande(null)} />
      )}
    </div>
  );
}

function InfosManquantesModal({ demande, onClose }) {
  const client = demande.clients || {};
  const vehicule = demande.vehicules || {};

  const LABELS = {
    nom: "Nom", telephone: "Téléphone", email: "Email",
    annee_vehicule: "Année du véhicule", immatriculation: "Immatriculation", kilometrage: "Kilométrage",
  };
  const champsConnus = [
    { label: "Nom", value: client.nom },
    { label: "Téléphone", value: client.telephone },
    { label: "Email", value: client.email },
    { label: "Véhicule", value: vehicule.marque ? `${vehicule.marque} ${vehicule.modele || ""}`.trim() : null },
    { label: "Année du véhicule", value: vehicule.annee },
    { label: "Immatriculation", value: vehicule.immatriculation },
    { label: "Kilométrage", value: vehicule.kilometrage ? `${vehicule.kilometrage} km` : null },
  ].filter((c) => c.value);
  const champsManquants = Array.isArray(demande.infos_manquantes) ? demande.infos_manquantes : [];
  const manquantes = champsManquants.map((key) => ({ key, label: LABELS[key] || key }));
  const connues = champsConnus;

  const mailtoHref = client.email
    ? `mailto:${client.email}?subject=${encodeURIComponent("Votre demande — informations complémentaires")}&body=${encodeURIComponent(`Bonjour ${client.nom || ""},

Pourriez-vous nous communiquer : ${manquantes.map((m) => m.label.toLowerCase()).join(", ")} ?

Merci,
L'équipe du garage`)}`
    : null;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-lg text-slate-900" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold text-slate-900">Informations manquantes — {client.nom || "Client"}</h2>

        <div className="mt-4">
          <div className="text-[12px] font-medium text-slate-500 mb-2">Informations connues</div>
          {connues.length === 0 ? (
            <div className="text-[13px] text-slate-400">Aucune information confirmée pour le moment.</div>
          ) : (
            <div className="space-y-1.5">
              {connues.map((c) => (
                <div key={c.label} className="flex items-center gap-2 text-[13px] text-slate-700">
                  <Check size={13} className="text-emerald-500" /> {c.label} : <span className="font-medium">{c.value}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-4">
          <div className="text-[12px] font-medium text-slate-500 mb-2">Informations manquantes</div>
          {manquantes.length === 0 ? (
            <div className="text-[13px] text-emerald-600">Tout est complet.</div>
          ) : (
            <div className="space-y-1.5">
              {manquantes.map((c) => (
                <div key={c.key} className="flex items-center gap-2 text-[13px] text-red-600">
                  <X size={13} /> {c.label}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-4 bg-slate-50 rounded-xl p-3 text-[13px] text-slate-600">
          <div className="font-medium text-slate-700 mb-1">Déjà demandé au client</div>
          Nexora a envoyé une relance automatique le {new Date(demande.created_at).toLocaleDateString("fr-FR")} demandant : {manquantes.map((m) => m.label.toLowerCase()).join(", ") || "les informations manquantes"}.
        </div>

        <div className="flex gap-2.5 mt-6">
          {mailtoHref ? (
            <a href={mailtoHref} className="flex items-center gap-1.5 text-sm font-medium text-white px-4 py-2 rounded-xl" style={{ backgroundColor: ACCENT }}>
              <Send size={15} /> Relancer le client
            </a>
          ) : (
            <span className="text-[12.5px] text-slate-400 px-2 py-2">Email du client inconnu — relance impossible pour l'instant.</span>
          )}
          <button onClick={onClose} className="text-sm font-medium px-4 py-2 rounded-xl border border-slate-200 text-slate-600">
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}

function ErreursView({ erreurs, onResoudre }) {
  if (erreurs.length === 0) {
    return <EmptyState icon={Check} title="Tout fonctionne normalement" subtitle="Aucune erreur automatique détectée. Nexora vous préviendra ici dès qu'un problème survient." />;
  }
  return (
    <div className="space-y-4">
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-[13px] text-amber-800">
        Ces automatisations n'ont pas pu se terminer correctement. Rien n'est perdu côté client, mais une action manuelle ou une vérification peut être nécessaire.
      </div>
      {erreurs.map((e) => (
        <div key={e.id} className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-start justify-between flex-wrap gap-2">
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <Badge tone="red">Erreur</Badge>
                <div className="font-semibold text-slate-900 text-[14px]">{e.workflow_nom}</div>
              </div>
              <div className="text-[13px] text-slate-500 mt-1">Étape : {e.noeud}</div>
            </div>
            <div className="text-[12.5px] text-slate-400">
              {new Date(e.created_at).toLocaleString("fr-FR", { timeZone: APP_TIME_ZONE })}
            </div>
          </div>
          <div className="mt-3 bg-slate-50 rounded-xl p-3 text-[13px] text-slate-700 font-mono">
            {e.message}
          </div>
          <div className="flex gap-2.5 mt-4">
            <button onClick={() => onResoudre(e.id)} className="flex items-center gap-1.5 text-sm font-medium text-white px-4 py-2 rounded-xl" style={{ backgroundColor: ACCENT }}>
              <Check size={15} /> Marquer comme résolu
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function imprimerFacture(facture, garageData) {
  const client = facture.clients || {};
  const vehicule = facture.vehicules || {};
  const lignes = Array.isArray(facture.lignes) && facture.lignes.length ? facture.lignes : [
    { description: "Prestation atelier", quantite: 1, prix_unitaire_ht: facture.montant_ht || 0 },
  ];
  const lignesHtml = lignes.map((l) => {
    const totalLigne = (Number(l.quantite) || 0) * (Number(l.prix_unitaire_ht) || 0);
    const typeLabel = l.type === "piece" ? "Pièce" : l.type === "main_oeuvre" ? "Main d'œuvre" : "";
    return `<tr><td>${typeLabel}</td><td>${l.description || ""}</td><td>${l.quantite}</td><td>${Number(l.prix_unitaire_ht || 0).toFixed(2)} €</td><td>${totalLigne.toFixed(2)} €</td></tr>`;
  }).join("");
  const html = `
    <html>
    <head>
      <title>${facture.numero}</title>
      <style>
        body { font-family: -apple-system, sans-serif; padding: 40px; color: #1e293b; }
        h1 { font-size: 20px; }
        .header { display: flex; justify-content: space-between; margin-bottom: 40px; }
        .box { background: #f8fafc; border-radius: 12px; padding: 16px; margin-bottom: 20px; }
        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        td, th { text-align: left; padding: 10px; border-bottom: 1px solid #e2e8f0; }
        .total { font-size: 18px; font-weight: 600; text-align: right; margin-top: 20px; }
      </style>
    </head>
    <body>
      <div class="header">
        <div><h1>${garageData?.nom || "Garage"}</h1><div>${garageData?.ville || ""}</div></div>
        <div><strong>Facture ${facture.numero}</strong><br/>${new Date(facture.created_at).toLocaleDateString("fr-FR")}</div>
      </div>
      <div class="box">
        <strong>Client :</strong> ${client.nom || ""}<br/>
        ${client.telephone || ""} ${client.email ? "· " + client.email : ""}<br/>
        <strong>Véhicule :</strong> ${vehicule.marque || ""} ${vehicule.modele || ""} — ${vehicule.immatriculation || ""}<br/>
        ${facture.motif ? `<strong>Motif :</strong> ${facture.motif}` : ""}
      </div>
      <table>
        <tr><th>Type</th><th>Description</th><th>Qté</th><th>PU HT</th><th>Total HT</th></tr>
        ${lignesHtml}
      </table>
      <div class="total">
        Total HT : ${Number(facture.montant_ht || 0).toFixed(2)} €<br/>
        Total à payer : ${Number(facture.montant_ttc || 0).toFixed(2)} € TTC
      </div>
    </body>
    </html>
  `;
  const w = window.open("", "_blank");
  w.document.write(html);
  w.document.close();
  w.print();
}

function FacturesView({ rendezVous, factures, prestations, garageData, onGenerer, onMarquerPayee, onSauvegarder }) {
  const [factureOuverte, setFactureOuverte] = useState(null);
  const [query, setQuery] = useState("");
  const [periode, setPeriode] = useState("toutes");
  const [categorie, setCategorie] = useState("toutes");
  const aFacturer = rendezVous.filter(
    (r) => r.statut === "Terminé" && !factures.some((f) => f.rendez_vous_id === r.id)
  );

  const facturesEnrichies = factures.map((f) => {
    const rdv = rendezVous.find((r) => r.id === f.rendez_vous_id);
    return { ...f, categorie: rdv?.categorie || "diagnostic" };
  });

  const categoriesDisponibles = [...new Set(prestations.map((p) => p.categorie).filter(Boolean))];

  const trenteJours = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const facturesFiltrees = facturesEnrichies.filter((f) => {
    const q = query.toLowerCase();
    const matchQuery = !q || f.numero?.toLowerCase().includes(q) || f.clients?.nom?.toLowerCase().includes(q) || f.motif?.toLowerCase().includes(q);
    const matchPeriode = periode === "toutes" || (periode === "recentes" ? new Date(f.created_at).getTime() >= trenteJours : new Date(f.created_at).getTime() < trenteJours);
    const matchCategorie = categorie === "toutes" || f.categorie === categorie;
    return matchQuery && matchPeriode && matchCategorie;
  });

  return (
    <div className="space-y-6">
      <div>
        <div className="font-semibold text-slate-900 text-[15px] mb-3">RDV terminés à facturer</div>
        {aFacturer.length === 0 ? (
          <div className="text-[13px] text-slate-400">Aucun RDV terminé en attente de facturation.</div>
        ) : (
          <div className="space-y-3">
            {aFacturer.map((r) => (
              <div key={r.id} className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm flex items-center justify-between flex-wrap gap-3">
                <div>
                  <div className="font-medium text-slate-900 text-[14px]">{r.client}</div>
                  <div className="text-[12.5px] text-slate-500">{r.vehicule} · {r.immatriculation} · {r.prestation}</div>
                </div>
                <button onClick={() => onGenerer(r)} className="flex items-center gap-1.5 text-sm font-medium text-white px-4 py-2 rounded-xl" style={{ backgroundColor: ACCENT }}>
                  <ReceiptText size={15} /> Générer la facture
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
          <div className="font-semibold text-slate-900 text-[15px]">Factures ({facturesFiltrees.length})</div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-2 bg-slate-50 rounded-xl px-3 py-1.5 border border-slate-200">
              <Search size={14} className="text-slate-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Numéro, client, motif..."
                className="bg-transparent text-[12.5px] outline-none w-40 text-slate-800 placeholder:text-slate-400"
              />
            </div>
            <select value={periode} onChange={(e) => setPeriode(e.target.value)} className="text-[12.5px] border border-slate-200 rounded-xl px-2.5 py-1.5 text-slate-600">
              <option value="toutes">Toutes les dates</option>
              <option value="recentes">30 derniers jours</option>
              <option value="anciennes">Plus anciennes</option>
            </select>
            <select value={categorie} onChange={(e) => setCategorie(e.target.value)} className="text-[12.5px] border border-slate-200 rounded-xl px-2.5 py-1.5 text-slate-600">
              <option value="toutes">Toutes catégories</option>
              {categoriesDisponibles.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>
        {factures.length === 0 ? (
          <EmptyState icon={CircleDollarSign} title="Aucune facture" subtitle="Les factures générées depuis les RDV terminés apparaîtront ici." />
        ) : facturesFiltrees.length === 0 ? (
          <div className="text-[13px] text-slate-400">Aucune facture ne correspond à ces filtres.</div>
        ) : (
          <div className="space-y-3">
            {facturesFiltrees.map((f) => (
              <div key={f.id} className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm flex items-center justify-between flex-wrap gap-3">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="font-medium text-slate-900 text-[14px]">{f.numero}</div>
                    <Badge tone={f.statut === "payee" ? "green" : "amber"}>{f.statut === "payee" ? "Payée" : "En attente"}</Badge>
                    <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: catColor(f.categorie).bar }} />
                  </div>
                  <div className="text-[12.5px] text-slate-500">
                    {f.clients?.nom}{f.motif ? ` — ${f.motif}` : ""} · {Number(f.montant_ttc || 0).toFixed(2)} € TTC
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setFactureOuverte(f)} className="text-sm font-medium px-3.5 py-2 rounded-xl border border-slate-200 text-slate-600">
                    Voir
                  </button>
                  {f.statut !== "payee" && (
                    <button onClick={() => onMarquerPayee(f.id)} className="text-sm font-medium text-white px-3.5 py-2 rounded-xl" style={{ backgroundColor: "#16A34A" }}>
                      Marquer payée
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {factureOuverte && (
        <FactureDetailModal
          facture={factureOuverte}
          garageData={garageData}
          onClose={() => setFactureOuverte(null)}
          onSauvegarder={async (payload) => {
            await onSauvegarder(factureOuverte.id, payload);
            setFactureOuverte((prev) => (prev ? { ...prev, ...payload } : prev));
          }}
        />
      )}
    </div>
  );
}

function FactureDetailModal({ facture, garageData, onClose, onSauvegarder }) {
  const [modeEdition, setModeEdition] = useState(false);
  const [motif, setMotif] = useState(facture.motif || "");
  const [lignes, setLignes] = useState(
    Array.isArray(facture.lignes) && facture.lignes.length
      ? facture.lignes
      : [{ type: "main_oeuvre", description: "Prestation atelier", quantite: 1, prix_unitaire_ht: facture.montant_ht || 0 }]
  );

  const client = facture.clients || {};
  const vehicule = facture.vehicules || {};
  const totalHt = lignes.reduce((sum, l) => sum + (Number(l.quantite) || 0) * (Number(l.prix_unitaire_ht) || 0), 0);
  const totalTtc = Math.round(totalHt * 1.2 * 100) / 100;

  const updateLigne = (index, champ, valeur) => {
    setLignes((prev) => prev.map((l, i) => (i === index ? { ...l, [champ]: valeur } : l)));
  };
  const ajouterLigne = (type) => {
    setLignes((prev) => [...prev, { type, description: "", quantite: 1, prix_unitaire_ht: 0 }]);
  };
  const supprimerLigne = (index) => {
    setLignes((prev) => prev.filter((_, i) => i !== index));
  };
  const sauvegarder = async () => {
    await onSauvegarder({ motif, lignes });
    setModeEdition(false);
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-2xl text-slate-900 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Facture {facture.numero}</h2>
          <Badge tone={facture.statut === "payee" ? "green" : "amber"}>{facture.statut === "payee" ? "Payée" : "En attente"}</Badge>
        </div>

        <div className="mt-4 bg-slate-50 rounded-xl p-3 text-[13px] text-slate-700">
          <strong>Client :</strong> {client.nom} · {client.telephone} {client.email ? `· ${client.email}` : ""}<br/>
          <strong>Véhicule :</strong> {vehicule.marque} {vehicule.modele} — {vehicule.immatriculation}
        </div>

        <div className="mt-4">
          <label className="text-[12px] font-medium text-slate-500">Motif de l'intervention</label>
          {modeEdition ? (
            <textarea value={motif} onChange={(e) => setMotif(e.target.value)} className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" rows={2} />
          ) : (
            <div className="text-[13px] text-slate-700 mt-1">{motif || "—"}</div>
          )}
        </div>

        <div className="mt-4">
          <div className="text-[12px] font-medium text-slate-500 mb-2">Détail</div>
          <div className="space-y-2">
            {lignes.map((l, i) => (
              <div key={i} className="flex items-center gap-2">
                {modeEdition ? (
                  <>
                    <select value={l.type} onChange={(e) => updateLigne(i, "type", e.target.value)} className="border border-slate-200 rounded-lg px-2 py-1.5 text-[12.5px]">
                      <option value="main_oeuvre">Main d'œuvre</option>
                      <option value="piece">Pièce</option>
                      <option value="autre">Autre</option>
                    </select>
                    <input value={l.description} onChange={(e) => updateLigne(i, "description", e.target.value)} placeholder="Description" className="flex-1 border border-slate-200 rounded-lg px-2 py-1.5 text-[12.5px]" />
                    <input type="number" min="0" step="1" value={l.quantite} onChange={(e) => updateLigne(i, "quantite", Number(e.target.value))} className="w-16 border border-slate-200 rounded-lg px-2 py-1.5 text-[12.5px]" />
                    <input type="number" min="0" step="0.01" value={l.prix_unitaire_ht} onChange={(e) => updateLigne(i, "prix_unitaire_ht", Number(e.target.value))} className="w-24 border border-slate-200 rounded-lg px-2 py-1.5 text-[12.5px]" />
                    <button onClick={() => supprimerLigne(i)} className="text-red-500 px-1"><X size={16} /></button>
                  </>
                ) : (
                  <div className="flex-1 flex items-center justify-between text-[13px] text-slate-700 bg-slate-50 rounded-lg px-3 py-2">
                    <span>{l.type === "piece" ? "Pièce" : l.type === "main_oeuvre" ? "Main d'œuvre" : "Autre"} — {l.description}</span>
                    <span>{l.quantite} × {Number(l.prix_unitaire_ht || 0).toFixed(2)} € = {((Number(l.quantite) || 0) * (Number(l.prix_unitaire_ht) || 0)).toFixed(2)} €</span>
                  </div>
                )}
              </div>
            ))}
          </div>
          {modeEdition && (
            <div className="flex gap-2 mt-2">
              <button onClick={() => ajouterLigne("piece")} className="text-[12px] font-medium text-slate-500 hover:text-slate-700 flex items-center gap-1"><Plus size={13} /> Ajouter une pièce</button>
              <button onClick={() => ajouterLigne("main_oeuvre")} className="text-[12px] font-medium text-slate-500 hover:text-slate-700 flex items-center gap-1"><Plus size={13} /> Ajouter de la main d'œuvre</button>
            </div>
          )}
        </div>

        <div className="mt-4 text-right text-sm text-slate-700">
          Total HT : {totalHt.toFixed(2)} €<br/>
          <span className="font-semibold text-slate-900">Total TTC : {totalTtc.toFixed(2)} €</span>
        </div>

        <div className="flex gap-2.5 mt-6">
          {modeEdition ? (
            <>
              <button onClick={sauvegarder} className="flex items-center gap-1.5 text-sm font-medium text-white px-4 py-2 rounded-xl" style={{ backgroundColor: ACCENT }}>
                <Save size={15} /> Enregistrer
              </button>
              <button onClick={() => setModeEdition(false)} className="text-sm font-medium px-4 py-2 rounded-xl border border-slate-200 text-slate-600">Annuler</button>
            </>
          ) : (
            <>
              <button onClick={() => imprimerFacture({ ...facture, motif, lignes, montant_ht: totalHt, montant_ttc: totalTtc }, garageData)} className="flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-xl border border-slate-200 text-slate-600">
                Imprimer / PDF
              </button>
              <button onClick={() => setModeEdition(true)} className="flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-xl border border-slate-200 text-slate-600">
                <Pencil size={15} /> Modifier
              </button>
              <button onClick={onClose} className="text-sm font-medium px-4 py-2 rounded-xl text-slate-500">Fermer</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ClientsView({ clients = [], rendezVous = [], prestations = [], onCreerDevis, onToast }) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [devisModalOpen, setDevisModalOpen] = useState(false);
  const filtered = clients.filter((c) => c.nom?.toLowerCase().includes(query.toLowerCase()));
  const selected = clients.find((c) => c.id === selectedId) || filtered[0] || null;
  const selectedVehicles = Array.isArray(selected?.vehicules) ? selected.vehicules : selected?.vehicules ? [selected.vehicules] : [];
  const vehicule = selectedVehicles[0];
  const historique = rendezVous
    .filter((r) => r.client_id === selected?.id)
    .sort((a, b) => new Date(b.date_debut) - new Date(a.date_debut))
    .map((r) => ({ prestation: r.prestation, date: new Date(r.date_debut).toLocaleDateString("fr-FR"), statut: r.statut, note: r.notes }));
  const notes = [];
  const derniereVisite = historique.find((h) => h.statut === "termine" || h.statut === "Terminé")?.date || null;
  const totalCA = rendezVous.filter((r) => r.client_id === selected?.id && r.statut === "Terminé").reduce((sum, r) => sum + Number(r.montant_ttc || r.montant || 0), 0);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
      <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-3 border-b border-slate-100">
          <div className="flex items-center gap-2 bg-slate-50 rounded-xl px-3 py-2">
            <Search size={15} className="text-slate-400" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher un client..." className="bg-transparent text-sm text-slate-900 outline-none w-full placeholder:text-slate-400" />
          </div>
        </div>
        {filtered.length === 0 ? (
          <div className="px-4 py-8 text-center text-slate-400 text-[13px]">Aucun client ne correspond à cette recherche.</div>
        ) : (
          <div className="divide-y divide-slate-100 max-h-[560px] overflow-y-auto">
            {filtered.map((c) => {
              const vehicles = Array.isArray(c.vehicules) ? c.vehicules : c.vehicules ? [c.vehicules] : [];
              const v = vehicles[0];
              return (
                <button key={c.id} onClick={() => setSelectedId(c.id)} className="w-full text-left px-4 py-3 hover:bg-slate-50/70 flex items-center justify-between" style={selected?.id === c.id ? { backgroundColor: ACCENT_SOFT } : {}}>
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
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            {selected?.avatar_url ? <img src={selected.avatar_url} alt="" className="w-12 h-12 rounded-2xl object-cover" /> : <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-sm font-semibold text-white" style={{ backgroundColor: ACCENT }}>{selected?.nom?.split(" ").map((n) => n[0]).slice(0, 2).join("") || "CL"}</div>}
            <div><div className="text-lg font-semibold text-slate-900">{selected?.nom}</div><div className="text-[12.5px] text-slate-500">Dossier client et véhicule</div></div>
            {selected?.fidele && <Badge tone="amber">⭐ Client fidèle</Badge>}
          </div>
          <div className="flex items-center gap-2 flex-wrap"><a href={selected?.telephone ? `tel:${selected.telephone.replace(/\s/g, "")}` : undefined} className="px-3 py-2 rounded-xl border border-slate-200 text-[12.5px] font-medium text-slate-700 flex items-center gap-1.5"><Phone size={13} />Appeler</a><a href={selected?.telephone ? `sms:${selected.telephone.replace(/\s/g, "")}` : undefined} className="px-3 py-2 rounded-xl border border-slate-200 text-[12.5px] font-medium text-slate-700 flex items-center gap-1.5"><MessageSquare size={13} />SMS</a><button onClick={() => setDevisModalOpen(true)} className="px-3 py-2 rounded-xl text-[12.5px] font-medium text-white flex items-center gap-1.5" style={{ backgroundColor: ACCENT }}><ReceiptText size={13} />Devis</button></div>
          {devisModalOpen && selected && (
            <GenererDevisModal
              clients={clients}
              prestations={prestations}
              clientPreselectionne={selected}
              onClose={() => setDevisModalOpen(false)}
              onCreate={onCreerDevis}
            />
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
          <Phone size={14} className="text-slate-400" /> {formatPhone(selected?.telephone)}
          <div className="flex items-center gap-2 text-sm text-slate-600"><Mail size={14} className="text-slate-400" /> {selected?.email}</div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-6">
          <div className="bg-slate-50 rounded-xl p-3.5"><div className="text-[12px] text-slate-500">Dernière visite</div><div className="font-semibold text-slate-800 text-sm mt-1">{derniereVisite || "Aucune visite enregistrée"}</div></div>
          <div className="bg-slate-50 rounded-xl p-3.5"><div className="text-[12px] text-slate-500">CA client enregistré</div><div className="font-semibold text-slate-800 text-sm mt-1">{totalCA ? `${totalCA.toLocaleString("fr-FR")} €` : "À renseigner"}</div></div>
        </div>

        <div className="mt-6">
          <div className="text-[13px] font-medium text-slate-500 mb-2">Véhicule</div>
          <div className="bg-slate-50 rounded-xl p-3.5 flex items-center gap-3">
            <Car size={16} className="text-slate-400" />
            <div className="text-sm text-slate-800">{vehicule?.marque} {vehicule?.modele} ({vehicule?.annee}) · <span className="text-slate-500">{vehicule?.immatriculation}</span></div>
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

function ParametresView({ garageData, onGarageChange, onSave, prestations = [], onAddPrestation, onDeletePrestation, saving }) {
  const [newPrestation, setNewPrestation] = useState({ nom: "", categorie: "entretien", duree_minutes: 60 });
  const catalogue = prestations.length ? prestations : prestationsCatalogue;
  const field = (label, name, type = "text") => <label className="block"><span className="text-[12.5px] font-medium text-slate-500">{label}</span><input type={type} value={garageData[name] ?? ""} onChange={(event) => onGarageChange(name, type === "number" ? Number(event.target.value) : event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500" /></label>;
  const JOURS_SEMAINE = [["1", "Lundi"], ["2", "Mardi"], ["3", "Mercredi"], ["4", "Jeudi"], ["5", "Vendredi"], ["6", "Samedi"], ["7", "Dimanche"]];
  const horaires = garageData.horaires && typeof garageData.horaires === "object" ? garageData.horaires : {};
  const plagesDuJour = (jour) => (Array.isArray(horaires[jour]) ? horaires[jour] : []);
  const majPlage = (jour, index, borne, valeur) => {
    const plages = plagesDuJour(jour).map((p) => [...p]);
    while (plages.length <= index) plages.push(["", ""]);
    plages[index][borne] = valeur;
    onGarageChange("horaires", { ...horaires, [jour]: plages });
  };
  const basculerJour = (jour, ouvert) => onGarageChange("horaires", { ...horaires, [jour]: ouvert ? [["08:30", "12:00"], ["14:00", "18:30"]] : [] });
  const ajouterApresMidi = (jour) => onGarageChange("horaires", { ...horaires, [jour]: [...plagesDuJour(jour).slice(0, 1), ["14:00", "18:30"]] });
  const retirerApresMidi = (jour) => onGarageChange("horaires", { ...horaires, [jour]: plagesDuJour(jour).slice(0, 1) });
  const heure = (jour, index, borne) => (plagesDuJour(jour)[index] || ["", ""])[borne] || "";
  const champHeure = (jour, index, borne) => <input type="time" value={heure(jour, index, borne)} onChange={(e) => majPlage(jour, index, borne, e.target.value)} className="rounded-lg border border-slate-200 px-2 py-1.5 text-[13px] text-slate-900 outline-none focus:border-blue-500" />;
  const createPrestation = () => {
    if (!newPrestation.nom.trim()) return;
    onAddPrestation({ ...newPrestation, nom: newPrestation.nom.trim() });
    setNewPrestation({ nom: "", categorie: "entretien", duree_minutes: 60 });
  };
  return <div className="space-y-5">
    <div className="flex items-center justify-between flex-wrap gap-3"><div><div className="text-lg font-semibold text-slate-900">Paramètres du garage</div><div className="text-[13px] text-slate-500">Vos changements alimentent directement le dashboard et les automatisations.</div></div><button onClick={onSave} disabled={saving} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-60" style={{ backgroundColor: ACCENT }}><Save size={15} />{saving ? "Enregistrement…" : "Enregistrer"}</button></div>
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      <SettingsSection title="Informations garage"><div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{field("Nom du garage", "nom")} {field("Ville", "ville")} {field("Logo (URL)", "logo_url")} {field("Mécaniciens disponibles", "nb_mecaniciens", "number")}</div></SettingsSection>
      <SettingsSection title="Horaires d’ouverture"><div className="space-y-2">{JOURS_SEMAINE.map(([jour, libelle]) => { const plages = plagesDuJour(jour); const ouvert = plages.length > 0; return <div key={jour} className="flex flex-wrap items-center gap-2 py-1.5 border-b border-slate-100 last:border-0"><label className="flex items-center gap-2 w-[132px] shrink-0"><input type="checkbox" checked={ouvert} onChange={(e) => basculerJour(jour, e.target.checked)} className="accent-blue-600" /><span className="text-[13px] font-medium text-slate-700">{libelle}</span></label>{ouvert ? <div className="flex flex-wrap items-center gap-1.5">{champHeure(jour, 0, 0)}<span className="text-slate-400 text-xs">→</span>{champHeure(jour, 0, 1)}{plages.length > 1 ? <><span className="text-slate-300 px-1">|</span>{champHeure(jour, 1, 0)}<span className="text-slate-400 text-xs">→</span>{champHeure(jour, 1, 1)}<button type="button" onClick={() => retirerApresMidi(jour)} className="text-[11px] text-slate-400 hover:text-red-500 px-1">retirer</button></> : <button type="button" onClick={() => ajouterApresMidi(jour)} className="text-[11px] text-blue-600 hover:underline px-1">+ après-midi</button>}</div> : <span className="text-[13px] text-slate-400">Fermé</span>}</div>; })}</div><div className="mt-4 rounded-xl bg-slate-50 p-3 text-[12.5px] text-slate-600">Ces horaires servent au calcul des créneaux proposés aux clients. Laissez un jour décoché pour le déclarer fermé.</div></SettingsSection>
      <SettingsSection title="Prestations disponibles"><div className="space-y-1.5 max-h-[230px] overflow-y-auto">{catalogue.map((p) => <div key={p.id || p.nom} className="flex items-center gap-2 text-sm py-2 border-b border-slate-100 last:border-0"><span className="w-2 h-2 rounded-full" style={{ backgroundColor: catColor(p.categorie).bar }} /><span className="flex-1 text-slate-700">{p.nom}</span><span className="text-slate-500 text-[12px]">{p.duree_minutes || p.duree_min || p.duree} min</span>{p.id && <button onClick={() => onDeletePrestation(p.id)} className="ml-1 text-slate-400 hover:text-red-600" title="Supprimer"><Trash2 size={14} /></button>}</div>)}</div><div className="grid grid-cols-[1fr_110px_74px] gap-2 mt-4"><input value={newPrestation.nom} onChange={(event) => setNewPrestation((prev) => ({ ...prev, nom: event.target.value }))} className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900" placeholder="Nouvelle prestation" /><input type="number" min="15" step="15" value={newPrestation.duree_minutes} onChange={(event) => setNewPrestation((prev) => ({ ...prev, duree_minutes: Number(event.target.value) }))} className="rounded-xl border border-slate-200 px-2 py-2 text-sm text-slate-900" /><button onClick={createPrestation} className="rounded-xl text-sm font-semibold text-white" style={{ backgroundColor: ACCENT }}><Plus size={15} className="inline" /> Ajouter</button></div></SettingsSection>
      <SettingsSection title="Connexions"><SettingsRow label="Boîte Gmail" right={<Badge tone={garageData.gmail_connecte ? "green" : "slate"}>{garageData.gmail_connecte ? "Connectée" : "Non connectée"}</Badge>} /><SettingsRow label="Google Agenda" right={<Badge tone={garageData.google_agenda_connecte ? "green" : "amber"}>{garageData.google_agenda_connecte ? "Connecté" : "À connecter dans n8n"}</Badge>} /><div className="mt-3 text-[12px] text-slate-500">La connexion Google Calendar doit être autorisée dans le workflow n8n, puis son état peut être enregistré ici.</div></SettingsSection>
      <SettingsSection title="Notifications"><button onClick={() => onGarageChange("notifications_email", !garageData.notifications_email)} className="w-full flex items-center justify-between py-2.5 border-b border-slate-100"><span className="text-sm text-slate-600">Notifications par email</span><Toggle checked={garageData.notifications_email} /></button><button onClick={() => onGarageChange("notifications_sms", !garageData.notifications_sms)} className="w-full flex items-center justify-between py-2.5"><span className="text-sm text-slate-600">Notifications par SMS</span><Toggle checked={garageData.notifications_sms} /></button></SettingsSection>
    </div>
  </div>;
}
function ProposerRdvModal({ demande, prestations, onClose, onSubmit, submitting, garageData = garage }) {
  const [prestationId, setPrestationId] = useState(demande.suggested_prestation_id || "");
  const [date, setDate] = useState(demande.suggested_date || dateKey(new Date()));
  const [time, setTime] = useState(demande.suggested_time || "09:00");
  const [message, setMessage] = useState(`Bonjour ${demande.clients?.nom || ""},\n\nNous pouvons vous proposer un rendez-vous pour votre véhicule.\n\nCordialement,\n${garageData.nom}`);
  const selectedPrestation = prestations.find((p) => p.id === prestationId);
  const canSubmit = prestationId && date && time && !submitting;

  const submit = () => {
    if (!canSubmit) return;
    onSubmit({
      demande,
      prestation: selectedPrestation,
      date,
      time,
      message,
    });
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>

      <div className="bg-white rounded-2xl p-6 w-full max-w-lg text-slate-900" onClick={(event) => event.stopPropagation()}>

        <h2 className="text-lg font-semibold text-slate-900">
          Proposer un rendez-vous
        </h2>
        {demande.suggested_date && <div className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-blue-50 px-2.5 py-1.5 text-[12px] font-medium text-blue-800"><Sparkles size={13} /> Créneau recommandé selon l’agenda</div>}

        <div className="mt-5 space-y-3 text-sm text-slate-700">

          <div>
            <span className="text-slate-500">
              Client :
            </span>
            <div className="font-medium text-slate-900">
            {demande.clients?.nom}
          </div>
          </div>


          <div>
            <span className="text-slate-500">
              Véhicule :
            </span>
            <div className="font-medium text-slate-900">
            {demande.vehicules?.marque} {demande.vehicules?.modele} {demande.vehicules?.annee}
          </div>
          </div>


          <div>
            <span className="text-slate-500">
              Demande :
            </span>
            <div className="font-medium text-slate-900">
            {demande.type_demande}
          </div>
          </div>

        </div>

<div className="mt-6 space-y-4">

  <div>
    <label className="text-sm text-slate-500">
      Prestation
    </label>

    <select
  className="w-full mt-1 border border-slate-200 rounded-xl px-3 py-2 text-slate-900"
  value={prestationId}
  onChange={(event) => setPrestationId(event.target.value)}
>
  <option value="" disabled>
    Choisir une prestation
  </option>

  {prestations.map((p) => (
    <option key={p.id} value={p.id}>
      {p.nom} ({p.duree_minutes} min)
    </option>
  ))}

</select>
  </div>


  <div className="grid grid-cols-2 gap-3">

    <div>
      <label className="text-sm text-slate-500">
        Date proposée
      </label>

      <input
        type="date"
        className="w-full mt-1 border border-slate-200 rounded-xl px-3 py-2 text-slate-900"
        min={dateKey(new Date())}
        value={date}
        onChange={(event) => setDate(event.target.value)}
      />
    </div>


    <div>
      <label className="text-sm text-slate-500">
        Heure
      </label>

      <input
        type="time"
        className="w-full mt-1 border border-slate-200 rounded-xl px-3 py-2 text-slate-900"
        value={time}
        onChange={(event) => setTime(event.target.value)}
      />
    </div>

  </div>


  <div>
    <label className="text-sm text-slate-500">
      Message client
    </label>

    <textarea
      className="w-full mt-1 border border-slate-200 rounded-xl px-3 py-2 text-slate-900"
      rows="4"
      value={message}
      onChange={(event) => setMessage(event.target.value)}
    />
  </div>

</div>
        <div className="flex justify-end gap-3 mt-6">

          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 cursor-pointer"
          >
            Annuler
          </button>


          <button
            onClick={submit}
            disabled={!canSubmit}
            className="px-4 py-2 rounded-xl text-white cursor-pointer"
            style={{ backgroundColor:"#2748A6", opacity: canSubmit ? 1 : 0.5 }}
          >
            {submitting ? "Envoi…" : "Envoyer la proposition"}
          </button>

        </div>

      </div>

    </div>
  );
}
// =====================================================================================
// APP SHELL
// =====================================================================================
function NexoraDashboardInner() {
  const [view, setView] = useState("dashboard");
  const [stats, setStats] = useState({
  pending: 0,
  toValidate: 0,
  today: 0,
  clients: 0
});
  const [propositions, setPropositions] = useState([]);
  const [devisList, setDevisList] = useState([]);
  const [erreurs, setErreurs] = useState([]);
  const [factures, setFactures] = useState([]);
  const [toast, setToast] = useState(null);
  const [selectedAppt, setSelectedAppt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [rendezVous, setRendezVous] = useState([]);
  const [demandes, setDemandes] = useState([]);
  const [selectedDemande, setSelectedDemande] = useState(null);
  const [prestations, setPrestations] = useState([]);
  const [clients, setClients] = useState([]);
  const [submittingProposal, setSubmittingProposal] = useState(false);
  const [garageData, setGarageData] = useState(garage);
  const [savingSettings, setSavingSettings] = useState(false);
  const [aiStats, setAiStats] = useState(aiStatsToday);
  const [activityTimeline, setActivityTimeline] = useState([]);
  const [automationEvents, setAutomationEvents] = useState([]);
  
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
    ACTIVE_GARAGE_ID
  );

    if (error) {
      console.error("Erreur chargement RDV :", error);
      setLoading(false);
      return;
    }


  const formattedRdv = (data || []).map((rdv) => {
  const debut = new Date(rdv.date_debut);
  const fin = new Date(rdv.date_fin);

  return {
    ...rdv,
    date_key: dateKey(rdv.date_debut),
    jour: dayLabel(rdv.date_debut),
    debut: timeLabel(rdv.date_debut),
    fin: timeLabel(rdv.date_fin),
    prestation: rdv.prestations?.nom || "Prestation",
    client: rdv.clients?.nom || "Client inconnu",
    telephone: rdv.clients?.telephone || "",
    email: rdv.clients?.email || "",
    vehicule: `${rdv.vehicules?.marque || ""} ${rdv.vehicules?.modele || ""}`.trim(),
    immatriculation: rdv.vehicules?.immatriculation || "",
    categorie: rdv.prestations?.categorie || "",
    statut: RDV_STATUS_LABEL[rdv.statut] || rdv.statut,
  };
});

setRendezVous(formattedRdv);
setLoading(false);
  }

    loadRendezVous();
}, []);

  useEffect(() => {
    async function loadGarage() {
      const { data, error } = await supabase.from("garages").select("*").eq("id", ACTIVE_GARAGE_ID).maybeSingle();
      if (!error && data) setGarageData((previous) => ({ ...previous, ...data }));
    }
    loadGarage();
  }, []);

  useEffect(() => {
    async function loadClients() {
      const { data, error } = await supabase
        .from("clients")
        .select("*, vehicules (id, marque, modele, annee, immatriculation)")
        .eq("garage_id", ACTIVE_GARAGE_ID)
        .order("nom");
      if (error) {
        console.error("Erreur chargement clients :", error);
        return;
      }
      setClients(data || []);
    }
    loadClients();
  }, []);


useEffect(() => {

  async function loadDemandes() {

    const { data, error } = await supabase
      .from("demandes")
      .select(`
        *,
        clients (
          nom,
          telephone,
          email
        ),
        vehicules (
        marque,
        modele,
        annee,
        immatriculation,
        kilometrage
        )
     `)
      .eq(
        "garage_id",
        ACTIVE_GARAGE_ID
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

  }


  loadDemandes();

}, []);

  useEffect(() => {

  async function loadPrestations() {

    const { data, error } = await supabase
      .from("prestations")
      .select("*")
      .eq(
        "garage_id",
        ACTIVE_GARAGE_ID
      );


    if (error) {
      console.error("Erreur prestations :", error);
      return;
    }


    setPrestations(data || []);

  }


  loadPrestations();

}, []);

useEffect(() => {
  async function loadStats() {

    const today = dateKey(new Date());
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowKey = dateKey(tomorrow);
    const startOfToday = new Date(`${today}T00:00:00`).toISOString();
    const startOfTomorrow = new Date(`${tomorrowKey}T00:00:00`).toISOString();

    const [
      clientsResult,
      propositionsResult,
      demandesResult,
      rdvTodayResult,
      urgencesResult
    ] = await Promise.all([

      supabase
        .from("clients")
        .select("id", { count: "exact", head: true })
        .eq(
          "garage_id",
          ACTIVE_GARAGE_ID
        ),

      supabase
        .from("propositions_rdv")
        .select("id", { count: "exact", head: true })
        .eq(
          "garage_id",
          ACTIVE_GARAGE_ID
        )
        .eq("statut", "en_attente"),

      supabase
        .from("demandes")
        .select("id", { count: "exact", head: true })
        .eq(
          "garage_id",
          ACTIVE_GARAGE_ID
        )
        .neq("statut", "rendez_vous_confirme"),

      supabase
        .from("rendez_vous")
        .select("id", { count: "exact", head: true })
        .eq(
          "garage_id",
          ACTIVE_GARAGE_ID
        )
        .gte("date_debut", startOfToday)
        .lt("date_debut", startOfTomorrow),

      supabase
        .from("demandes")
        .select("id", { count: "exact", head: true })
        .eq("garage_id", ACTIVE_GARAGE_ID)
        .eq("urgence", "Élevée")
        .neq("statut", "rendez_vous_confirme")
    ]);


    setStats({
      pending: demandesResult.count || 0,
      toValidate: propositionsResult.count || 0,
      today: rdvTodayResult.count || 0,
      clients: clientsResult.count || 0,
      urgent: urgencesResult.count || 0,
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
    message_original,
    motif
  ),
  clients (
    nom,
    telephone
  ),
  vehicules (
    marque,
    modele,
    annee,
    immatriculation
  ),
  prestations (
    nom,
    categorie,
    duree_minutes
  )
`)
  .eq(
    "garage_id",
    ACTIVE_GARAGE_ID
  )
  .eq("statut", "en_attente");


    if (error) {
 console.error(
   "Erreur chargement propositions :",
   JSON.stringify(error, null, 2)
 );
 return;
}



const formattedPropositions = (data || []).map((p) => {
    const client = p.clients;
    const vehicule = p.vehicules;
    const demande = p.demandes;
    const prestation = p.prestations;


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

      categorie: prestation?.categorie || "diagnostic",

      
            motif:
        demande?.motif || "",

      message:
        demande?.message_original || "",


      jour:
        dayLabel(p.date_debut_proposee),


      date:
        new Date(p.date_debut_proposee).toLocaleDateString("fr-FR", { timeZone: APP_TIME_ZONE }),


      debut:
        timeLabel(p.date_debut_proposee),


      fin:
        timeLabel(p.date_fin_proposee),


      duree:
        Math.round((fin - debut) / 60000),
    };
  });




setPropositions(formattedPropositions);


  }

  loadPropositions();

}, []);

  useEffect(() => {
    async function loadDevisList() {
      const { data, error } = await supabase
        .from("devis")
        .select(`
          *,
          clients ( nom, telephone, email ),
          vehicules ( marque, modele, annee, immatriculation ),
          prestations ( nom, categorie )
        `)
        .eq("garage_id", ACTIVE_GARAGE_ID)
        .eq("statut", "en_attente")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Erreur chargement devis :", JSON.stringify(error, null, 2));
        return;
      }

      const formatted = (data || []).map((dv) => ({
        ...dv,
        client: dv.clients?.nom || "Client inconnu",
        telephone: dv.clients?.telephone || "",
        vehicule: `${dv.vehicules?.marque || ""} ${dv.vehicules?.modele || ""}`.trim(),
        immatriculation: dv.vehicules?.immatriculation || "",
        prestation: dv.prestations?.nom || "Prestation",
        categorie: dv.prestations?.categorie || "diagnostic",
        date: new Date(dv.created_at).toLocaleDateString("fr-FR", { timeZone: APP_TIME_ZONE }),
      }));

      setDevisList(formatted);
    }
    loadDevisList();
  }, []);

  useEffect(() => {
    async function loadErreurs() {
      const { data, error } = await supabase
        .from("erreurs_automatisation")
        .select("*")
        .eq("garage_id", ACTIVE_GARAGE_ID)
        .eq("resolu", false)
        .order("created_at", { ascending: false });
      if (error) {
        console.error("Erreur chargement erreurs_automatisation :", JSON.stringify(error, null, 2));
        return;
      }
      setErreurs(data || []);
    }
    loadErreurs();
  }, []);

  useEffect(() => {
    async function loadFactures() {
      const { data, error } = await supabase
        .from("factures")
        .select(`*, clients (nom, telephone, email), vehicules (marque, modele, immatriculation)`)
        .eq("garage_id", ACTIVE_GARAGE_ID)
        .order("created_at", { ascending: false });
      if (error) {
        console.error("Erreur chargement factures :", JSON.stringify(error, null, 2));
        return;
      }
      setFactures(data || []);
    }
    loadFactures();
  }, []);

  useEffect(() => {
    const todayDemandes = demandes.filter((demande) => isToday(demande.created_at));
    const todayPropositions = propositions.filter((proposition) => isToday(proposition.created_at || proposition.date_debut_proposee));
    const todayConfirmed = rendezVous.filter((rdv) => isToday(rdv.date_debut) && rdv.statut === "Confirmé");
    const savedMinutes = (todayDemandes.length * 6) + (todayPropositions.length * 4) + (todayConfirmed.length * 3);
    setAiStats({
      emailsAnalyses: todayDemandes.filter((demande) => demande.source === "gmail").length,
      demandesDetectees: todayDemandes.length,
      creneauxCalcules: todayPropositions.length,
      propositionsEnvoyees: todayPropositions.length,
      rdvConfirmes: todayConfirmed.length,
      tempsEconomiseMin: savedMinutes,
      tarifHoraireAdmin: 38,
    });
    const activities = [
      ...demandes.map((demande) => ({ id: `demande-${demande.id}`, at: demande.created_at, type: "reception", texte: `Demande reçue — ${demande.clients?.nom || "Client"}` })),
      ...propositions.map((proposition) => ({ id: `proposition-${proposition.id}`, at: proposition.created_at || proposition.date_debut_proposee, type: "proposition", texte: `Créneau proposé — ${proposition.client || "Client"}` })),
      ...rendezVous.map((rdv) => ({ id: `rdv-${rdv.id}`, at: rdv.created_at || rdv.date_debut, type: "confirmation", texte: `Rendez-vous confirmé — ${rdv.client || "Client"}` })),
    ].filter((activity) => activity.at).sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 5).map((activity) => ({ ...activity, heure: timeLabel(activity.at) }));
    setActivityTimeline(activities);
  }, [demandes, propositions, rendezVous]);

  useEffect(() => {
    async function loadAutomationEvents() {
      const { data, error } = await supabase
        .from("actions_ia")
        .select("*")
        .eq("garage_id", ACTIVE_GARAGE_ID)
        .order("created_at", { ascending: false })
        .limit(50);
      if (!error) setAutomationEvents(data || []);
    }
    loadAutomationEvents();
  }, []);
  const flashToast = (message, tone = "success") => {
    setToast({ message, tone });
    setTimeout(() => setToast(null), 2800);
  };

  // Remplacer par : fetch(N8N_WEBHOOK_URL + '/rdv-accepte', { method: 'POST', body: JSON.stringify({ proposition_id: id, garage_id: garage.id }) })
  const handleAccept = async (id) => {


  const proposition = propositions.find(
    (p) => p.id === id
  );


  if (!proposition) return;


// Vérifier qu'un rendez-vous n'existe pas déjà
const { data: existingRDV } = await supabase
  .from("rendez_vous")
  .select("id")
  .eq("demande_id", proposition.demande_id)
  .maybeSingle();


if (existingRDV) {
  flashToast("Ce rendez-vous existe déjà");
  return;
}



  // 1 - créer le rendez-vous réel
  const { data: createdRdv, error: insertError } = await supabase
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
  })
  .select("*, prestations (nom, categorie), clients (nom, telephone, email), vehicules (marque, modele, immatriculation)")
  .single();


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
  // Compensation : le rendez-vous n'est pas laissé orphelin si la proposition
  // n'a pas pu être validée. À terme, remplacer ce duo par une RPC transactionnelle.
  if (createdRdv?.id) await supabase.from("rendez_vous").delete().eq("id", createdRdv.id);
  console.error(
    "Erreur validation proposition :",
    JSON.stringify(updateError, null, 2)
  );
  return;
}

  const { error: demandeUpdateError } = await supabase
    .from("demandes")
    .update({ statut: "rendez_vous_confirme" })
    .eq("id", proposition.demande_id);
  if (demandeUpdateError) console.error("Erreur mise à jour demande :", demandeUpdateError);
  setDemandes((prev) => prev.map((demande) => (
    demande.id === proposition.demande_id ? { ...demande, statut: "rendez_vous_confirme" } : demande
  )));

  // 3 - rafraîchir l'écran
  setPropositions((prev) =>
    prev.filter((p) => p.id !== id)
  );


  setStats((s) => ({
    ...s,
    toValidate: Math.max(0, s.toValidate - 1),
    pending: Math.max(0, s.pending - 1),
  }));

  if (createdRdv) {
    const dateDebut = new Date(createdRdv.date_debut);
    setRendezVous((prev) => [...prev, {
      ...createdRdv,
      date_key: dateKey(createdRdv.date_debut),
      jour: dayLabel(createdRdv.date_debut),
      debut: timeLabel(createdRdv.date_debut),
      fin: timeLabel(createdRdv.date_fin),
      prestation: createdRdv.prestations?.nom || proposition.prestation,
      categorie: createdRdv.prestations?.categorie || proposition.categorie,
      statut: RDV_STATUS_LABEL[createdRdv.statut] || createdRdv.statut,
      client: createdRdv.clients?.nom || proposition.client,
      telephone: createdRdv.clients?.telephone || proposition.telephone,
      vehicule: `${createdRdv.vehicules?.marque || ""} ${createdRdv.vehicules?.modele || ""}`.trim() || proposition.vehicule,
      immatriculation: createdRdv.vehicules?.immatriculation || proposition.immatriculation,
      date_debut: dateDebut.toISOString(),
    }]);
  }


  flashToast(
    "Rendez-vous confirmé — le client a été notifié"
  );

};
    const handleReschedule = async (id, newStart, newEnd) => {
    const { error } = await supabase
      .from("propositions_rdv")
      .update({ date_debut_proposee: newStart, date_fin_proposee: newEnd })
      .eq("id", id)
      .eq("statut", "en_attente");

    if (error) {
      flashToast("Erreur lors de la modification de la date", "error");
      return;
    }

    setPropositions((prev) =>
      prev.map((p) =>
        p.id === id
          ? {
              ...p,
              date_debut_proposee: newStart,
              date_fin_proposee: newEnd,
              jour: dayLabel(newStart),
              date: new Date(newStart).toLocaleDateString("fr-FR", { timeZone: APP_TIME_ZONE }),
              debut: timeLabel(newStart),
              fin: timeLabel(newEnd),
            }
          : p
      )
    );
    flashToast("Nouvelle date enregistrée");
  };

  const handleRefuse = async (id) => {
    const { error } = await supabase
      .from("propositions_rdv")
      .update({ statut: "refuse", date_validation: new Date().toISOString() })
      .eq("id", id)
      .eq("statut", "en_attente");
    if (error) {
      console.error("Erreur refus proposition :", error);
      flashToast("Impossible de refuser la proposition", "error");
      return;
    }
    setPropositions((prev) => prev.filter((p) => p.id !== id));
    setStats((s) => ({ ...s, toValidate: Math.max(0, s.toValidate - 1) }));
    flashToast("Proposition refusée — Nexora peut maintenant rechercher un autre créneau");
  };

  const handleAcceptDevis = async (id) => {
    const { error } = await supabase
      .from("devis")
      .update({ statut: "accepte", date_validation: new Date().toISOString() })
      .eq("id", id)
      .eq("statut", "en_attente");
    if (error) {
      console.error("Erreur acceptation devis :", error);
      flashToast("Impossible de valider ce devis", "error");
      return;
    }
    setDevisList((prev) => prev.filter((d) => d.id !== id));
    flashToast("Devis accepté");
    fetch("http://localhost:5678/webhook/devis-accepte", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ devis_id: id }),
    }).catch(() => console.warn("n8n injoignable — email de confirmation non envoyé au client."));
  };

  const handleRefuseDevis = async (id) => {
    const { error } = await supabase
      .from("devis")
      .update({ statut: "refuse", date_validation: new Date().toISOString() })
      .eq("id", id)
      .eq("statut", "en_attente");
    if (error) {
      console.error("Erreur refus devis :", error);
      flashToast("Impossible de refuser ce devis", "error");
      return;
    }
    setDevisList((prev) => prev.filter((d) => d.id !== id));
    flashToast("Devis refusé");
    fetch("http://localhost:5678/webhook/devis-refuse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ devis_id: id }),
    }).catch(() => console.warn("n8n injoignable — email de refus non envoyé au client."));
  };

  const handleUpdateDevisMontant = async (id, montantHt) => {
    const montantTtc = Math.round(montantHt * 1.2 * 100) / 100;
    const { error } = await supabase
      .from("devis")
      .update({ montant_ht: montantHt, montant_ttc: montantTtc })
      .eq("id", id)
      .eq("statut", "en_attente");
    if (error) {
      console.error("Erreur modification devis :", error);
      flashToast("Impossible de modifier ce devis", "error");
      return;
    }
    setDevisList((prev) => prev.map((d) => (d.id === id ? { ...d, montant_ht: montantHt, montant_ttc: montantTtc } : d)));
    flashToast("Montant du devis mis à jour");
  };

  const handleCreerDevis = async ({ client_id, vehicule_id, prestation_id, montant_ht }) => {
    if (!client_id) {
      flashToast("Sélectionnez un client", "error");
      return;
    }
    const montantTtc = Math.round(Number(montant_ht || 0) * 1.2 * 100) / 100;
    const { data, error } = await supabase
      .from("devis")
      .insert({
        garage_id: ACTIVE_GARAGE_ID,
        client_id,
        vehicule_id: vehicule_id || null,
        prestation_id: prestation_id || null,
        montant_ht: Number(montant_ht || 0),
        montant_ttc: montantTtc,
        statut: "en_attente",
      })
      .select(`*, clients (nom, telephone, email), vehicules (marque, modele, annee, immatriculation), prestations (nom, categorie)`)
      .single();

    if (error) {
      console.error("Erreur création devis :", JSON.stringify(error, null, 2));
      flashToast("Impossible de créer le devis", "error");
      return;
    }

    const formatted = {
      ...data,
      client: data.clients?.nom || "Client inconnu",
      telephone: data.clients?.telephone || "",
      vehicule: `${data.vehicules?.marque || ""} ${data.vehicules?.modele || ""}`.trim(),
      immatriculation: data.vehicules?.immatriculation || "",
      prestation: data.prestations?.nom || "Prestation",
      categorie: data.prestations?.categorie || "diagnostic",
      date: new Date(data.created_at).toLocaleDateString("fr-FR", { timeZone: APP_TIME_ZONE }),
    };
    setDevisList((prev) => [formatted, ...prev]);
    flashToast("Devis créé");
    return formatted;
  };

  const handleResoudreErreur = async (id) => {
    const { error } = await supabase
      .from("erreurs_automatisation")
      .update({ resolu: true })
      .eq("id", id);
    if (error) {
      flashToast("Impossible de marquer comme résolu", "error");
      return;
    }
    setErreurs((prev) => prev.filter((e) => e.id !== id));
    flashToast("Marqué comme résolu");
  };

  const handleGenererFacture = async (rdv) => {
    const prestation = prestations.find((p) => p.id === rdv.prestation_id);
    const prixMainOeuvre = Number(prestation?.prix_ht || 0);
    const lignesInitiales = [
      { type: "main_oeuvre", description: prestation?.nom || "Main d'œuvre", quantite: 1, prix_unitaire_ht: prixMainOeuvre },
    ];
    const montantHt = lignesInitiales.reduce((sum, l) => sum + l.quantite * l.prix_unitaire_ht, 0);
    const montantTtc = Math.round(montantHt * 1.2 * 100) / 100;
    const numero = `F-${new Date().getFullYear()}-${String(factures.length + 1).padStart(4, "0")}`;

    const { data, error } = await supabase
      .from("factures")
      .insert({
        garage_id: ACTIVE_GARAGE_ID,
        client_id: rdv.client_id,
        vehicule_id: rdv.vehicule_id,
        rendez_vous_id: rdv.id,
        devis_id: rdv.devis_id || null,
        numero,
        motif: rdv.notes || rdv.prestation || "",
        lignes: lignesInitiales,
        montant_ht: montantHt,
        montant_ttc: montantTtc,
        statut: "en_attente",
      })
      .select("*, clients (nom, telephone, email), vehicules (marque, modele, immatriculation)")
      .single();

    if (error) {
      console.error("Erreur génération facture :", JSON.stringify(error, null, 2));
      flashToast("Impossible de générer la facture", "error");
      return;
    }
    setFactures((prev) => [data, ...prev]);
    flashToast("Facture générée");
  };

  const handleMarquerFacturePayee = async (id) => {
    const { error } = await supabase
      .from("factures")
      .update({ statut: "payee", date_paiement: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      flashToast("Impossible de marquer comme payée", "error");
      return;
    }
    setFactures((prev) => prev.map((f) => (f.id === id ? { ...f, statut: "payee", date_paiement: new Date().toISOString() } : f)));
    flashToast("Facture marquée payée");
  };

  const handleSauvegarderFacture = async (id, { motif, lignes }) => {
    const montantHt = lignes.reduce((sum, l) => sum + (Number(l.quantite) || 0) * (Number(l.prix_unitaire_ht) || 0), 0);
    const montantTtc = Math.round(montantHt * 1.2 * 100) / 100;
    const { error } = await supabase
      .from("factures")
      .update({ motif, lignes, montant_ht: montantHt, montant_ttc: montantTtc })
      .eq("id", id);
    if (error) {
      console.error("Erreur sauvegarde facture :", JSON.stringify(error, null, 2));
      flashToast("Impossible d'enregistrer la facture", "error");
      return;
    }
    setFactures((prev) => prev.map((f) => (f.id === id ? { ...f, motif, lignes, montant_ht: montantHt, montant_ttc: montantTtc } : f)));
    flashToast("Facture mise à jour");
  };

  const handleCreateProposal = async ({ demande, prestation, date, time, message }) => {
    const start = new Date(`${date}T${time}:00`);
    const duration = Number(prestation?.duree_minutes || prestation?.duree_min || 60);
    const end = new Date(start.getTime() + duration * 60_000);
    setSubmittingProposal(true);
    try {
      const { data: conflicts, error: conflictError } = await supabase
        .from("rendez_vous")
        .select("id")
        .eq("garage_id", ACTIVE_GARAGE_ID)
        .lt("date_debut", end.toISOString())
        .gt("date_fin", start.toISOString())
        .limit(1);
      if (conflictError) throw conflictError;
      if (conflicts?.length) {
        flashToast("Ce créneau est déjà occupé. Choisissez une autre heure.", "error");
        return;
      }

      const { data, error } = await supabase
        .from("propositions_rdv")
        .insert({
          garage_id: ACTIVE_GARAGE_ID,
          demande_id: demande.id,
          client_id: demande.client_id,
          vehicule_id: demande.vehicule_id,
          prestation_id: prestation.id,
          date_debut_proposee: start.toISOString(),
          date_fin_proposee: end.toISOString(),
          statut: "en_attente",
        })
        .select("*, clients (nom, telephone), vehicules (marque, modele, immatriculation), prestations (nom, categorie), demandes (message_original)")
        .single();
      if (error) throw error;

      const formatted = {
        ...data,
        client: data.clients?.nom || demande.clients?.nom || "Client inconnu",
        telephone: data.clients?.telephone || demande.clients?.telephone || "",
        vehicule: `${data.vehicules?.marque || demande.vehicules?.marque || ""} ${data.vehicules?.modele || demande.vehicules?.modele || ""}`.trim(),
        immatriculation: data.vehicules?.immatriculation || "",
        prestation: data.prestations?.nom || prestation.nom,
        categorie: data.prestations?.categorie || prestation.categorie || "diagnostic",
        message,
        jour: dayLabel(data.date_debut_proposee),
        debut: timeLabel(data.date_debut_proposee),
        fin: timeLabel(data.date_fin_proposee),
        duree: duration,
      };
      setPropositions((prev) => [formatted, ...prev]);
      setStats((s) => ({ ...s, toValidate: s.toValidate + 1 }));
      setSelectedDemande(null);
      flashToast("Proposition créée — prête à être envoyée par votre workflow n8n");
    } catch (error) {
      console.error("Erreur création proposition :", error);
      flashToast("La proposition n’a pas pu être créée", "error");
    } finally {
      setSubmittingProposal(false);
    }
  };

  const handleRecommendedAppointment = (demande) => {
    const matchedPrestation = prestations.find((prestation) => {
      const needle = `${demande.type_demande || ""} ${demande.message_original || ""}`.toLowerCase();
      return needle.includes(prestation.nom?.toLowerCase());
    }) || prestations[0];
    const slot = findSuggestedSlot(rendezVous, Number(matchedPrestation?.duree_minutes || matchedPrestation?.duree_min || 60));
    setSelectedDemande({
      ...demande,
      suggested_prestation_id: matchedPrestation?.id,
      suggested_date: slot.date,
      suggested_time: slot.time,
    });
  };

  const updateGarageField = (field, value) => setGarageData((previous) => ({ ...previous, [field]: value }));

  const saveGarageSettings = async () => {
    setSavingSettings(true);
    const update = {
      nom: garageData.nom,
      ville: garageData.ville,
      logo_url: garageData.logo_url || null,
      horaire_ouverture: garageData.horaire_ouverture,
      horaire_fermeture: garageData.horaire_fermeture,
      horaires: garageData.horaires,
      nb_mecaniciens: garageData.nb_mecaniciens,
      notifications_email: garageData.notifications_email,
      notifications_sms: garageData.notifications_sms,
    };
    const { error } = await supabase.from("garages").update(update).eq("id", ACTIVE_GARAGE_ID);
    setSavingSettings(false);
    if (error) {
      console.error("Erreur enregistrement garage :", error);
      flashToast("Les paramètres n’ont pas pu être enregistrés", "error");
      return;
    }
    flashToast("Paramètres du garage enregistrés");
  };

  const addPrestation = async (prestation) => {
    const { data, error } = await supabase.from("prestations").insert({ ...prestation, garage_id: ACTIVE_GARAGE_ID }).select().single();
    if (error) {
      console.error("Erreur ajout prestation :", error);
      flashToast("Impossible d’ajouter la prestation", "error");
      return;
    }
    setPrestations((previous) => [...previous, data]);
    flashToast("Prestation ajoutée au catalogue");
  };

  const deletePrestation = async (id) => {
    if (!window.confirm("Supprimer cette prestation du catalogue ?")) return;
    const { error } = await supabase.from("prestations").delete().eq("id", id).eq("garage_id", ACTIVE_GARAGE_ID);
    if (error) {
      console.error("Erreur suppression prestation :", error);
      flashToast("Impossible de supprimer la prestation", "error");
      return;
    }
    setPrestations((previous) => previous.filter((prestation) => prestation.id !== id));
    flashToast("Prestation supprimée");
  };

  const connectGoogleCalendar = () => {
    const connectUrl = process.env.NEXT_PUBLIC_GOOGLE_CALENDAR_CONNECT_URL;
    if (connectUrl) {
      window.open(connectUrl, "_blank", "noopener,noreferrer");
      return;
    }
    flashToast("Ajoutez NEXT_PUBLIC_GOOGLE_CALENDAR_CONNECT_URL après avoir configuré l’autorisation Google dans n8n", "error");
  };

  const titles = {
    dashboard: "Dashboard",
    atelier: "Atelier en direct",
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
              <div className="text-[13px] font-medium text-white">{garageData.nom}</div>
              <div className="text-[11.5px]" style={{ color: "#8CA0C9" }}>{garageData.ville}</div>
            </div>
          </div>
        </div>
      </aside>
{selectedDemande && (
  <ProposerRdvModal
  demande={selectedDemande}
  prestations={prestations}
  onClose={() => setSelectedDemande(null)}
  onSubmit={handleCreateProposal}
  submitting={submittingProposal}
  garageData={garageData}
/>
)}
      <main className="flex-1 min-w-0">
        <div className="flex items-center justify-between px-5 md:px-8 py-5 border-b border-slate-200 bg-white">
          <div>
            <div className="text-lg font-semibold text-slate-900">{titles[view]}</div>
            <div className="text-[13px] text-slate-500">{garageData.nom}</div>
          </div>
        </div>

        <div className="p-5 md:p-8">
          {view === "dashboard" && <DashboardView stats={stats} propositions={propositions} setView={setView} onSelectAppt={setSelectedAppt} loading={loading} rendezVous={rendezVous} demandes={demandes} clients={clients} garageData={garageData} aiStats={aiStats} timeline={activityTimeline} automationEvents={automationEvents} factures={factures} devisList={devisList} />}
          {view === "atelier" && <AtelierView rendezVous={rendezVous} onSelectAppt={setSelectedAppt} garageData={garageData} />}
          {view === "valider" && <ValiderView propositions={propositions} onAccept={handleAccept} onRefuse={handleRefuse} onReschedule={handleReschedule} garageId={ACTIVE_GARAGE_ID} />}
          {view === "devis" && <DevisView devisList={devisList} clients={clients} prestations={prestations} onAccept={handleAcceptDevis} onRefuse={handleRefuseDevis} onUpdateMontant={handleUpdateDevisMontant} onCreer={handleCreerDevis} />}
          {view === "verifier" && <ErreursView erreurs={erreurs} onResoudre={handleResoudreErreur} />}
          {view === "factures" && <FacturesView rendezVous={rendezVous} factures={factures} prestations={prestations} garageData={garageData} onGenerer={handleGenererFacture} onMarquerPayee={handleMarquerFacturePayee} onSauvegarder={handleSauvegarderFacture} />}
          {view === "agenda" && <AgendaView onSelectAppt={setSelectedAppt} rendezVous={rendezVous} garageData={garageData} onConnectCalendar={connectGoogleCalendar} />}
          {view === "demandes" && (
            <DemandesView
              demandes={demandes}
              onSelectDemande={setSelectedDemande}
              onRecommend={handleRecommendedAppointment}
            />
          )}
          {view === "clients" && <ClientsView clients={clients} rendezVous={rendezVous} prestations={prestations} onCreerDevis={handleCreerDevis} onToast={flashToast} />}
          {view === "parametres" && <ParametresView garageData={garageData} onGarageChange={updateGarageField} onSave={saveGarageSettings} prestations={prestations} onAddPrestation={addPrestation} onDeletePrestation={deletePrestation} saving={savingSettings} />}
        </div>
      </main>

      <Toast toast={toast} />
      <ApptDetailModal appt={selectedAppt} onClose={() => setSelectedAppt(null)} />
    </div>
  );
}

function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setError("Email ou mot de passe incorrect.");
      return;
    }
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: BG }}>
      <style>{`
        .nexora-login-field { color: #0F1B33 !important; background: #ffffff !important; -webkit-text-fill-color: #0F1B33 !important; }
        .nexora-login-field::placeholder { color: #94A3B8 !important; opacity: 1 !important; }
        .nexora-login-field:-webkit-autofill { -webkit-box-shadow: 0 0 0 1000px #ffffff inset !important; -webkit-text-fill-color: #0F1B33 !important; }
      `}</style>
      <form onSubmit={handleSubmit} style={{ background: "#fff", padding: 32, borderRadius: 12, width: 320, boxShadow: "0 4px 24px rgba(0,0,0,0.08)" }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: NAVY, marginBottom: 4 }}>Nexora</h1>
        <p style={{ fontSize: 13, color: "#64748B", marginBottom: 20 }}>Connexion a votre espace garage</p>
        <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#334155", marginBottom: 4 }}>Email</label>
        <input
          type="email"
          placeholder="vous@exemple.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
          className="nexora-login-field"
          style={{ width: "100%", padding: "10px 12px", marginBottom: 14, border: "1px solid #E2E8F0", borderRadius: 8, fontSize: 14 }}
        />
        <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#334155", marginBottom: 4 }}>Mot de passe</label>
        <input
          type="password"
          placeholder="********"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="current-password"
          className="nexora-login-field"
          style={{ width: "100%", padding: "10px 12px", marginBottom: 14, border: "1px solid #E2E8F0", borderRadius: 8, fontSize: 14 }}
        />
        {error && <p style={{ color: "#DC2626", fontSize: 13, marginBottom: 10 }}>{error}</p>}
        <button
          type="submit"
          disabled={loading}
          style={{ width: "100%", padding: "10px 12px", background: ACCENT, color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, fontSize: 14, cursor: "pointer" }}
        >
          {loading ? "Connexion..." : "Se connecter"}
        </button>
      </form>
    </div>
  );
}

export default function NexoraDashboard() {
  const [session, setSession] = useState(undefined);
  const [garageReady, setGarageReady] = useState(false);
  const [garageError, setGarageError] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setGarageReady(false);
      setGarageError("");
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    supabase
      .from("garages")
      .select("id")
      .eq("owner_user_id", session.user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || !data) {
          setGarageError("Aucun garage n'est associe a ce compte. Contactez le support Nexora.");
          return;
        }
        ACTIVE_GARAGE_ID = data.id;
        setGarageReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [session]);

  if (session === undefined) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "#64748B" }}>
        Chargement...
      </div>
    );
  }
  if (!session) {
    return <LoginScreen />;
  }
  if (garageError) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "#DC2626", padding: 24, textAlign: "center" }}>
        {garageError}
      </div>
    );
  }
  if (!garageReady) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "#64748B" }}>
        Chargement...
      </div>
    );
  }
  return <NexoraDashboardInner />;
}
