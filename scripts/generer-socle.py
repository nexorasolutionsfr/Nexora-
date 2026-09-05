"""Genere un socle SQL fidele a partir du catalogue Postgres lu en lecture seule.

Sortie : un fichier de provisionnement par domaine, dans supabase/socle/.
Aucune donnee metier n'est lue ni reproduite : uniquement des definitions.
"""
import json, os, sys, re

S = "/private/tmp/claude-503/-Users-Baptiste-Downloads/1bb4a1f3-b655-46e7-b868-44ef47b2561e/scratchpad"
W2 = os.path.expanduser("~/Documents/Codex/2026-08-27/files-mentioned-by-the-user-tu/nexora-socle-worktree")
OUT = os.path.join(W2, "supabase", "socle")

def R(f):
    d = json.load(open(os.path.join(S, f)))
    return d["rows"] if isinstance(d, dict) else d

cible = sys.argv[1]  # 'prod' ou 'test'
cols   = R(f"colonnes_{cible}.json")
cons   = R(f"contraintes_{cible}.json")
idx    = R(f"index_{cible}.json")
rls    = R(f"rls_{cible}.json")
pols   = R(f"policies_{cible}.json")
trigs  = R(f"triggers_{cible}.json")
fonc   = R(f"fonctions_{cible}.json")

tables = sorted({c["table_name"] for c in cols})

def q(nom):
    """Quote un identifiant si necessaire. Les noms de policies contiennent
    des espaces et des majuscules sur ce projet : sans guillemets, le SQL
    genere ne compile pas."""
    if re.fullmatch(r"[a-z_][a-z0-9_]*", nom) and nom not in {
        "user", "table", "select", "order", "group", "check", "default", "all"
    }:
        return nom
    return '"' + nom.replace('"', '""') + '"'


def type_sql(c):
    u, dt = c["udt_name"], c["data_type"]
    if dt == "ARRAY":
        return u.lstrip("_") + "[]"
    if dt == "USER-DEFINED":
        return u
    if u == "varchar" and c["character_maximum_length"]:
        return f"varchar({c['character_maximum_length']})"
    if u == "numeric" and c["numeric_precision"] is not None and c["numeric_scale"] is not None:
        return f"numeric({c['numeric_precision']},{c['numeric_scale']})"
    return {"timestamptz":"timestamptz","timestamp":"timestamp","int4":"integer",
            "int8":"bigint","int2":"smallint","bool":"boolean","float8":"double precision",
            "text":"text","uuid":"uuid","jsonb":"jsonb","json":"json","date":"date",
            "time":"time","numeric":"numeric"}.get(u, u)

# ---- 1. tables et colonnes
lignes = []
for t in tables:
    cs = sorted([c for c in cols if c["table_name"] == t], key=lambda x: x["ordinal_position"])
    lignes.append(f"create table if not exists public.{q(t)} (")
    corps = []
    for c in cs:
        d = f"  {q(c['column_name'])} {type_sql(c)}"
        if c["is_generated"] == "ALWAYS" and c["generation_expression"]:
            d += f" generated always as ({c['generation_expression']}) stored"
        elif c["is_identity"] == "YES":
            # Colonne identity : la clause remplace le defaut ET le not null.
            # L'oublier transforme silencieusement la colonne en simple bigint
            # obligatoire, sans sequence — l'insertion echoue alors au premier
            # appel qui ne fournit pas la valeur.
            mode = "always" if c.get("identity_generation") == "ALWAYS" else "by default"
            d += f" generated {mode} as identity not null"
        else:
            if c["column_default"] is not None:
                d += f" default {c['column_default']}"
            if c["is_nullable"] == "NO":
                d += " not null"
        corps.append(d)
    lignes.append(",\n".join(corps))
    lignes.append(");\n")
ecrit_tables = "\n".join(lignes)

