"""Paso 7: archivos livianos para la web (web/src/data).

  - pozos.json:     una lista por columna (más chico que una lista de objetos)
  - areas.geojson:  polígonos simplificados + dueños en cada fecha
  - ductos.geojson, quema.json
  - meta.json:      grupos, categorías y los resúmenes de los pasos anteriores
"""
import json
import os
import re

import geopandas as gpd
import pandas as pd
from shapely.geometry import shape, mapping

from config import RAW, PROC, CUR, WEBDATA, M3_TO_BBL, YEAR

pz = pd.read_parquet(PROC / "vm_pozos_area.parquet")
fr = pd.read_parquet(PROC / "vm_fractura_pozo.parquet")
p12 = pd.read_parquet(PROC / "vm_productividad12.parquet")[["idpozo", "pet12", "gas12"]]
own = pd.read_parquet(PROC / "propiedad_area_foto.parquet")
res = json.load(open(PROC / "propiedad_resumen.json"))
CAT = res["categorias"]
PAIS = res["paises"]

entidades = pd.read_csv(CUR / "entidades.csv")


def grupo(nombre):
    # igual que en 04_propiedad, pero lo que no matchea va a "Otras argentinas"
    for r in entidades.itertuples():
        if re.search(r.patron, str(nombre).upper()):
            return r.grupo
    return "Otras argentinas"


def redondear(x, n=0):
    """Redondea para achicar el JSON. Con n=0 devuelve un entero; NaN -> None."""
    if pd.isna(x):
        return None
    if n:
        return round(float(x), n)
    return int(round(float(x)))


def mes(fecha):
    if pd.isna(fecha):
        return None
    return pd.Timestamp(fecha).strftime("%Y-%m")


# --- Operador 2025 de cada pozo -------------------------------------------
# Es la empresa que reportó más meses en 2025. Si el pozo no produjo en 2025,
# queda el último operador.
pm = pd.read_parquet(PROC / "vm_pozo_mes.parquet", columns=["idpozo", "anio", "empresa", "pet_m3"])
op25 = (
    pm[pm.anio == YEAR]
    .groupby(["idpozo", "empresa"])
    .size()
    .reset_index(name="n")
    .sort_values("n")
    .drop_duplicates("idpozo", keep="last")
)
op25 = op25[["idpozo", "empresa"]].rename(columns={"empresa": "emp25"})

pz = pz.merge(op25, on="idpozo", how="left")
pz["op"] = pz.emp25.fillna(pz.empresa).map(grupo)
pz = pz.merge(fr, on="idpozo", how="left")
pz = pz.merge(p12, on="idpozo", how="left")
pz["area_key"] = pz.area_key.fillna("SIN AREA")


# --- Índices --------------------------------------------------------------
# En el JSON guardo números en vez de nombres; la web los traduce con meta.json.
todos_grupos = set(pz.op) | set(own.grupo)
grupos = sorted(todos_grupos, key=lambda g: (list(CAT.get(g, "Otros")), g))
gi = {g: i for i, g in enumerate(grupos)}

areas_keys = sorted(pz.area_key.unique())
ai = {a: i for i, a in enumerate(areas_keys)}

CATS = ["Argentina", "Mixto", "EE.UU.", "Europa", "Asia y Medio Oriente", "Latinoamérica", "Otros"]
TIPO = {"Petrolífero": "P", "Gasífero": "G"}


