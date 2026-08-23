
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
  Menu,
  ChevronLeft,
  ChevronRight,
  Gauge,
  MessageSquare,
  MapPin,
  Wrench,
  Sparkles,
  Bot,
  Globe,
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
  { key: "attente_piece", label: "Attente pièce", color: "#EA580C" },
  { key: "intervention", label: "En intervention", color: "#0F766E" },
  { key: "pret", label: "Prêt", color: "#16A34A" },
  { key: "restitue", label: "Restitué", color: "#475569" },
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
  const time = new Intl.DateTimeFormat("fr-FR", { timeZone: APP_TIME_ZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(now);
  const horaires = garageData.horaires && typeof garageData.horaires === "object" ? garageData.horaires : null;
  if (horaires) {
    const dayIndex = { Mon: "1", Tue: "2", Wed: "3", Thu: "4", Fri: "5", Sat: "6", Sun: "7" }[localDay];
    const plages = Array.isArray(horaires[dayIndex]) ? horaires[dayIndex] : [];
    if (plages.length === 0) return { open: false, label: "Fermé aujourd’hui" };
    if (plages.some(([debut, fin]) => debut <= time && time < fin)) return { open: true, label: "Ouvert maintenant" };
    const prochaine = plages.find(([debut]) => time < debut);
    return { open: false, label: prochaine ? `Ouvre à ${prochaine[0]}` : "Fermé actuellement" };
  }
  if (["Sat", "Sun"].includes(localDay)) return { open: false, label: "Fermé aujourd’hui" };
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

const RDV_STATUS_LABEL = { confirme: "Confirmé", en_attente: "En attente", termine: "Terminé", annule: "Annulé", absent: "Absent" };
const STATUT_TONE = { "Confirmé": "green", "En attente": "amber", "Terminé": "slate", "Annulé": "red", "Absent": "red" };
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


const navGroups = [
  {
    label: "Vue d'ensemble",
    items: [
      { key: "dashboard", label: "Dashboard", icon: Home },
      { key: "atelier", label: "Atelier en direct", icon: Wrench },
      { key: "agenda", label: "Agenda", icon: Calendar },
    ],
  },
  {
    label: "À traiter",
    items: [
      { key: "valider", label: "Rendez-vous à valider", icon: Clock },
      { key: "devis", label: "Devis", icon: ReceiptText },
      { key: "demandes", label: "Demandes clients", icon: Inbox },
    ],
  },
  {
    label: "Gestion",
    items: [
      { key: "clients", label: "Clients", icon: Users },
      { key: "factures", label: "Factures", icon: CircleDollarSign },
    ],
  },
  {
    label: "Système",
    items: [
      { key: "verifier", label: "À vérifier", icon: AlertTriangle },
      { key: "parametres", label: "Paramètres", icon: Settings },
    ],
  },
];
const navItems = navGroups.flatMap((g) => g.items);

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

function StatCard({ label, value, icon: Icon, note }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 flex items-start justify-between shadow-sm">
      <div>
        <div className="text-slate-500 text-[13px] font-medium">{label}</div>
        <div className="text-2xl font-semibold text-slate-900 mt-1.5">{value}</div>
        {note && <div className="text-[11.5px] text-slate-400 mt-0.5">{note}</div>}
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
    <div className="w-10 h-6 rounded-full flex items-center px-0.5 shrink-0" style={{ backgroundColor: checked ? ACCENT : "#E2E8F0" }}>
      <div className="w-5 h-5 rounded-full bg-white shadow-sm transition-transform" style={{ transform: checked ? "translateX(16px)" : "translateX(0)" }} />
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
function WorkshopTimeline({ rendezVous, onSelectAppt, mecaniciens = [], compact = false }) {
  const grouped = WORKSHOP_STAGES.map((stage) => ({
    ...stage,
    appointments: rendezVous
      .filter((r) => (r.statut_atelier || "a_venir") === stage.key && isToday(r.date_debut))
      .sort((a, b) => (a.debut || "").localeCompare(b.debut || "")),
  }));
  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
      <div className="px-5 py-4 flex items-center justify-between border-b border-slate-100"><div><div className="font-semibold text-slate-900 text-[15px]">Flux atelier en direct</div><div className="text-[12.5px] text-slate-500 mt-0.5">Chaque véhicule est visible, de son arrivée à sa restitution.</div></div><Badge tone="green">{grouped.reduce((sum, stage) => sum + stage.appointments.length, 0)} véhicules suivis</Badge></div>
          <div className={`grid grid-cols-1 ${compact ? "md:grid-cols-3" : "xl:grid-cols-8"} gap-px bg-slate-200`}>
        {grouped.map((stage, index) => <div key={stage.key} className="bg-white min-h-[150px] p-3">
          <div className="flex items-center justify-between gap-2 mb-3"><div className="flex items-center gap-1.5 text-[12px] font-semibold" style={{ color: stage.color }}><span className="w-2 h-2 rounded-full" style={{ backgroundColor: stage.color }} />{stage.label}</div><span className="text-[11px] text-slate-400">{stage.appointments.length}</span></div>
          <div className="space-y-2 max-h-[190px] overflow-y-auto pr-1">{stage.appointments.length === 0 ? <div className="text-[11.5px] text-slate-300 pt-3">Aucun véhicule</div> : stage.appointments.map((appt) => {
            const mecanicien = mecaniciens.find((m) => m.id === appt.mecanicien_id);
            return <button key={appt.id} onClick={() => onSelectAppt(appt)} className="w-full text-left rounded-lg p-2 hover:bg-slate-50 border border-slate-100">
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: mecanicien?.couleur || "#CBD5E1" }} />
                <div className="text-[12px] font-medium text-slate-800 truncate">{appt.client}</div>
              </div>
              <div className="text-[11px] text-slate-500 truncate">{appt.vehicule}</div>
              <div className="flex items-center justify-between mt-1">
                <span className="text-[11px] font-medium" style={{ color: stage.color }}>{appt.debut}</span>
                <span className="text-[10px] text-slate-400 truncate max-w-[70px]">{mecanicien?.nom || "Non assigné"}</span>
              </div>
            </button>;
          })}</div>
          {index < grouped.length - 1 && !compact && <ArrowRight size={14} className="hidden xl:block absolute" />}
        </div>)}
      </div>
    </div>
  );
}

function LienPaiementField({ appt, onSave }) {
  const [value, setValue] = useState(appt.lien_paiement || "");
  return (
    <label className="block mt-3">
      <span className="text-[12.5px] font-medium text-slate-500">Lien de paiement</span>
      <div className="mt-1.5 flex gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="https://..."
          className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500"
        />
        <button
          type="button"
          onClick={() => onSave(appt.id, value.trim() || null)}
          className="px-3 py-2 rounded-xl text-sm font-semibold text-white"
          style={{ backgroundColor: ACCENT }}
        >
          Enregistrer
        </button>
      </div>
    </label>
  );
}

function ApptDetailModal({ appt, onClose, mecaniciens = [], onAssignMecanicien, onUpdateStatutAtelier, onUpdateLienPaiement }) {
  if (!appt) return null;

  const client = appt.client;
  const vehicule = appt.vehicule;
  const colors = catColor(appt.categorie);
  const currentStage = WORKSHOP_STAGES.find((s) => s.key === (appt.statut_atelier || "a_venir")) || WORKSHOP_STAGES[0];
  const estAujourdhui = appt.date_debut ? isToday(appt.date_debut) : false;
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
        <div className="text-sm text-slate-500">{vehicule} · {appt.immatriculation}</div>
        {onUpdateStatutAtelier && (
          <label className="block mt-3">
            <select
              value={appt.statut_atelier || "a_venir"}
              onChange={(e) => onUpdateStatutAtelier(appt.id, e.target.value)}
              className="w-full rounded-xl border-2 px-3 py-2.5 text-sm font-semibold outline-none"
              style={{ borderColor: currentStage.color, color: currentStage.color, backgroundColor: `${currentStage.color}14` }}
            >
              {WORKSHOP_STAGES.map((stage) => <option key={stage.key} value={stage.key}>{stage.label}</option>)}
            </select>
          </label>
        )}
        {onUpdateLienPaiement && <LienPaiementField key={appt.id} appt={appt} onSave={onUpdateLienPaiement} />}
        <div className="mt-4 space-y-2.5">
          <div className="flex items-center gap-2 text-sm text-slate-700"><Clock size={15} className="text-slate-400" /> {appt.debut} – {appt.fin}</div>
          <div className="flex items-center gap-2 text-sm">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: colors.bar }} />
            <span style={{ color: colors.text }} className="font-medium">{appt.prestation}</span>
            <span className="text-slate-400">· {colors.label}</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-slate-700">
          <Phone size={15} className="text-slate-400" /> {formatPhone(appt.telephone)}
          </div>
          {onAssignMecanicien && <label className="block pt-2"><span className="text-[12.5px] font-medium text-slate-500">Mécanicien</span><select value={appt.mecanicien_id || ""} onChange={(e) => onAssignMecanicien(appt.id, e.target.value || null)} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500"><option value="">Non assigné</option>{mecaniciens.filter((m) => m.actif !== false).map((m) => <option key={m.id} value={m.id}>{m.nom}</option>)}</select></label>}
        </div>
        {estAujourdhui && (
          <div className="mt-4 flex items-center gap-3 bg-slate-50 rounded-xl p-3">
            <img src={`https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(`https://nexora-uig6.vercel.app/atelier/${appt.id}`)}`} alt="QR code atelier" className="w-[70px] h-[70px] rounded-lg bg-white p-1" />
            <div className="text-[12px] text-slate-500">QR à imprimer et coller sur le véhicule pour que le mécanicien mette à jour l'étape sans passer par le dashboard.</div>
          </div>
        )}
      </div>
    </div>
  );
}