# ---- 2. contraintes (hors NOT NULL, deja portees par les colonnes)
ordre = {"p": 0, "u": 1, "c": 2, "f": 3}
cons_tri = sorted([c for c in cons if c["contype"] in ordre],
                  key=lambda c: (ordre[c["contype"]], c["table_name"], c["constraint_name"]))
ecrit_cons = "\n".join(
    f"alter table public.{q(c['table_name'])}\n"
    f"  add constraint {q(c['constraint_name'])} {c['ddl']};"
    for c in cons_tri
)

# ---- 3. index (on saute ceux qui doublonnent une contrainte PK/unique)
noms_cons = {c["constraint_name"] for c in cons if c["contype"] in ("p", "u")}
idx_utiles = [i for i in idx if i["index_name"] not in noms_cons]
ecrit_idx = "\n".join(
    i["ddl"].replace("CREATE INDEX", "create index if not exists", 1)
            .replace("CREATE UNIQUE INDEX", "create unique index if not exists", 1) + ";"
    for i in sorted(idx_utiles, key=lambda x: (x["table_name"], x["index_name"]))
)

# ---- 4. RLS et policies
l = []
for r in sorted(rls, key=lambda x: x["table_name"]):
    if r["rls_active"]:
        l.append(f"alter table public.{q(r['table_name'])} enable row level security;")
ecrit_rls = "\n".join(l)

l = []
for p in sorted(pols, key=lambda x: (x["table_name"], x["policy_name"])):
    roles = ", ".join(q(r.strip('"')) for r in p["roles"].strip("{}").split(","))
    d = [f"create policy {q(p['policy_name'])} on public.{q(p['table_name'])}"]
    d.append(f"  as {p['permissive'].lower()}")
    d.append(f"  for {p['cmd'].lower()}")
    d.append(f"  to {roles}")
    if p["qual"]:
        d.append(f"  using ({p['qual']})")
    if p["with_check"]:
        d.append(f"  with check ({p['with_check']})")
    l.append("\n".join(d) + ";")
ecrit_pols = "\n\n".join(l)

# ---- 5. fonctions
l = [f["ddl"].rstrip().rstrip(";") + ";" for f in sorted(fonc, key=lambda x: (x["nom"], x["args"]))]
ecrit_fonc = "\n\n".join(l)

# ---- 6. triggers
ecrit_trigs = "\n".join(
    t["ddl"] + ";" for t in sorted(trigs, key=lambda x: (x["table_name"], x["trigger_name"]))
)

ENTETE = """-- ATTENTION — CE FICHIER N'EST PAS UNE MIGRATION.
--
-- Il decrit le socle tel qu'il EXISTE, releve en lecture seule sur le projet
-- {cible} le 2026-09-05, par interrogation du catalogue Postgres. Il sert a
-- PROVISIONNER UN ENVIRONNEMENT NEUF (recette, bac a sable, reprise apres
-- sinistre), et a servir de reference ecrite au schema.
--
-- Ne jamais l'executer sur Test ni sur Production : ces bases portent deja ces
-- objets. Les `if not exists` le rendent inoffensif sur une base existante,
-- mais ce n'est pas une raison de l'y lancer.
--
-- Ordre d'execution : 1-tables, 2-contraintes, 3-index, 4-fonctions,
-- 5-triggers, 6-rls-policies.
--
-- Genere automatiquement. Ne pas modifier a la main : regenerer.

"""

os.makedirs(OUT, exist_ok=True)
fichiers = {
    "1-tables.sql":        ecrit_tables,
    "2-contraintes.sql":   ecrit_cons,
    "3-index.sql":         ecrit_idx,
    "4-fonctions.sql":     ecrit_fonc,
    "5-triggers.sql":      ecrit_trigs,
    "6-rls-policies.sql":  ecrit_rls + "\n\n" + ecrit_pols,
}
for nom, contenu in fichiers.items():
    chemin = os.path.join(OUT, nom)
    open(chemin, "w", encoding="utf-8").write(ENTETE.format(cible=cible.upper()) + contenu + "\n")
    print(f"  {nom:<22} {len(contenu.splitlines()):>5} lignes")