# --- pozos.json -----------------------------------------------------------
cols = {
    "id": pz.idpozo.astype(int).tolist(),
    "sigla": pz.sigla.fillna("").tolist(),
    "lon": [round(v, 5) for v in pz.lon],
    "lat": [round(v, 5) for v in pz.lat],
    "area": [ai[a] for a in pz.area_key],
    "op": [gi[g] for g in pz.op],
    "tipo": [TIPO.get(t, "O") for t in pz.tipopozo],
    "ini": [mes(d) for d in pz.primera_prod],
    "ult": [mes(d) for d in pz.ultima_prod],
    "pet25": [redondear(v * M3_TO_BBL) for v in pz.pet_2025_m3],     # barriles
    "gas25": [redondear(v / 1e3, 3) for v in pz.gas_2025_km3],       # millones de m³
    "petAc": [redondear(v * M3_TO_BBL) for v in pz.pet_acum_m3],
    "gasAc": [redondear(v / 1e3, 2) for v in pz.gas_acum_km3],
    "pet26": [redondear(v * M3_TO_BBL) for v in pz.pet_2026p_m3],
    "arena": [redondear(v) for v in pz.arena_t],
    "agua": [redondear(v) for v in pz.agua_m3],
    "etapas": [redondear(v) for v in pz.etapas],
    "rama": [redondear(v) for v in pz.rama_m],
    "frac": [mes(d) for d in pz.primera_fractura],
    "pet12": [redondear(v * M3_TO_BBL) for v in pz.pet12],
}
json.dump(cols, open(WEBDATA / "pozos.json", "w"), separators=(",", ":"))


# --- areas.geojson --------------------------------------------------------
ag = pd.read_parquet(PROC / "areas.parquet")
# según la versión de pandas la geometría puede venir como bytes (WKB)
if ag.geometry.dtype == object and isinstance(ag.geometry.iloc[0], bytes):
    geometria = gpd.GeoSeries.from_wkb(ag.geometry)
else:
    geometria = ag.geometry
ag = gpd.GeoDataFrame(ag, geometry=geometria, crs=4326)

q = pd.read_parquet(PROC / "quema_sitios.parquet")
q25 = q[(q.Year == YEAR) & q.vm & (q.vol_mm3 > 0)]
quema_area = q25.groupby("area_key").vol_mm3.sum()

tot = pz.groupby("area_key").agg(
    pet=("pet_2025_m3", "sum"),
    gas=("gas_2025_km3", "sum"),
    pozos=("idpozo", "count"),
)

feats = []
for k in areas_keys:
    # dueños en cada fecha: mismo reparto para todos los operadores del área
    fotos = {}
    for foto, sub in own[own.area_key == k].groupby("foto"):
        w = sub.groupby("grupo").share.mean()
        w = w / w.sum()
        w = w.sort_values(ascending=False)
        fotos[foto] = [[gi[g], round(s, 4)] for g, s in w.items() if g in gi]

    fila = ag[ag.key == k]
    hay = len(fila) > 0
    geom = None
    if hay:
        geom = mapping(fila.geometry.iloc[0].simplify(0.0015, preserve_topology=True))

    t = tot.loc[k]
    props = {
        "i": ai[k],
        "nombre": fila.NOMBRE.iloc[0] if hay else k.title(),
        "tipo": fila.TIPO_AREA.iloc[0] if hay else "",
        "operador": fila.OPERADOR.iloc[0] if hay else "",
        "fin": str(fila.FIN_CONTRATO.iloc[0])[:10] if hay else "",
        "participac": fila.PARTICIPAC.iloc[0] if hay else "",
        "fotos": fotos,
        "pet25": redondear(t.pet * M3_TO_BBL),
        "gas25": redondear(t.gas / 1e3, 2),
        "pozos": int(t.pozos),
        "quema25": redondear(quema_area.get(k, 0), 2),
    }
    feats.append({"type": "Feature", "geometry": geom, "properties": props})

con_geometria = [f for f in feats if f["geometry"]]
json.dump(
    {"type": "FeatureCollection", "features": con_geometria},
    open(WEBDATA / "areas.geojson", "w"),
    separators=(",", ":"),
    ensure_ascii=False,
)
json.dump(
    [f["properties"] for f in feats],
    open(WEBDATA / "areas_props.json", "w"),
    separators=(",", ":"),
    ensure_ascii=False,
)


# --- ductos.geojson -------------------------------------------------------
capa = json.load(open(RAW["ductos"], encoding="utf-8"))
ductos = []
for f in capa["features"]:
    if not f["geometry"]:
        continue
    p = f["properties"]
    ductos.append({
        "type": "Feature",
        "geometry": mapping(shape(f["geometry"]).simplify(0.001)),
        "properties": {
            "n": p.get("NOMBRE") or "",
            "f": p.get("FLUIDO") or "",
            "t": (p.get("TIPO") or "").strip(),
            "op": (p.get("OPERADOR") or "").strip(),
            "cap": p.get("CAP_MAX"),
        },
    })
