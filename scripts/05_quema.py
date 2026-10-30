"""Paso 5: quema de gas en antorcha.

Datos del Banco Mundial (estimación satelital VIIRS, un volumen por antorcha
y por año). Me quedo con las antorchas de la cuenca y les asigno el pozo de
Vaca Muerta más cercano; si está a menos de 3 km cuento la antorcha como VM.
Escribe quema_sitios.parquet, quema_serie.json y reports/controles_quema.md.
"""
import json

import geopandas as gpd
import pandas as pd

from config import RAW, PROC, REP, YEAR

UMBRAL = 3000  # metros

# --- Antorchas en la cuenca -----------------------------------------------
x = pd.read_excel(RAW["flare"], sheet_name="Dashboard_file")
en_cuenca = (
    x.Country.astype(str).str.contains("Argentina")
    & x.lat.between(-40.5, -35.5)
    & x.lon.between(-71.5, -67)
)
x = x[en_cuenca].copy()
x["vol_mm3"] = x["Flaring Vol (million m3)"]
for col in ["Operator", "Field name", "Field type"]:
    x[col] = x[col].astype(str).replace("nan", "")


# --- Pozo más cercano -----------------------------------------------------
# Trabajo en metros (EPSG:22185, POSGAR zona 5) para medir distancias.
pz = pd.read_parquet(PROC / "vm_pozos_area.parquet")
pz = pz[pz.primera_prod.notna()]
pozos_geo = gpd.GeoDataFrame(
    pz[["idpozo", "area_key", "grupo_operador"]],
    geometry=gpd.points_from_xy(pz.lon, pz.lat),
    crs=4326,
).to_crs(22185)

sitios = x.drop_duplicates("id")[["id", "lat", "lon", "Operator", "Field name", "Field type"]]
sitios_geo = gpd.GeoDataFrame(
    sitios,
    geometry=gpd.points_from_xy(sitios.lon, sitios.lat),
    crs=4326,
).to_crs(22185)

cercano = gpd.sjoin_nearest(sitios_geo, pozos_geo, how="left", distance_col="dist_m")
cercano = cercano.drop_duplicates("id")
cercano["vm"] = cercano.dist_m <= UMBRAL

x = x.merge(cercano[["id", "dist_m", "vm", "area_key", "grupo_operador"]], on="id", how="left")
x.drop(columns=["geometry"], errors="ignore").to_parquet(PROC / "quema_sitios.parquet")


# --- Serie anual: quemado vs producido ------------------------------------
serie = (
    x[x.vm]
    .groupby("Year")
    .agg(sitios=("id", "nunique"), vol_mm3=("vol_mm3", "sum"))
    .reset_index()
)

pm = pd.read_parquet(PROC / "vm_pozo_mes.parquet", columns=["anio", "gas_km3"])
gas = pm.groupby("anio").gas_km3.sum().div(1e3)  # miles de m³ -> millones de m³
gas = gas.rename("gas_mm3").reset_index().rename(columns={"anio": "Year"})

serie = serie.merge(gas, on="Year", how="left")
serie["pct_quemado"] = serie.vol_mm3 / serie.gas_mm3 * 100

# quema del año base por área
y = x[(x.Year == YEAR) & x.vm & (x.vol_mm3 > 0)]
por_area = (
    y.groupby("area_key")
    .agg(sitios=("id", "nunique"), vol_mm3=("vol_mm3", "sum"))
    .sort_values("vol_mm3", ascending=False)
)


# --- Controles ------------------------------------------------------------
L = [
    "# Controles: quema de gas (Banco Mundial, VIIRS)",
    "",
    f"- Antorchas en la caja de la cuenca: {x.id.nunique()}; a ≤{UMBRAL / 1000:.0f} km de un pozo de Vaca Muerta: {cercano.vm.sum()}",
    "- El volumen es una estimación satelital, no un dato declarado. Antorchas cerca de Vaca Muerta pueden incluir instalaciones convencionales.",
    "",
    "| Año | Antorchas | Quemado (MMm³) | Gas producido VM (MMm³) | % |",
    "|---|---|---|---|---|",
]
for r in serie.itertuples():
    L.append(f"| {r.Year} | {r.sitios} | {r.vol_mm3:,.1f} | {r.gas_mm3:,.0f} | {r.pct_quemado:.2f} |")

L += ["", f"## {YEAR}: quema por área (top 15)", ""]
for area, r in por_area.head(15).iterrows():
    L.append(f"- {area}: {r.sitios} antorchas, {r.vol_mm3:.1f} MMm³")

(REP / "controles_quema.md").write_text("\n".join(L), encoding="utf-8")
print("\n".join(L))

json.dump(serie.round(3).to_dict("records"), open(PROC / "quema_serie.json", "w"))