function AtelierView({ rendezVous, onSelectAppt, garageData, mecaniciens = [] }) {
  const todayAppts = rendezVous.filter((r) => isToday(r.date_debut));
  const mecaniciensActifs = mecaniciens.filter((m) => m.actif !== false);
  const resourceAppointments = (resourceId) => todayAppts.filter((appt) => (resourceId === null ? !appt.mecanicien_id : appt.mecanicien_id === resourceId));
  const ressources = [...mecaniciensActifs.map((m) => ({ id: m.id, name: m.nom, role: "Mécanicien", color: m.couleur || "#3D6BE0" })), { id: null, name: "Non assigné", role: "", color: "#94A3B8" }];
    return <div className="space-y-5">
    <div className="print:hidden rounded-2xl overflow-hidden p-5 text-white relative" style={{ backgroundColor: NAVY }}><div className="absolute -right-10 -top-10 w-44 h-44 rounded-full bg-blue-500/20" /><div className="relative flex items-start justify-between flex-wrap gap-4"><div><div className="flex items-center gap-2"><Wrench size={18} color="#8FB0FF" /><span className="font-semibold">Atelier en direct</span></div><div className="text-2xl font-semibold mt-3">Votre équipe sait quoi faire, maintenant.</div><div className="text-[13px] mt-1 text-blue-200">Répartissez les véhicules, suivez les retards et gardez le client informé.</div><button onClick={() => setTimeout(() => window.print(), 600)} className="mt-3 inline-flex items-center gap-2 bg-white/10 hover:bg-white/20 rounded-xl px-3 py-2 text-[12.5px] font-medium">🖨️ Imprimer les étiquettes du jour</button></div><div className="grid grid-cols-2 gap-2"><div className="bg-white/10 rounded-xl p-3"><div className="text-[11px] text-blue-200">Véhicules aujourd’hui</div><div className="text-xl font-semibold mt-1">{todayAppts.length}</div></div><div className="bg-white/10 rounded-xl p-3"><div className="text-[11px] text-blue-200">Équipe disponible</div><div className="text-xl font-semibold mt-1">{garageData.nb_mecaniciens || 0}</div></div></div></div></div>
        <div className="print:hidden">
    <WorkshopTimeline rendezVous={rendezVous} onSelectAppt={onSelectAppt} mecaniciens={mecaniciensActifs} />
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden"><div className="px-5 py-4 border-b border-slate-100"><div className="font-semibold text-slate-900 text-[15px]">Planning des ressources</div><div className="text-[12.5px] text-slate-500 mt-0.5">Cliquez un rendez-vous pour l’affecter à un mécanicien.</div></div><div className="overflow-x-auto"><div className="min-w-[850px]"><div className="grid grid-cols-[180px_repeat(10,minmax(65px,1fr))] border-b border-slate-100">{["Ressource", ...heuresGrille].map((hour) => <div key={hour} className="px-3 py-2 text-[11px] font-medium text-slate-400 border-r border-slate-100">{hour}</div>)}</div>{mecaniciensActifs.length === 0 && <div className="px-5 py-6 text-[13px] text-slate-500">Ajoutez vos mécaniciens dans Paramètres pour affecter les rendez-vous.</div>}{ressources.map((resource) => { const assigned = resourceAppointments(resource.id); return <div key={resource.id ?? "non_assigne"} className="grid grid-cols-[180px_repeat(10,minmax(65px,1fr))] min-h-[74px] border-b border-slate-100 last:border-0"><div className="px-3 py-3 border-r border-slate-100"><div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: resource.color }} /><div><div className="text-[12.5px] font-medium text-slate-800">{resource.name}</div><div className="text-[11px] text-slate-400">{resource.role}</div></div></div></div><div className="col-span-10 relative p-1.5" style={{ minHeight: 58 }}>{assigned.map((appt) => {
              const stage = WORKSHOP_STAGES.find((s) => s.key === (appt.statut_atelier || "a_venir")) || WORKSHOP_STAGES[0];
              const [h1, m1] = (appt.debut || "08:00").split(":").map(Number);
              const [h2, m2] = (appt.fin || appt.debut || "09:00").split(":").map(Number);
              const debutPct = Math.min(100, Math.max(0, ((h1 * 60 + m1) - 8 * 60) / (10 * 60) * 100));
              const finPct = Math.min(100, Math.max(0, ((h2 * 60 + m2) - 8 * 60) / (10 * 60) * 100));
              const largeurPct = Math.max(6, finPct - debutPct);
              return <button key={appt.id} onClick={() => onSelectAppt(appt)} className="absolute top-1.5 h-[58px] px-2 rounded-lg text-left overflow-hidden" style={{ left: `${debutPct}%`, width: `${largeurPct}%`, backgroundColor: `${resource.color}1A`, borderLeft: `3px solid ${resource.color}` }}>
                <div className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: stage.color }} />
                  <div className="text-[11px] font-semibold truncate" style={{ color: resource.color }}>{appt.client}</div>
                </div>
                <div className="text-[10.5px] text-slate-500 truncate">{appt.prestation}</div>
                <div className="text-[9.5px] truncate" style={{ color: stage.color }}>{stage.label}</div>
              </button>;
            })}</div></div>; })}</div></div></div>
    </div>
    <style>{`
      @media print {
        body * { visibility: hidden; }
        #nexora-print-labels, #nexora-print-labels * { visibility: visible; }
        #nexora-print-labels { display: block !important; position: absolute; left: 0; top: 0; width: 100%; }
      }
    `}</style>
    <div id="nexora-print-labels" className="hidden">
            {todayAppts.map((appt, index) => (
        <div key={appt.id} style={{ pageBreakAfter: index < todayAppts.length - 1 ? "always" : "auto", padding: 24, border: `3px solid ${catColor(appt.categorie).bar}`, borderRadius: 16, marginBottom: 16 }}>
          <div style={{ fontSize: 28, fontWeight: 700 }}>{appt.client}</div>
          <div style={{ fontSize: 20, marginTop: 8 }}>{appt.vehicule} · {appt.immatriculation}</div>
          <div style={{ fontSize: 16, color: "#64748B", marginTop: 4 }}>{appt.debut} – {appt.fin} · {appt.prestation}</div>
          <img src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(`https://nexora-uig6.vercel.app/atelier/${appt.id}`)}`} style={{ marginTop: 16 }} />
        </div>
      ))}
    </div>
  </div>;
}

// =====================================================================================
// VIEWS
// =====================================================================================
function DashboardView({ stats, propositions, setView, onSelectAppt, loading, rendezVous, demandes, clients, garageData, aiStats, timeline, automationEvents, factures = [], devisList = [], prestations = [] }) {
  const [periode, setPeriode] = useState("30j");

  if (loading) {
    return (
      <div className="space-y-6">
        <SkeletonCard h="h-24" />
        <SkeletonCard h="h-28" />
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <SkeletonCard h="h-24" /><SkeletonCard h="h-24" /><SkeletonCard h="h-24" /><SkeletonCard h="h-24" />
        </div>
        <SkeletonCard h="h-72" />
        <SkeletonCard h="h-32" />
      </div>
    );
  }

  const now = new Date();
  const todayKey = dateKey(now);
  const upcomingAppts = [...rendezVous]
    .filter((r) => new Date(r.date_fin) >= now)
    .sort((a, b) => new Date(a.date_debut) - new Date(b.date_debut));
  const todayAppts = upcomingAppts.filter((r) => r.date_key === todayKey);

  const prestationById = Object.fromEntries(prestations.map((p) => [p.id, p]));
  const rdvById = Object.fromEntries(rendezVous.map((r) => [r.id, r]));

  // ---- File de priorites unifiee -------------------------------------------------
  const oneYearAgo = new Date(now);
  oneYearAgo.setFullYear(now.getFullYear() - 1);
  const dormantClients = clients.filter((client) => {
    if (!client.fidele) return false;
    const last = rendezVous.filter((rdv) => rdv.client_id === client.id && rdv.statut === "Terminé").sort((a, b) => new Date(b.date_debut) - new Date(a.date_debut))[0];
    return !last || new Date(last.date_debut) < oneYearAgo;
  });
  const technicalControl = clients.filter((client) => {
    const vehicles = Array.isArray(client.vehicules) ? client.vehicules : client.vehicules ? [client.vehicules] : [];
    return vehicles.some((vehicle) => vehicle.controle_technique_echeance && new Date(vehicle.controle_technique_echeance) <= new Date(now.getTime() + 45 * 86_400_000));
  });
  const potentielPropositions = propositions.reduce((sum, p) => sum + Number(prestationById[p.prestation_id]?.prix_ht || 0), 0);
  const urgentRequests = stats.urgent || 0;

  const priorityItems = [];
  if (propositions.length) {
    priorityItems.push({
      key: "propositions",
      weight: 4,
      label: `${propositions.length} proposition${propositions.length > 1 ? "s" : ""} de rendez-vous à valider`,
      note: potentielPropositions ? `${potentielPropositions.toFixed(0)}€ potentiels` : "En attente de validation",
      action: "Traiter",
      target: "valider",
    });
  }
  if (urgentRequests) {
    priorityItems.push({
      key: "urgentes",
      weight: 5,
      label: `${urgentRequests} demande${urgentRequests > 1 ? "s" : ""} urgente${urgentRequests > 1 ? "s" : ""}`,
      note: "À traiter en priorité",
      action: "Voir",
      target: "demandes",
    });
  }
  if (technicalControl.length) {
    priorityItems.push({
      key: "controle_technique",
      weight: 2,
      label: `${technicalControl.length} contrôle${technicalControl.length > 1 ? "s" : ""} technique${technicalControl.length > 1 ? "s" : ""} proche${technicalControl.length > 1 ? "s" : ""}`,
      note: "Échéance dans les 45 jours",
      action: "Voir",
      target: "clients",
    });
  }
  if (dormantClients.length) {
    priorityItems.push({
      key: "clients_fideles",
      weight: 1,
      label: `${dormantClients.length} client${dormantClients.length > 1 ? "s" : ""} fidèle${dormantClients.length > 1 ? "s" : ""} à rappeler`,
      note: "Aucune visite depuis 12 mois",
      action: "Voir",
      target: "clients",
    });
  }
  priorityItems.sort((a, b) => b.weight - a.weight);

  // ---- Revenus & Performance -----------------------------------------------------
  const periodeDays = { "7j": 7, "30j": 30, "12mois": 365 }[periode];
  const periodeStart = new Date(now.getTime() - periodeDays * 86_400_000);
  const facturesPeriode = factures.filter((f) => new Date(f.created_at) >= periodeStart);

  const debutMoisCourant = new Date(now.getFullYear(), now.getMonth(), 1);
  const debutMoisPrecedent = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const facturesMoisCourant = factures.filter((f) => new Date(f.created_at) >= debutMoisCourant);
  const facturesMoisPrecedent = factures.filter((f) => { const d = new Date(f.created_at); return d >= debutMoisPrecedent && d < debutMoisCourant; });
  const caMoisCourant = facturesMoisCourant.reduce((s, f) => s + Number(f.montant_ttc || 0), 0);
  const caMoisPrecedent = facturesMoisPrecedent.reduce((s, f) => s + Number(f.montant_ttc || 0), 0);
  const evolutionCA = caMoisPrecedent > 0 ? Math.round(((caMoisCourant - caMoisPrecedent) / caMoisPrecedent) * 100) : null;

  const panierMoyen = facturesPeriode.length ? Math.round(facturesPeriode.reduce((s, f) => s + Number(f.montant_ttc || 0), 0) / facturesPeriode.length) : 0;

  const devisPeriode = devisList.filter((d) => new Date(d.created_at) >= periodeStart);
  const devisAcceptes = devisPeriode.filter((d) => d.statut === "accepte").length;
  const devisRefuses = devisPeriode.filter((d) => d.statut === "refuse").length;
  const tauxConversion = devisAcceptes + devisRefuses > 0 ? Math.round((devisAcceptes / (devisAcceptes + devisRefuses)) * 100) : null;

  const rdvPeriode = rendezVous.filter((r) => { const d = new Date(r.date_debut); return d >= periodeStart && d <= now; });
  const rdvFactures = facturesPeriode.length;
  const rdvAbsents = rdvPeriode.filter((r) => r.statut === "Absent").length;
  const tauxNoShow = rdvPeriode.length ? Math.round((rdvAbsents / rdvPeriode.length) * 100) : null;

  const caParPrestation = {};
  facturesPeriode.forEach((f) => {
    const rdv = rdvById[f.rendez_vous_id];
    const nom = rdv?.prestation || f.motif || "Autre";
    caParPrestation[nom] = (caParPrestation[nom] || 0) + Number(f.montant_ttc || 0);
  });
  const topPrestations = Object.entries(caParPrestation).sort((a, b) => b[1] - a[1]).slice(0, 3);

  const sevenDaysAgo = new Date(now.getTime() - 7 * 86_400_000);
  const caParJour = {};
  factures.filter((f) => new Date(f.created_at) >= sevenDaysAgo).forEach((f) => {
    const jour = new Date(f.created_at).toLocaleDateString("fr-FR", { weekday: "long", timeZone: APP_TIME_ZONE });
    const entry = caParJour[jour] || { total: 0, count: 0 };
    entry.total += Number(f.montant_ttc || 0);
    entry.count += 1;
    caParJour[jour] = entry;
  });
  const meilleurJour = Object.entries(caParJour).sort((a, b) => b[1].total - a[1].total)[0];

  const nbPoints = periode === "12mois" ? 12 : periodeDays;
  const serie = Array.from({ length: nbPoints }, (_, index) => {
    if (periode === "12mois") {
      const moisDebut = new Date(now.getFullYear(), now.getMonth() - (11 - index), 1);
      const moisFin = new Date(now.getFullYear(), now.getMonth() - (11 - index) + 1, 1);
      return factures.filter((f) => { const d = new Date(f.created_at); return d >= moisDebut && d < moisFin; }).reduce((s, f) => s + Number(f.montant_ttc || 0), 0);
    }
    const jourDebut = new Date(periodeStart.getTime() + index * 86_400_000);
    const jourFin = new Date(jourDebut.getTime() + 86_400_000);
    return factures.filter((f) => { const d = new Date(f.created_at); return d >= jourDebut && d < jourFin; }).reduce((s, f) => s + Number(f.montant_ttc || 0), 0);
  });
  const chartWidth = 1040;
  const chartHeight = 180;
  const maxSerie = Math.max(1, ...serie);
  const stepX = serie.length > 1 ? chartWidth / (serie.length - 1) : chartWidth;
  const points = serie.map((v, index) => [index * stepX, chartHeight - (v / maxSerie) * (chartHeight - 20)]);
  const linePath = points.map(([x, y], index) => `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L${chartWidth},${chartHeight} L0,${chartHeight} Z`;
  const hasChartData = serie.some((v) => v > 0);

  const objectif = Number(garageData.objectif_ca_mensuel || 0);
  const progressionObjectif = objectif > 0 ? Math.min(100, Math.round((caMoisCourant / objectif) * 100)) : null;

  // ---- Nexora Intelligence --------------------------------------------------------
  const heuresEconomisees = Math.floor(aiStats.tempsEconomiseMin / 60);
  const minutesEconomisees = aiStats.tempsEconomiseMin % 60;
  const valeurRecuperee = Math.round((aiStats.tempsEconomiseMin / 60) * aiStats.tarifHoraireAdmin);
  const automationEventsToday = automationEvents.filter((event) => isToday(event.created_at));
  const smsAujourdhui = automationEventsToday.filter((event) => event.type === "sms").length;
  const emailAujourdhui = automationEventsToday.filter((event) => event.type === "email").length;
  const recentActivities = timeline.slice(0, 3);

  return (
    <div className="space-y-6">
      <GarageIdentityCard garageData={garageData} />

      {priorityItems.length > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 overflow-hidden">
          <div className="px-5 pt-4 pb-2 flex items-center gap-2.5">
            <AlertTriangle size={17} className="text-amber-700" />
            <div className="text-sm font-semibold text-amber-950">À traiter en priorité</div>
          </div>
          <div>
            {priorityItems.map((item) => (
              <div key={item.key} className="flex items-center justify-between gap-4 px-5 py-3 border-t border-amber-200/60">
                <div className="min-w-0">
                  <div className="text-[13.5px] font-medium text-amber-950">{item.label}</div>
                  <div className="text-[12.5px] text-amber-800">{item.note}</div>
                </div>
                <button onClick={() => setView(item.target)} className="shrink-0 text-[13px] font-semibold px-4 py-2 rounded-xl bg-white border border-amber-200 text-amber-800">{item.action}</button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <StatCard label="Demandes en attente" value={stats.pending} icon={Inbox} />
        <StatCard label="RDV à valider" value={stats.toValidate} icon={Clock} note={potentielPropositions ? `${potentielPropositions.toFixed(0)}€ potentiels` : null} />
        <StatCard label="RDV aujourd'hui" value={todayAppts.length} icon={Calendar} />
        <StatCard label="Clients" value={stats.clients} icon={Users} />
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <div className="font-semibold text-slate-900 text-[15px]">Revenus & Performance</div>
            <div className="flex items-baseline gap-2.5 mt-2.5">
              <div className="text-[32px] font-semibold text-slate-900 tracking-tight tabular-nums">{caMoisCourant.toLocaleString("fr-FR")} €</div>
              {evolutionCA !== null && (
                <Badge tone={evolutionCA >= 0 ? "green" : "red"}>{evolutionCA >= 0 ? "+" : ""}{evolutionCA}% vs mois dernier</Badge>
              )}
            </div>
            <div className="text-[12.5px] text-slate-400 mt-0.5">Chiffre d'affaires du mois</div>
          </div>
          <div className="flex gap-0.5 bg-slate-100 rounded-[10px] p-[3px]">
            {[["7j", "7j"], ["30j", "30j"], ["12mois", "12 mois"]].map(([key, label]) => (
              <button key={key} onClick={() => setPeriode(key)} className="text-[12.5px] font-medium px-3 py-1.5 rounded-lg" style={periode === key ? { backgroundColor: "#fff", color: "#0F172A", boxShadow: "0 1px 2px rgba(15,23,42,0.08)", fontWeight: 600 } : { color: "#64748B" }}>{label}</button>
            ))}
          </div>
        </div>

        <div className="mt-5">
          {hasChartData ? (
            <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} width="100%" height={chartHeight} preserveAspectRatio="none" style={{ display: "block" }}>
              <defs>
                <linearGradient id="revGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={ACCENT} stopOpacity="0.22" />
                  <stop offset="100%" stopColor={ACCENT} stopOpacity="0" />
                </linearGradient>
              </defs>
              <line x1="0" y1={chartHeight * 0.17} x2={chartWidth} y2={chartHeight * 0.17} stroke="#F1F5F9" strokeWidth="1" />
              <line x1="0" y1={chartHeight * 0.5} x2={chartWidth} y2={chartHeight * 0.5} stroke="#F1F5F9" strokeWidth="1" />
              <path d={areaPath} fill="url(#revGradient)" />
              <path d={linePath} fill="none" stroke={ACCENT} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : (
            <div className="h-[140px] flex items-center justify-center text-[13px] text-slate-400 bg-slate-50 rounded-xl">Pas encore assez de factures sur cette période pour tracer une courbe.</div>
          )}
        </div>

        {objectif > 0 && (
          <div className="mt-5">
            <div className="flex items-center justify-between text-[12.5px] mb-1.5">
              <span className="text-slate-500 font-medium">Objectif du mois</span>
              <span className="text-slate-900 font-semibold tabular-nums">{caMoisCourant.toLocaleString("fr-FR")} € / {objectif.toLocaleString("fr-FR")} €</span>
            </div>
            <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${progressionObjectif}%`, backgroundColor: ACCENT }} />
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
          <div className="bg-slate-50 rounded-xl p-4">
            <div className="text-[12.5px] font-semibold text-slate-700 mb-2.5">Indicateurs clés</div>
            <div className="space-y-2">
              <div className="flex justify-between text-[13px]"><span className="text-slate-500">Panier moyen</span><span className="font-semibold text-slate-900">{panierMoyen ? `${panierMoyen} €` : "—"}</span></div>
              <div className="flex justify-between text-[13px]"><span className="text-slate-500">Taux de conversion devis</span><span className="font-semibold text-slate-900">{tauxConversion !== null ? `${tauxConversion}%` : "—"}</span></div>
              <div className="flex justify-between text-[13px]"><span className="text-slate-500">RDV facturés</span><span className="font-semibold text-slate-900">{rdvFactures}</span></div>
              <div className="flex justify-between text-[13px]"><span className="text-slate-500">No-shows</span><span className="font-semibold text-slate-900">{tauxNoShow !== null ? `${tauxNoShow}%` : "—"}</span></div>
            </div>
          </div>
          <div className="bg-slate-50 rounded-xl p-4">
            <div className="text-[12.5px] font-semibold text-slate-700 mb-2.5">Top prestations</div>
            {topPrestations.length === 0 ? (
              <div className="text-[13px] text-slate-400">Pas encore de facture sur cette période.</div>
            ) : (
              <div className="space-y-2">
                {topPrestations.map(([nom, montant]) => (
                  <div key={nom} className="flex justify-between items-center text-[13px]">
                    <span className="flex items-center gap-2 text-slate-700"><span className="w-1.5 h-1.5 rounded-full bg-green-600 shrink-0" />{nom}</span>
                    <span className="font-semibold text-slate-900">{montant.toFixed(0)} €</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {meilleurJour && (
          <div className="mt-5 pt-4 border-t border-slate-100 flex items-center gap-2">
            <Sparkles size={15} color={ACCENT} />
            <span className="text-[13px] text-slate-600">Votre meilleur jour cette semaine : <strong className="text-slate-900 font-semibold">{meilleurJour[0]}, {meilleurJour[1].count} RDV facturé{meilleurJour[1].count > 1 ? "s" : ""}, {meilleurJour[1].total.toFixed(0)} €</strong></span>
          </div>
        )}
      </div>

      <div className="rounded-2xl p-6 relative overflow-hidden" style={{ backgroundColor: NAVY }}>
        <div className="absolute -right-8 -top-8 w-36 h-36 rounded-full opacity-10" style={{ backgroundColor: ACCENT }} />
        <div className="flex items-start justify-between gap-5 flex-wrap relative">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-[10px] flex items-center justify-center shrink-0" style={{ backgroundColor: "rgba(61,107,224,0.25)" }}>
                <Bot size={16} color="#8FB0FF" />
              </div>
              <div className="font-semibold text-[14.5px] text-white">Nexora Intelligence</div>
            </div>
            <div className="flex items-baseline gap-2 mt-3.5">
              <div className="text-[30px] font-semibold text-white tracking-tight tabular-nums">{valeurRecuperee} €</div>
              <span className="text-[12px] font-medium" style={{ color: "#8CA0C9" }}>de temps administratif économisé aujourd'hui</span>
            </div>
            <div className="text-[12px] mt-0.5" style={{ color: "#6B87BE" }}>soit {heuresEconomisees}h{minutesEconomisees ? minutesEconomisees : ""} rendues à votre équipe</div>
          </div>
          <div className="flex flex-col gap-1.5 min-w-[220px]">
            <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "#6B87BE" }}>Automatisations</span>
            <div className="flex items-center justify-between text-[12.5px]">
              <span className="flex items-center gap-1.5" style={{ color: "#C3D0EA" }}><span className="w-1.5 h-1.5 rounded-full bg-green-400" />SMS actif</span>
              <span className="text-white font-semibold">{smsAujourdhui} envoyé{smsAujourdhui > 1 ? "s" : ""}</span>
            </div>
            <div className="flex items-center justify-between text-[12.5px]">
              <span className="flex items-center gap-1.5" style={{ color: "#C3D0EA" }}><span className="w-1.5 h-1.5 rounded-full bg-green-400" />Email actif</span>
              <span className="text-white font-semibold">{emailAujourdhui} envoyé{emailAujourdhui > 1 ? "s" : ""}</span>
            </div>
            <div className="flex items-center justify-between text-[12.5px]">
              <span className="flex items-center gap-1.5" style={{ color: "#C3D0EA" }}><span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: garageData.google_agenda_connecte ? "#4ADE80" : "#FBBF6B" }} />Google Calendar</span>
              <span className="font-semibold" style={{ color: garageData.google_agenda_connecte ? "#fff" : "#FBBF6B" }}>{garageData.google_agenda_connecte ? "connecté" : "non connecté"}</span>
            </div>
          </div>
        </div>

        {recentActivities.length > 0 && (
          <div className="mt-5 pt-4 relative" style={{ borderTop: "1px solid #22335C" }}>
            <div className="text-[11px] font-semibold uppercase tracking-wide mb-2.5" style={{ color: "#6B87BE" }}>Fait pour vous récemment</div>
            <div className="space-y-2">
              {recentActivities.map((activity) => (
                <div key={activity.id} className="flex items-center gap-2.5">
                  <span className="text-[11.5px] w-11 shrink-0 tabular-nums" style={{ color: "#6B87BE" }}>{activity.heure}</span>
                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: "#8FB0FF" }} />
                  <span className="text-[13px]" style={{ color: "#DCE4F5" }}>{activity.texte}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="font-semibold text-slate-900 text-[15px]">Aperçu du jour</div>
          <button onClick={() => setView("agenda")} className="text-[13px] font-medium flex items-center gap-1" style={{ color: ACCENT }}>
            Voir l'agenda complet <ChevronRight size={14} />
          </button>
        </div>
        {todayAppts.length === 0 ? (
          <div className="px-5 py-8 text-center text-slate-400 text-[13px]">Aucun rendez-vous prévu aujourd'hui.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {todayAppts.slice(0, 4).map((a) => {
              const colors = catColor(a.categorie);
              return (
                <button key={a.id} onClick={() => onSelectAppt(a)} className="w-full px-5 py-3.5 flex items-center gap-4 hover:bg-slate-50/70 text-left">
                  <div className="text-[13px] font-medium text-slate-500 w-24 shrink-0">{a.debut} - {a.fin}</div>
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: colors.bar }} />
                  <div className="text-sm text-slate-800">{a.vehicule}</div>
                  <div className="text-sm text-slate-500">{a.client}</div>
                  <div className="text-[13px] text-slate-400">·</div>
                  <div className="text-sm text-slate-500 flex-1">{a.prestation}</div>
                  <Badge tone={STATUT_TONE[a.statut] || "slate"}>{a.statut}</Badge>
                </button>
              );
            })}
          </div>
        )}
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
        <div className="flex items-center gap-2 text-sm text-slate-700"><Car size={15} className="text-slate-400" /> {[p.vehicule, p.immatriculation].filter(Boolean).join(" · ")}</div>
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

