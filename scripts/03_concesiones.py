"""Paso 3: a qué área (concesión) pertenece cada pozo.

Usa la capa Areas del GeoServer de Neuquén. Cada pozo se une a su área de
dos formas:
  - por nombre: el nombre de área que trae el Capítulo IV
  - por ubicación: el polígono que contiene al pozo
Si el nombre coincide con un área de la capa se usa ese; si no, la ubicación.
Escribe vm_pozos_area.parquet, areas.parquet y reports/controles_concesiones.md.
"""
import json
import re
import unicodedata

import geopandas as gpd
import pandas as pd
from shapely.geometry import shape

from config import RAW, PROC, REP


def norm(nombre):
    """Normaliza un nombre de área para poder comparar: sin tildes, en
    mayúsculas y con los guiones y espacios uniformes."""
    if nombre is None or (isinstance(nombre, float) and pd.isna(nombre)):
        return None
    s = unicodedata.normalize("NFKD", str(nombre)).encode("ascii", "ignore").decode().upper()
    s = re.sub(r"\s*-\s*", " - ", s)
    s = re.sub(r"\s+", " ", s).strip()
    if s.startswith("LA RIBERA"):
        s = s.replace(" BLOQUE I", " I")
    return s


# nombres de producción que en la capa están juntos en un solo polígono
ALIAS = {
    "LA RIBERA I": "LA RIBERA I Y II",
    "LA RIBERA II": "LA RIBERA I Y II",
}


# --- Áreas ----------------------------------------------------------------
capa = json.load(open(RAW["areas"], encoding="utf-8"))
filas = []
for f in capa["features"]:
    fila = dict(f["properties"])
    fila["geometry"] = shape(f["geometry"])
    filas.append(fila)
areas = gpd.GeoDataFrame(filas, crs="EPSG:4326")
areas["key"] = areas["NOMBRE"].map(norm)

# Algunas áreas aparecen varias veces porque el polígono está partido:
# las junto en una sola.
areas_d = areas.dissolve(by="key", aggfunc="first").reset_index()
areas_d = areas_d[[
    "key", "NOMBRE", "TIPO_AREA", "TITULAR", "PARTICIPAC", "OPERADOR",
    "INI_CONTRATO", "FIN_CONTRATO", "NORMA_LEGAL", "geometry",
]]
keys = set(areas_d.key)


# --- Pozos ----------------------------------------------------------------
pozos = pd.read_parquet(PROC / "vm_pozos.parquet")

# unión por nombre
pozos["key_prod"] = pozos["area"].map(norm).map(lambda k: ALIAS.get(k, k))

# unión por ubicación (punto dentro de polígono)
puntos = gpd.GeoDataFrame(
    pozos,
    geometry=gpd.points_from_xy(pozos.lon, pozos.lat),
    crs="EPSG:4326",
)
espacial = gpd.sjoin(
    puntos[["idpozo", "geometry"]],
    areas_d[["key", "geometry"]],
    how="left",
    predicate="within",
)
espacial = espacial.drop_duplicates("idpozo")
espacial = espacial[["idpozo", "key"]].rename(columns={"key": "key_geo"})
pozos = pozos.merge(espacial, on="idpozo", how="left")

# elijo: primero el nombre, si no existe en la capa, la ubicación
nombre_ok = pozos.key_prod.isin(keys)
pozos["area_key"] = pozos.key_prod.where(nombre_ok, pozos.key_geo)

pozos["match"] = "sin_area"
pozos.loc[pozos.key_geo.notna(), "match"] = "espacial"
pozos.loc[nombre_ok, "match"] = "nombre"

pozos.drop(columns=["geometry"], errors="ignore").to_parquet(PROC / "vm_pozos_area.parquet")
areas_d.to_parquet(PROC / "areas.parquet")


# --- Controles ------------------------------------------------------------
pet25 = pozos.pet_2025_m3.fillna(0)
pct_sin_area = pet25[pozos.match == "sin_area"].sum() / pet25.sum() * 100

con_ambos = nombre_ok & pozos.key_geo.notna()
coinciden = (pozos.key_prod == pozos.key_geo)[con_ambos].mean() * 100

L = [
    "# Controles: pozo ↔ área (capa Areas de Neuquén)",
    "",
    f"- Áreas en la capa: {len(areas)} polígonos, {len(areas_d)} nombres únicos.",
    f"- Pozos por tipo de unión: {pozos.match.value_counts().to_dict()}",
    f"- Petróleo 2025 sin área asignada: {pct_sin_area:.2f}%",
    f"- Coincidencia nombre vs ubicación (pozos con ambos): {coinciden:.1f}%",
    "",
    "## Áreas de producción sin match por nombre",
    "",
]
sin_nombre = (
    pozos[~nombre_ok]
    .groupby(["area", "provincia", "key_geo"], dropna=False)
    .agg(pozos=("idpozo", "count"), pet25=("pet_2025_m3", "sum"))
    .reset_index()
)
for r in sin_nombre.itertuples():
    L.append(f"- {r.area} ({r.provincia}) → espacial: {r.key_geo}; pozos {r.pozos}; petróleo 2025 {r.pet25:,.0f} m³")

(REP / "controles_concesiones.md").write_text("\n".join(L), encoding="utf-8")
print("\n".join(L))