json.dump(
    {"type": "FeatureCollection", "features": ductos},
    open(WEBDATA / "ductos.geojson", "w"),
    separators=(",", ":"),
    ensure_ascii=False,
)


# --- quema.json -----------------------------------------------------------
quema = {
    "lon": [round(v, 4) for v in q25.lon],
    "lat": [round(v, 4) for v in q25.lat],
    "vol": [round(v, 2) for v in q25.vol_mm3],
    "area": [ai.get(a, -1) for a in q25.area_key.fillna("SIN AREA")],
    "campo": q25["Field name"].tolist(),
}
json.dump(quema, open(WEBDATA / "quema.json", "w"), separators=(",", ":"), ensure_ascii=False)


# --- meta.json ------------------------------------------------------------
# quema / gas producido por área (solo áreas con más de 5 MMm³ de gas)
gas_area = tot.gas / 1e3
quema_ratio = (quema_area / gas_area.reindex(quema_area.index)).dropna().sort_values(ascending=False)
quema_ratio_area = []
for a, v in quema_ratio.items():
    if gas_area[a] > 5:
        quema_ratio_area.append({
            "area": a,
            "quema_mm3": round(float(quema_area[a]), 2),
            "gas_mm3": round(float(gas_area[a]), 1),
            "pct": round(float(v) * 100, 2),
        })

# barriles de los primeros 12 meses por tonelada de arena, por grupo
prod_emp = pd.read_parquet(PROC / "vm_productividad12.parquet")
prod_emp["grupo"] = prod_emp.empresa.map(grupo)
pe = (
    prod_emp[prod_emp.tipopozo == "Petrolífero"]
    .groupby("grupo")
    .agg(n=("idpozo", "count"), pet=("pet12", "sum"), arena=("arena_t", "sum"), rama=("rama_m", "median"))
)
pe = pe[pe.n >= 10]
pe["bbl_t"] = pe.pet * M3_TO_BBL / pe.arena
productividad = []
for g, v in pe.sort_values("bbl_t", ascending=False).iterrows():
    productividad.append({
        "grupo": g,
        "n": int(v.n),
        "bbl_por_t": round(v.bbl_t, 2),
        "rama_med": redondear(v.rama),
    })

# arena, agua y etapas por año (para el paso de arena y agua)
frac = pd.read_parquet(PROC / "vm_fractura.parquet")
frac = frac[(frac.anio >= 2019) & (frac.anio <= YEAR)]
por_anio = frac.groupby("anio").agg(
    pozos=("idpozo", "nunique"),
    etapas=("etapas", "sum"),
    arena_t=("arena_t", "sum"),
    agua_m3=("agua_m3", "sum"),
)
fractura_anual = []
for anio, v in por_anio.iterrows():
    fractura_anual.append({
        "anio": int(anio),
        "pozos": int(v.pozos),
        "etapas": int(v.etapas),
        "arena_t": round(float(v.arena_t)),
        "agua_m3": round(float(v.agua_m3)),
    })

meta = {
    "anio": YEAR,
    "grupos": [{"i": gi[g], "nombre": g, "cat": CAT.get(g, "Otros"), "pais": PAIS.get(g, "")} for g in grupos],
    "categorias": CATS,
    "areas": areas_keys,
    "propiedad": res,
    "dinero": json.load(open(PROC / "dinero.json")),
    "quema_serie": json.load(open(PROC / "quema_serie.json")),
    "quema_ratio_area": quema_ratio_area,
    "nodos": pd.read_csv(CUR / "nodos.csv").to_dict("records"),
    "flujos": pd.read_csv(CUR / "flujos.csv").fillna("").to_dict("records"),
    "productividad": productividad,
    "fractura_anual": fractura_anual,
}
json.dump(meta, open(WEBDATA / "meta.json", "w"), ensure_ascii=False, separators=(",", ":"), default=float)

for nombre in sorted(os.listdir(WEBDATA)):
    print(nombre, os.path.getsize(WEBDATA / nombre) // 1024, "KB")
print("quema/gas por área:", meta["quema_ratio_area"][:8])