function CreerRdvModal({ clients, prestations, date, heure, onClose, onCreate, onCreerClient }) {
  const [query, setQuery] = useState("");
  const [clientId, setClientId] = useState("");
  const [prestationId, setPrestationId] = useState("");
  const [heureChoisie, setHeureChoisie] = useState(heure || "09:00");
  const [creating, setCreating] = useState(false);
  const [nouveauClient, setNouveauClient] = useState(false);
  const [nomNouveau, setNomNouveau] = useState("");
  const [telNouveau, setTelNouveau] = useState("");
  const [emailNouveau, setEmailNouveau] = useState("");

  const clientChoisi = clients.find((c) => c.id === clientId) || null;
  const vehiculesClient = Array.isArray(clientChoisi?.vehicules) ? clientChoisi.vehicules : clientChoisi?.vehicules ? [clientChoisi.vehicules] : [];
  const vehiculeChoisi = vehiculesClient[0] || null;
  const clientsFiltres = clients.filter((c) => !query || c.nom?.toLowerCase().includes(query.toLowerCase()));
  const prestationChoisie = prestations.find((p) => p.id === prestationId) || null;

  const creer = async () => {
    setCreating(true);
    let idClient = clientChoisi?.id || null;
    let idVehicule = vehiculeChoisi?.id || null;
    if (nouveauClient) {
      if (!nomNouveau.trim()) { setCreating(false); return; }
      const cree = await onCreerClient({ nom: nomNouveau.trim(), telephone: telNouveau.trim() || null, email: emailNouveau.trim() || null });
      if (!cree) { setCreating(false); return; }
      idClient = cree.id;
      idVehicule = null;
    }
    if (!idClient) { setCreating(false); return; }
    await onCreate({
      client_id: idClient,
      vehicule_id: idVehicule,
      prestation_id: prestationId || null,
      date,
      heure: heureChoisie,
      duree: prestationChoisie?.duree_minutes || prestationChoisie?.duree_min || 60,
    });
    setCreating(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-lg text-slate-900" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold text-slate-900">Nouveau rendez-vous</h2>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-[13px] text-slate-500">{date} à</span>
          <input type="time" value={heureChoisie} onChange={(e) => setHeureChoisie(e.target.value)} className="rounded-lg border border-slate-200 px-2 py-1 text-[13px] text-slate-700 outline-none focus:border-blue-500" />
        </div>

        <div className="mt-4">
          <div className="flex items-center justify-between">
            <label className="text-[12px] font-medium text-slate-500">Client</label>
            {!nouveauClient && <button type="button" onClick={() => { setNouveauClient(true); setClientId(""); }} className="text-[12px] font-medium text-blue-600 hover:underline">+ Nouveau client</button>}
          </div>
          {nouveauClient ? (
            <div className="mt-1.5 space-y-2">
              <input value={nomNouveau} onChange={(e) => setNomNouveau(e.target.value)} placeholder="Nom du client" className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500" />
              <input value={telNouveau} onChange={(e) => setTelNouveau(e.target.value)} placeholder="Téléphone (optionnel)" className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500" />
              <input value={emailNouveau} onChange={(e) => setEmailNouveau(e.target.value)} placeholder="Email (optionnel)" className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500" />
              <button type="button" onClick={() => setNouveauClient(false)} className="text-[12px] text-slate-400 hover:underline">Annuler, chercher un client existant</button>
            </div>
          ) : clientChoisi ? (
            <div className="mt-1 flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2 text-sm">
              <span>{clientChoisi.nom}</span>
              <button onClick={() => setClientId("")} className="text-slate-400 hover:text-slate-600"><X size={14} /></button>
            </div>
          ) : (
            <>
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Chercher un client..." className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500" />
              <div className="mt-1 max-h-[140px] overflow-y-auto">
                {clientsFiltres.slice(0, 20).map((c) => (
                  <button key={c.id} onClick={() => setClientId(c.id)} className="w-full text-left px-3 py-2 text-sm rounded-lg hover:bg-slate-50">{c.nom}</button>
                ))}
              </div>
            </>
          )}
        </div>

        <label className="block mt-4">
          <span className="text-[12.5px] font-medium text-slate-500">Prestation</span>
          <select value={prestationId} onChange={(e) => setPrestationId(e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500">
            <option value="">Sélectionner...</option>
            {prestations.map((p) => <option key={p.id} value={p.id}>{p.nom}</option>)}
          </select>
        </label>

        <div className="mt-6 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-medium text-slate-600">Annuler</button>
          <button onClick={creer} disabled={(!nouveauClient && !clientChoisi) || (nouveauClient && !nomNouveau.trim()) || creating} className="px-4 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50" style={{ backgroundColor: ACCENT }}>{creating ? "Création..." : "Créer le rendez-vous"}</button>
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

function DevisView({ devisList: devisListToutesSources, clients, prestations, onAccept, onRefuse, onUpdateMontant, onCreer }) {
  const devisList = devisListToutesSources.filter((d) => d.statut === "en_attente");
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
        <div className="flex items-center gap-2 text-sm text-slate-700"><Car size={15} className="text-slate-400" /> {[d.vehicule, d.immatriculation].filter(Boolean).join(" · ")}</div>
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

function AgendaView({ onSelectAppt, rendezVous, garageData, onConnectCalendar, clients = [], prestations = [], onCreerRdv, onCreerClient }) {
  const [mode, setMode] = useState("jour");
  const [recherche, setRecherche] = useState("");
  const [nouveauCreneau, setNouveauCreneau] = useState(null);
  const resultatsRecherche = recherche.trim() ? [...rendezVous]
    .filter((r) => r.client?.toLowerCase().includes(recherche.trim().toLowerCase()) || r.vehicule?.toLowerCase().includes(recherche.trim().toLowerCase()))
    .sort((a, b) => new Date(a.date_debut) - new Date(b.date_debut)) : null;

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
            {[["jour", "Jour"], ["semaine", "Semaine"], ["mois", "Mois"], ["annee", "Année"]].map(([m, label]) => (
              <button key={m} onClick={() => setMode(m)} className="px-3.5 py-1.5 font-medium" style={mode === m ? { backgroundColor: ACCENT, color: "#fff" } : { backgroundColor: "#fff", color: "#64748B" }}>
                {label}
              </button>
            ))}
          </div>
          {/* Préparé pour une future synchronisation bidirectionnelle Google Calendar */}
          <button onClick={onConnectCalendar} className="flex items-center gap-1.5 text-[13px] font-medium text-white px-3.5 py-1.5 rounded-xl" style={{ backgroundColor: garageData.google_agenda_connecte ? "#16A34A" : ACCENT }}>
            <CalendarPlus size={14} /> {garageData.google_agenda_connecte ? "Google synchronisé" : "Connecter Google"}
          </button>
        </div>
      </div>

      <div className="px-5 py-3 border-b border-slate-100">
        <div className="flex items-center gap-2 bg-slate-50 rounded-xl px-3 py-2 border border-slate-200 max-w-xs">
          <Search size={14} className="text-slate-400" />
          <input
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder="Chercher un client, un véhicule..."
            className="bg-transparent text-[12.5px] outline-none w-full text-slate-800 placeholder:text-slate-400"
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-3 px-5 py-3 border-b border-slate-100">
        {Object.values(CATEGORY_COLORS).map((c) => (
          <div key={c.label} className="flex items-center gap-1.5 text-[12px] text-slate-500">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: c.bar }} /> {c.label}
          </div>
        ))}
      </div>

            {resultatsRecherche ? (
        <div className="p-5 space-y-2">
          {resultatsRecherche.length === 0 ? <div className="text-slate-400 text-sm">Aucun résultat.</div> : resultatsRecherche.map((r) => (
            <button key={r.id} onClick={() => onSelectAppt(r)} className="w-full text-left rounded-xl border border-slate-200 px-4 py-3 hover:bg-slate-50 flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-slate-800">{r.client} — {r.vehicule}</div>
                <div className="text-[12px] text-slate-500">{r.prestation}</div>
              </div>
              <div className="text-[12.5px] text-slate-500">{new Date(r.date_debut).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })} · {r.debut}</div>
            </button>
          ))}
        </div>
      ) : mode === "jour" ? (
        <div className="grid" style={{ gridTemplateColumns: "70px 1fr" }}>
          {heuresGrille.map((h) => {
            const slotAppts = dayAppts.filter((a) => a.debut?.slice(0, 2) === h.slice(0, 2));
            return (
              <React.Fragment key={h}>
                <div className="text-[12px] text-slate-400 px-3 py-3 border-t border-slate-100">{h}</div>
                <div className="border-t border-l border-slate-100 py-1.5 px-2 min-h-[52px] relative">
                  {slotAppts.length === 0 && (
                    <button
                      type="button"
                      onClick={() => onCreerRdv && setNouveauCreneau({ date: selectedDateKey, heure: `${h}` })}
                      className="w-full text-left text-[11.5px] text-slate-300 hover:text-blue-500 hover:bg-blue-50/40 rounded-lg px-1 py-1.5"
                    >
                      Créneau disponible {onCreerRdv && <span className="text-blue-400">· + Ajouter</span>}
                    </button>
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
        <div className="grid grid-cols-7 divide-x divide-slate-100">
          {weekDays.map((day) => {
            const appts = rendezVous.filter((a) => a.date_key === day.key);
            return (
              <div key={day.key}>
                <div className="text-[12.5px] font-medium text-slate-600 text-center py-2.5 border-b border-slate-100 capitalize">{day.label}</div>
                <div className="p-2 space-y-1.5 min-h-[320px]">
                  {appts.length === 0 && <div className="text-[11.5px] text-slate-300 text-center pt-4">Aucun RDV</div>}
                  {onCreerRdv && <button type="button" onClick={() => setNouveauCreneau({ date: day.key, heure: "09:00" })} className="w-full text-center text-[11px] text-blue-500 hover:underline py-1">+ Ajouter</button>}
                  {appts.map((a) => {
                    const c = catColor(a.categorie);
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
        <div className="grid grid-cols-7 divide-x divide-y divide-slate-100 border-t border-slate-100">{["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"].map((day) => <div key={day} className="px-2 py-2 text-center text-[11px] font-medium text-slate-400 bg-slate-50">{day}</div>)}{monthDays.map((day) => { const appts = rendezVous.filter((appt) => appt.date_key === day.key); return <div key={day.key} className={`min-h-[105px] p-2 ${day.inMonth ? "bg-white" : "bg-slate-50/70"}`}><div className={`text-[11px] font-medium mb-1 ${day.inMonth ? "text-slate-600" : "text-slate-300"}`}>{day.date.getDate()}</div><div className="space-y-1">{appts.slice(0, 3).map((appt) => <button key={appt.id} onClick={() => onSelectAppt(appt)} className="w-full truncate text-left text-[10.5px] px-1.5 py-1 rounded" style={{ color: catColor(appt.categorie).text, backgroundColor: catColor(appt.categorie).bg }}>{appt.debut} · {appt.client}</button>)}{appts.length > 3 && <div className="text-[10px] text-slate-400">+{appts.length - 3} RDV</div>}{onCreerRdv && <button type="button" onClick={() => setNouveauCreneau({ date: day.key, heure: "09:00" })} className="w-full text-left text-[10px] text-blue-500 hover:underline">+ Ajouter</button>}</div></div>; })}</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 p-5">{Array.from({ length: 12 }, (_, month) => { const label = new Date(currentDate.getFullYear(), month, 1).toLocaleDateString("fr-FR", { month: "long" }); const count = rendezVous.filter((appt) => { const date = new Date(appt.date_debut); return date.getFullYear() === currentDate.getFullYear() && date.getMonth() === month; }).length; return <button key={month} onClick={() => { setCurrentDate(new Date(currentDate.getFullYear(), month, 1)); setMode("mois"); }} className="rounded-xl border border-slate-200 p-4 text-left hover:border-blue-300 hover:bg-blue-50/30"><div className="capitalize text-sm font-semibold text-slate-800">{label}</div><div className="text-[12px] text-slate-500 mt-1">{count} rendez-vous</div><div className="mt-3 h-1.5 rounded-full bg-slate-100"><div className="h-full rounded-full" style={{ width: `${Math.min(100, count * 12)}%`, backgroundColor: ACCENT }} /></div></button>; })}</div>
      )}
      {nouveauCreneau && (
                <CreerRdvModal
          clients={clients}
          prestations={prestations}
          date={nouveauCreneau.date}
          heure={nouveauCreneau.heure}
          onClose={() => setNouveauCreneau(null)}
          onCreate={onCreerRdv}
          onCreerClient={onCreerClient}
        />
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

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
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
    return `<tr><td>${escapeHtml(typeLabel)}</td><td>${escapeHtml(l.description)}</td><td>${escapeHtml(l.quantite)}</td><td>${Number(l.prix_unitaire_ht || 0).toFixed(2)} €</td><td>${totalLigne.toFixed(2)} €</td></tr>`;
  }).join("");
  const html = `
    <html>
    <head>
      <title>${escapeHtml(facture.numero)}</title>
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
        <div><h1>${escapeHtml(garageData?.nom || "Garage")}</h1><div>${escapeHtml(garageData?.ville)}</div></div>
        <div><strong>Facture ${escapeHtml(facture.numero)}</strong><br/>${new Date(facture.created_at).toLocaleDateString("fr-FR")}</div>
      </div>
      <div class="box">
        <strong>Client :</strong> ${escapeHtml(client.nom)}<br/>
        ${escapeHtml(client.telephone)} ${client.email ? "· " + escapeHtml(client.email) : ""}<br/>
        <strong>Véhicule :</strong> ${escapeHtml(vehicule.marque)} ${escapeHtml(vehicule.modele)} — ${escapeHtml(vehicule.immatriculation)}<br/>
        ${facture.motif ? `<strong>Motif :</strong> ${escapeHtml(facture.motif)}` : ""}
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
                  <div className="text-[12.5px] text-slate-500">{[r.vehicule, r.immatriculation, r.prestation].filter(Boolean).join(" · ")}</div>
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
      </div>
    </div>
  );
}

function StripeKeyField() {
  const [value, setValue] = useState("");
  const [configured, setConfigured] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase.rpc("stripe_configure_pour_mon_garage").then(({ data, error }) => {
      if (!error) setConfigured(!!data);
    });
  }, []);

  const save = async () => {
    if (!value.trim()) return;
    setSaving(true);
    const { error } = await supabase.rpc("set_stripe_secret_key", { p_key: value.trim() });
    setSaving(false);
    if (error) {
      console.error("Erreur enregistrement clé Stripe :", error);
      return;
    }
    setConfigured(true);
    setValue("");
  };

  return (
    <div className="space-y-3">
      <Badge tone={configured ? "green" : "slate"}>{configured ? "Configuré" : "Non configuré"}</Badge>
      <label className="block">
        <span className="text-[12.5px] font-medium text-slate-500">Clé secrète Stripe</span>
        <div className="mt-1.5 flex gap-2">
          <input
            type="password"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="sk_live_..."
            className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500"
          />
          <button type="button" onClick={save} disabled={saving} className="px-4 py-2 rounded-xl text-sm font-semibold text-white" style={{ backgroundColor: ACCENT }}>
            Enregistrer
          </button>
        </div>
      </label>
      <div className="text-[12.5px] text-slate-500">Génère automatiquement un lien de paiement dans l'email « véhicule prêt » dès qu'un devis accepté existe pour ce rendez-vous. La clé n'est jamais réaffichée une fois enregistrée.</div>
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

function ParametresView({ garageData, onGarageChange, onSave, prestations = [], onAddPrestation, onDeletePrestation, saving, mecaniciens = [], onAddMecanicien, onToggleMecanicienActif }) {
  const [newPrestation, setNewPrestation] = useState({ nom: "", categorie: "entretien", duree_minutes: 60 });
  const [newMecanicienNom, setNewMecanicienNom] = useState("");
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
      <SettingsSection title="Horaires d’ouverture"><div className="space-y-2">{JOURS_SEMAINE.map(([jour, libelle]) => { const plages = plagesDuJour(jour); const ouvert = plages.length > 0; return <div key={jour} className="flex flex-wrap items-center gap-2 py-1.5 border-b border-slate-100 last:border-0"><label className="flex items-center gap-2 w-[132px] shrink-0"><input type="checkbox" checked={ouvert} onChange={(e) => basculerJour(jour, e.target.checked)} className="accent-blue-600" /><span className="text-[13px] font-medium text-slate-700">{libelle}</span></label>{ouvert ? <div className="flex flex-wrap items-center gap-1.5">{champHeure(jour, 0, 0)}<span className="text-slate-400 text-xs">→</span>{champHeure(jour, 0, 1)}{plages.length > 1 ? <><span className="text-slate-300 px-1">|</span>{champHeure(jour, 1, 0)}<span className="text-slate-400 text-xs">→</span>{champHeure(jour, 1, 1)}<button type="button" onClick={() => retirerApresMidi(jour)} className="text-[11px] text-slate-400 hover:text-red-500 px-1">retirer</button></> : <button type="button" onClick={() => ajouterApresMidi(jour)} className="text-[11px] text-blue-600 hover:underline px-1">+ après-midi</button>}</div> : <span className="text-[13px] text-slate-400">Fermé</span>}</div>; })}</div><div className="mt-4 rounded-xl bg-slate-50 p-3 text-[12.5px] text-slate-600">Ces horaires servent au calcul des créneaux proposés aux clients. Laissez un jour décoché pour le déclarer fermé.</div></SettingsSection><SettingsSection title="Mécaniciens"><div className="space-y-2">{mecaniciens.length === 0 && <div className="text-[13px] text-slate-400">Aucun mécanicien pour l’instant.</div>}{mecaniciens.map((m) => <div key={m.id} className="flex items-center justify-between gap-2 py-1.5 border-b border-slate-100 last:border-0"><div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: m.couleur || "#3D6BE0" }} /><span className="text-[13px] font-medium text-slate-700">{m.nom}</span></div><label className="flex items-center gap-1.5 text-[12px] text-slate-500"><input type="checkbox" checked={m.actif !== false} onChange={(e) => onToggleMecanicienActif(m.id, e.target.checked)} className="accent-blue-600" />Actif</label></div>)}</div><div className="mt-3 flex gap-2"><input type="text" value={newMecanicienNom} onChange={(e) => setNewMecanicienNom(e.target.value)} placeholder="Nom du mécanicien" className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500" /><button type="button" onClick={() => { if (newMecanicienNom.trim()) { onAddMecanicien(newMecanicienNom.trim()); setNewMecanicienNom(""); } }} className="px-4 py-2 rounded-xl text-sm font-semibold text-white" style={{ backgroundColor: ACCENT }}>Ajouter</button></div></SettingsSection>
      <SettingsSection title="Prestations disponibles"><div className="space-y-1.5 max-h-[230px] overflow-y-auto">{catalogue.map((p) => <div key={p.id || p.nom} className="flex items-center gap-2 text-sm py-2 border-b border-slate-100 last:border-0"><span className="w-2 h-2 rounded-full" style={{ backgroundColor: catColor(p.categorie).bar }} /><span className="flex-1 text-slate-700">{p.nom}</span><span className="text-slate-500 text-[12px]">{p.duree_minutes || p.duree_min || p.duree} min</span>{p.id && <button onClick={() => onDeletePrestation(p.id)} className="ml-1 text-slate-400 hover:text-red-600" title="Supprimer"><Trash2 size={14} /></button>}</div>)}</div><div className="grid grid-cols-[1fr_110px_74px] gap-2 mt-4"><input value={newPrestation.nom} onChange={(event) => setNewPrestation((prev) => ({ ...prev, nom: event.target.value }))} className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900" placeholder="Nouvelle prestation" /><input type="number" min="15" step="15" value={newPrestation.duree_minutes} onChange={(event) => setNewPrestation((prev) => ({ ...prev, duree_minutes: Number(event.target.value) }))} className="rounded-xl border border-slate-200 px-2 py-2 text-sm text-slate-900" /><button onClick={createPrestation} className="rounded-xl text-sm font-semibold text-white" style={{ backgroundColor: ACCENT }}><Plus size={15} className="inline" /> Ajouter</button></div></SettingsSection>
      <SettingsSection title="Connexions"><SettingsRow label="Boîte Gmail" right={<Badge tone={garageData.gmail_connecte ? "green" : "slate"}>{garageData.gmail_connecte ? "Connectée" : "Non connectée"}</Badge>} /><SettingsRow label="Google Agenda" right={<Badge tone={garageData.google_agenda_connecte ? "green" : "amber"}>{garageData.google_agenda_connecte ? "Connecté" : "À connecter dans n8n"}</Badge>} /><div className="mt-3 text-[12px] text-slate-500">La connexion Google Calendar doit être autorisée dans le workflow n8n, puis son état peut être enregistré ici.</div></SettingsSection>
      <SettingsSection title="Objectif">
        <div className="space-y-3">
          {field("Objectif de chiffre d'affaires mensuel (€)", "objectif_ca_mensuel", "number")}
          <div className="text-[12.5px] text-slate-500">Sert de repere de progression sur le tableau de bord. Laissez vide pour ne rien afficher.</div>
        </div>
      </SettingsSection>
      <SettingsSection title="Avis Google">
        <div className="space-y-3">
          {field("Lien vers votre fiche d'avis Google", "lien_avis_google")}
          <div className="text-[12.5px] text-slate-500">Utilisé automatiquement dans l'email de demande d'avis envoyé après chaque rendez-vous terminé.</div>
        </div>
      </SettingsSection>
      <SettingsSection title="Paiement en ligne (Stripe)">
        <StripeKeyField />
      </SettingsSection>
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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [rendezVous, setRendezVous] = useState([]);
  const [demandes, setDemandes] = useState([]);
  const [selectedDemande, setSelectedDemande] = useState(null);
  const [prestations, setPrestations] = useState([]);
  const [mecaniciens, setMecaniciens] = useState([]);
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
  async function loadMecaniciens() {
    const { data, error } = await supabase
      .from("mecaniciens")
      .select("*")
      .eq("garage_id", ACTIVE_GARAGE_ID);
    if (error) {
      console.error("Erreur mécaniciens :", error);
      return;
    }
    setMecaniciens(data || []);
  }
  loadMecaniciens();
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

    // Vérifier que la capacité du garage (nombre de mécaniciens) n'est pas dépassée sur ce créneau
const { data: overlapping } = await supabase
  .from("rendez_vous")
  .select("id")
  .eq("garage_id", proposition.garage_id)
  .lt("date_debut", proposition.date_fin_proposee)
  .gt("date_fin", proposition.date_debut_proposee);

const capacite = Number(garageData.nb_mecaniciens) > 0 ? Number(garageData.nb_mecaniciens) : 1;
if ((overlapping?.length || 0) >= capacite) {
  flashToast("Tous vos mécaniciens sont déjà occupés sur ce créneau", "error");
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
    const n8nBaseUrl = process.env.NEXT_PUBLIC_N8N_WEBHOOK_BASE_URL;
    if (n8nBaseUrl) {
      fetch(`${n8nBaseUrl}/webhook/devis-accepte`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ devis_id: id }),
      }).catch(() => console.warn("n8n injoignable — email de confirmation non envoyé au client."));
    } else {
      console.warn("NEXT_PUBLIC_N8N_WEBHOOK_BASE_URL non configurée — email de confirmation non envoyé au client.");
    }
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
    const n8nBaseUrl = process.env.NEXT_PUBLIC_N8N_WEBHOOK_BASE_URL;
    if (n8nBaseUrl) {
      fetch(`${n8nBaseUrl}/webhook/devis-refuse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ devis_id: id }),
      }).catch(() => console.warn("n8n injoignable — email de refus non envoyé au client."));
    } else {
      console.warn("NEXT_PUBLIC_N8N_WEBHOOK_BASE_URL non configurée — email de refus non envoyé au client.");
    }
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
        .gt("date_fin", start.toISOString());
      if (conflictError) throw conflictError;
      const capacite = Number(garageData.nb_mecaniciens) > 0 ? Number(garageData.nb_mecaniciens) : 1;
      if ((conflicts?.length || 0) >= capacite) {
        flashToast("Tous vos mécaniciens sont déjà occupés sur ce créneau. Choisissez une autre heure.", "error");
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
      objectif_ca_mensuel: garageData.objectif_ca_mensuel || null,
      lien_avis_google: garageData.lien_avis_google || null,
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

  const addMecanicien = async (nom) => {
    const couleurs = ["#3D6BE0", "#7C3AED", "#0F766E", "#D97706", "#DC2626", "#16A34A"];
    const couleur = couleurs[mecaniciens.length % couleurs.length];
    const { data, error } = await supabase.from("mecaniciens").insert({ nom, couleur, garage_id: ACTIVE_GARAGE_ID }).select().single();
    if (error) {
      console.error("Erreur ajout mécanicien :", error);
      flashToast("Impossible d’ajouter le mécanicien", "error");
      return;
    }
    setMecaniciens((previous) => [...previous, data]);
    flashToast("Mécanicien ajouté");
  };

  const toggleMecanicienActif = async (id, actif) => {
    const { error } = await supabase.from("mecaniciens").update({ actif }).eq("id", id).eq("garage_id", ACTIVE_GARAGE_ID);
    if (error) {
      console.error("Erreur mise à jour mécanicien :", error);
      flashToast("Impossible de mettre à jour le mécanicien", "error");
      return;
    }
    setMecaniciens((previous) => previous.map((m) => (m.id === id ? { ...m, actif } : m)));
  };

  const assignMecanicien = async (rdvId, mecanicienId) => {
    const { error } = await supabase.from("rendez_vous").update({ mecanicien_id: mecanicienId }).eq("id", rdvId).eq("garage_id", ACTIVE_GARAGE_ID);
    if (error) {
      console.error("Erreur affectation mécanicien :", error);
      flashToast("Impossible d’affecter le mécanicien", "error");
      return;
    }
    setRendezVous((previous) => previous.map((r) => (r.id === rdvId ? { ...r, mecanicien_id: mecanicienId } : r)));
    setSelectedAppt((previous) => (previous && previous.id === rdvId ? { ...previous, mecanicien_id: mecanicienId } : previous));
        flashToast("Mécanicien affecté");
  };
  const handleCreerClient = async ({ nom, telephone, email }) => {
    const { data, error } = await supabase
      .from("clients")
      .insert({ garage_id: ACTIVE_GARAGE_ID, nom, telephone: telephone || null, email: email || null })
      .select("*, vehicules (id, marque, modele, annee, immatriculation)")
      .single();
    if (error) {
      console.error("Erreur création client :", error);
      flashToast("Impossible de créer le client", "error");
      return null;
    }
    setClients((prev) => [...prev, data]);
    return data;
  };



  const handleCreerRdvManuel = async ({ client_id, vehicule_id, prestation_id, date, heure, duree }) => {
    const start = new Date(`${date}T${heure}:00`);
    const end = new Date(start.getTime() + Number(duree || 60) * 60_000);
    const { data: conflicts, error: conflictError } = await supabase
      .from("rendez_vous")
      .select("id")
      .eq("garage_id", ACTIVE_GARAGE_ID)
      .lt("date_debut", end.toISOString())
      .gt("date_fin", start.toISOString());
    if (conflictError) {
      console.error("Erreur vérification créneau :", conflictError);
      flashToast("Impossible de vérifier le créneau", "error");
      return;
    }
    const capacite = Number(garageData.nb_mecaniciens) > 0 ? Number(garageData.nb_mecaniciens) : 1;
    if ((conflicts?.length || 0) >= capacite) {
      flashToast("Tous vos mécaniciens sont déjà occupés sur ce créneau", "error");
      return;
    }
    const { data: createdRdv, error } = await supabase
      .from("rendez_vous")
      .insert({
        garage_id: ACTIVE_GARAGE_ID,
        client_id,
        vehicule_id: vehicule_id || null,
        prestation_id: prestation_id || null,
        date_debut: start.toISOString(),
        date_fin: end.toISOString(),
        statut: "confirme",
        source: "manuel",
      })
      .select("*, prestations (nom, categorie), clients (nom, telephone, email), vehicules (marque, modele, immatriculation)")
      .single();
    if (error) {
      console.error("Erreur création RDV :", error);
      flashToast("Impossible de créer le rendez-vous", "error");
      return;
    }
    setRendezVous((prev) => [...prev, {
      ...createdRdv,
      date_key: dateKey(createdRdv.date_debut),
      jour: dayLabel(createdRdv.date_debut),
      debut: timeLabel(createdRdv.date_debut),
      fin: timeLabel(createdRdv.date_fin),
      prestation: createdRdv.prestations?.nom || "Prestation",
      categorie: createdRdv.prestations?.categorie || "",
      statut: RDV_STATUS_LABEL[createdRdv.statut] || createdRdv.statut,
      client: createdRdv.clients?.nom || "Client inconnu",
      telephone: createdRdv.clients?.telephone || "",
      email: createdRdv.clients?.email || "",
      vehicule: `${createdRdv.vehicules?.marque || ""} ${createdRdv.vehicules?.modele || ""}`.trim(),
      immatriculation: createdRdv.vehicules?.immatriculation || "",
    }]);
    flashToast("Rendez-vous créé");
  };

  const updateStatutAtelier = async (rdvId, statutAtelier) => {
    const { error } = await supabase.from("rendez_vous").update({ statut_atelier: statutAtelier }).eq("id", rdvId).eq("garage_id", ACTIVE_GARAGE_ID);
    if (error) {
      console.error("Erreur mise à jour étape atelier :", error);
      flashToast("Impossible de mettre à jour l'étape", "error");
      return;
    }
    setRendezVous((previous) => previous.map((r) => (r.id === rdvId ? { ...r, statut_atelier: statutAtelier } : r)));
    setSelectedAppt((previous) => (previous && previous.id === rdvId ? { ...previous, statut_atelier: statutAtelier } : previous));
    flashToast("Étape mise à jour");
  };

  const updateLienPaiement = async (rdvId, lienPaiement) => {
    const { error } = await supabase.from("rendez_vous").update({ lien_paiement: lienPaiement }).eq("id", rdvId).eq("garage_id", ACTIVE_GARAGE_ID);
    if (error) {
      console.error("Erreur mise à jour lien de paiement :", error);
      flashToast("Impossible d'enregistrer le lien de paiement", "error");
      return;
    }
    setRendezVous((previous) => previous.map((r) => (r.id === rdvId ? { ...r, lien_paiement: lienPaiement } : r)));
    setSelectedAppt((previous) => (previous && previous.id === rdvId ? { ...previous, lien_paiement: lienPaiement } : previous));
    flashToast("Lien de paiement enregistré");
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
    devis: "Devis",
    verifier: "Erreurs à vérifier",
    factures: "Factures",
    parametres: "Paramètres",
  };

  return (
    <div className="flex min-h-[800px] w-full font-sans" style={{ backgroundColor: BG }}>
      <aside className="w-60 shrink-0 py-5 px-3.5 hidden md:flex flex-col" style={{ backgroundColor: NAVY }}>
        <Logo />
        <nav className="mt-8 flex flex-col gap-4">
          {navGroups.map((group) => (
            <div key={group.label}>
              <div className="px-3 mb-1 text-[10.5px] font-semibold tracking-wide uppercase" style={{ color: "#5C6D96" }}>{group.label}</div>
              <div className="flex flex-col gap-1">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const active = view === item.key;
                  return (
                    <button key={item.key} onClick={() => setView(item.key)} className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[13.5px] font-medium transition-colors" style={active ? { backgroundColor: NAVY_SOFT, color: "#fff" } : { color: "#93A4C7" }}>
                      <Icon size={16} />
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
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
          <div className="flex items-center gap-3">
            <button onClick={() => setMobileMenuOpen(true)} className="md:hidden -ml-1 p-1.5 rounded-lg text-slate-500 hover:bg-slate-100">
              <Menu size={22} />
            </button>
            <div>
              <div className="text-lg font-semibold text-slate-900">{titles[view]}</div>
              <div className="text-[13px] text-slate-500">{garageData.nom}</div>
            </div>
          </div>
        </div>

        {mobileMenuOpen && (
          <div className="fixed inset-0 z-50 md:hidden">
            <div className="absolute inset-0 bg-black/40" onClick={() => setMobileMenuOpen(false)} />
            <div className="absolute inset-y-0 left-0 w-72 max-w-[85vw] py-5 px-3.5 flex flex-col overflow-y-auto" style={{ backgroundColor: NAVY }}>
              <div className="flex items-center justify-between px-1">
                <Logo />
                <button onClick={() => setMobileMenuOpen(false)} className="p-1.5 rounded-lg text-white/70 hover:bg-white/10">
                  <X size={20} />
                </button>
              </div>
              <nav className="mt-8 flex flex-col gap-4">
                {navGroups.map((group) => (
                  <div key={group.label}>
                    <div className="px-3 mb-1 text-[10.5px] font-semibold tracking-wide uppercase" style={{ color: "#5C6D96" }}>{group.label}</div>
                    <div className="flex flex-col gap-1">
                      {group.items.map((item) => {
                        const Icon = item.icon;
                        const active = view === item.key;
                        return (
                          <button
                            key={item.key}
                            onClick={() => { setView(item.key); setMobileMenuOpen(false); }}
                            className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[13.5px] font-medium transition-colors"
                            style={active ? { backgroundColor: NAVY_SOFT, color: "#fff" } : { color: "#93A4C7" }}
                          >
                            <Icon size={16} />
                            {item.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
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
            </div>
          </div>
        )}

        <div className="p-5 md:p-8">
          {view === "dashboard" && <DashboardView stats={stats} propositions={propositions} setView={setView} onSelectAppt={setSelectedAppt} loading={loading} rendezVous={rendezVous} demandes={demandes} clients={clients} garageData={garageData} aiStats={aiStats} timeline={activityTimeline} automationEvents={automationEvents} factures={factures} devisList={devisList} prestations={prestations} />}
          {view === "atelier" && <AtelierView rendezVous={rendezVous} onSelectAppt={setSelectedAppt} garageData={garageData} mecaniciens={mecaniciens} />}
          {view === "valider" && <ValiderView propositions={propositions} onAccept={handleAccept} onRefuse={handleRefuse} onReschedule={handleReschedule} garageId={ACTIVE_GARAGE_ID} />}
          {view === "devis" && <DevisView devisList={devisList} clients={clients} prestations={prestations} onAccept={handleAcceptDevis} onRefuse={handleRefuseDevis} onUpdateMontant={handleUpdateDevisMontant} onCreer={handleCreerDevis} />}
          {view === "verifier" && <ErreursView erreurs={erreurs} onResoudre={handleResoudreErreur} />}
          {view === "factures" && <FacturesView rendezVous={rendezVous} factures={factures} prestations={prestations} garageData={garageData} onGenerer={handleGenererFacture} onMarquerPayee={handleMarquerFacturePayee} onSauvegarder={handleSauvegarderFacture} />}
          {view === "agenda" && <AgendaView onSelectAppt={setSelectedAppt} rendezVous={rendezVous} garageData={garageData} onConnectCalendar={connectGoogleCalendar} clients={clients} prestations={prestations} onCreerRdv={handleCreerRdvManuel} onCreerClient={handleCreerClient} />}
          {view === "demandes" && (
            <DemandesView
              demandes={demandes}
              onSelectDemande={setSelectedDemande}
              onRecommend={handleRecommendedAppointment}
            />
          )}
          {view === "clients" && <ClientsView clients={clients} rendezVous={rendezVous} prestations={prestations} onCreerDevis={handleCreerDevis} onToast={flashToast} />}
          {view === "parametres" && <ParametresView garageData={garageData} onGarageChange={updateGarageField} onSave={saveGarageSettings} prestations={prestations} onAddPrestation={addPrestation} onDeletePrestation={deletePrestation} saving={savingSettings} mecaniciens={mecaniciens} onAddMecanicien={addMecanicien} onToggleMecanicienActif={toggleMecanicienActif} />}
        </div>
      </main>

      <Toast toast={toast} />
      <ApptDetailModal appt={selectedAppt} onClose={() => setSelectedAppt(null)} mecaniciens={mecaniciens} onAssignMecanicien={assignMecanicien} onUpdateStatutAtelier={updateStatutAtelier} onUpdateLienPaiement={updateLienPaiement} />
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
