"""Paso 4: quién es dueño de cada área y cuánto petróleo le corresponde.

Dos formas de repartir la producción 2025:
  - operado: todo el petróleo va a la empresa que opera el pozo
  - por participación: se reparte según el % de cada socio del área
Los socios salen del campo PARTICIPAC de la capa Areas, corregido con
data/curated/historia_propiedad.csv para las ventas de 2020-2026.
La producción queda fija (2025); lo que cambia entre fechas es quién es dueño.
"""
import json
import re

import pandas as pd

from config import PROC, CUR, REP, YEAR

# --- Empresas -> grupo ----------------------------------------------------
# entidades.csv tiene una expresión regular por grupo. Gana la primera que matchea.
entidades = pd.read_csv(CUR / "entidades.csv")


def grupo(nombre):
    if not isinstance(nombre, str) or not nombre.strip():
        return None
    n = nombre.upper()
    for r in entidades.itertuples():
        if re.search(r.patron, n):
            return r.grupo
    return "SIN MAPEAR: " + nombre.strip()


CAT = dict(zip(entidades.grupo, entidades.categoria))
PAIS = dict(zip(entidades.grupo, entidades.pais_sede))
# Wintershall Dea no está en entidades.csv porque solo aparece en el historial
CAT["Wintershall Dea"] = "Europa"
PAIS["Wintershall Dea"] = "Alemania"


def leer_participacion(texto):
    """Convierte el texto de PARTICIPAC en una lista (grupo, %).

    'YPF S.A.(50%) - Pan American Energy S.L. (Suc. Argentina) (50%)'
    -> [('YPF', 50.0), ('Pan American Energy', 50.0)]
    """
    if not isinstance(texto, str) or "%" not in texto:
        return []
    socios = []
    desde = 0
    for m in re.finditer(r"\(?\s*([\d.,]+)\s*%\s*\)?", texto):
        nombre = texto[desde:m.start()]
        desde = m.end()
        nombre = re.sub(r"\((Suc|Sucursal)[^)]*\)", "", nombre).strip(" -()\t")
        if nombre:
            pct = float(m.group(1).replace(",", "."))
            socios.append((grupo(nombre), pct))
    return socios


areas = pd.read_parquet(PROC / "areas.parquet")
historia = pd.read_csv(CUR / "historia_propiedad.csv", parse_dates=["desde", "hasta"])

pozos = pd.read_parquet(PROC / "vm_pozos_area.parquet")
pozos["grupo_operador"] = pozos.empresa.map(grupo)
pozos.to_parquet(PROC / "vm_pozos_area.parquet")

# socios según el GeoServer (foto de hoy)
geo = {}
for r in areas.itertuples():
    geo[r.key] = leer_participacion(r.PARTICIPAC)

FECHA_VENTA_HARBOUR = pd.Timestamp("2024-09-03")


def duenos(area_key, fecha, operador):
    """Devuelve {grupo: proporción} para un área en una fecha.

    1) si el área está en el historial, uso las filas vigentes en esa fecha
    2) si no, uso el GeoServer
    3) si no hay nada, el operador al 100%
    """
    fecha = pd.Timestamp(fecha)
    d = {}

    h = historia[historia.area_key == area_key]
    if len(h):
        vigentes = h[(h.desde <= fecha) & (h.hasta.isna() | (h.hasta > fecha))]
        d = vigentes.groupby("grupo").participacion.sum().to_dict()
    else:
        for g, p in geo.get(area_key, []):
            d[g] = d.get(g, 0) + p

    if not d:
        d = {operador: 100.0}

    total = sum(d.values())
    resultado = {}
    for g, p in d.items():
        # Harbour compró los activos de Wintershall Dea en sep-2024
        if g == "Harbour Energy" and fecha < FECHA_VENTA_HARBOUR:
            g = "Wintershall Dea"
        resultado[g] = p / total
    return resultado


FECHAS = {
    "2020-12": "2020-12-31",
    "2023-12": "2023-12-31",
    "2025-12": "2025-12-31",
    "2026-10": "2026-10-15",
}

# para el control: áreas cuyo PARTICIPAC no suma 100%
raros = []
for k, socios in geo.items():
    suma = sum(p for _, p in socios)
    if socios and abs(suma - 100) > 0.5:
        raros.append((k, round(suma, 2)))

sin_mapear = set()
for socios in geo.values():
    for g, _ in socios:
        if g and g.startswith("SIN MAPEAR"):
            sin_mapear.add(g)
for g in pozos.grupo_operador.dropna():
    if g.startswith("SIN MAPEAR"):
        sin_mapear.add(g)
sin_mapear = sorted(sin_mapear)


# --- Dueños por área, operador y fecha ------------------------------------
# Un área puede tener varios operadores a lo largo del tiempo: armo todos
# los pares (área, operador) que aparecen en algún mes.
pm0 = pd.read_parquet(PROC / "vm_pozo_mes.parquet", columns=["idpozo", "empresa"])
pm0 = pm0.drop_duplicates().merge(pozos[["idpozo", "area_key"]], on="idpozo")
grupo_de = {e: grupo(e) for e in pm0.empresa.unique()}
pm0["grupo_operador"] = pm0.empresa.map(grupo_de)

pares = pd.concat([
    pm0[["area_key", "grupo_operador"]],
    pozos[["area_key", "grupo_operador"]],
]).drop_duplicates()

filas = []
claves = [pares.area_key.fillna("SIN AREA"), "grupo_operador"]
for (area, operador), _ in pares.groupby(claves, dropna=False):
    area_real = None if area == "SIN AREA" else area
    for foto, fecha in FECHAS.items():
        for g, share in duenos(area_real, fecha, operador).items():
            filas.append({
                "area_key": area,
                "grupo_operador": operador,
                "foto": foto,
                "grupo": g,
                "share": share,
            })
own = pd.DataFrame(filas)
own.to_parquet(PROC / "propiedad_area_foto.parquet")


# --- Producción 2025 repartida --------------------------------------------
pm = pd.read_parquet(
    PROC / "vm_pozo_mes.parquet",
    columns=["idpozo", "anio", "empresa", "pet_m3", "gas_km3"],
)
pm = pm[pm.anio == YEAR].merge(pozos[["idpozo", "area_key"]], on="idpozo")
grupo_de = {e: grupo(e) for e in pm.empresa.unique()}
pm["grupo_operador"] = pm.empresa.map(grupo_de)
pm["area_key"] = pm.area_key.fillna("SIN AREA")

prod = (
    pm.groupby(["area_key", "grupo_operador"])
    .agg(pet=("pet_m3", "sum"), gas=("gas_km3", "sum"))
    .reset_index()
)

m = own.merge(prod, on=["area_key", "grupo_operador"])
m["pet_own"] = m.pet * m.share
m["gas_own"] = m.gas * m.share

TP = prod.pet.sum()
TG = prod.gas.sum()

# % operado por cada grupo
oper = prod.groupby("grupo_operador")[["pet", "gas"]].sum().div([TP, TG]).mul(100)

# % por participación, en cada fecha
porfoto = m.groupby(["foto", "grupo"])[["pet_own", "gas_own"]].sum().div([TP, TG]).mul(100).reset_index()

# lo mismo agrupado por categoría (Argentina, EE.UU., ...)
porfoto["cat"] = porfoto.grupo.map(CAT)
cat_foto = porfoto.groupby(["foto", "cat"])[["pet_own", "gas_own"]].sum().reset_index()
porfoto = porfoto.drop(columns="cat")

oper_cat = oper.assign(cat=oper.index.map(CAT)).groupby("cat")[["pet", "gas"]].sum()

resumen = {
    "nota": f"Producción {YEAR} fija; cambia solo quién es dueño en cada fecha",
    "total_pet_m3": TP,
    "total_gas_km3": TG,
    "operado": oper.round(3).reset_index().rename(columns={"grupo_operador": "grupo"}).to_dict("records"),
    "operado_categoria": oper_cat.round(3).reset_index().to_dict("records"),
    "por_participacion": porfoto.round(3).to_dict("records"),
    "categoria_por_foto": cat_foto.round(3).to_dict("records"),
    "categorias": CAT,
    "paises": PAIS,
}
json.dump(resumen, open(PROC / "propiedad_resumen.json", "w"), ensure_ascii=False, indent=1)


# --- Controles ------------------------------------------------------------
f25 = porfoto[porfoto.foto == "2025-12"].set_index("grupo")

L = [
    "# Controles: propiedad",
    "",
    f"- Grupos sin mapear: {sin_mapear or 'ninguno'}",
    f"- Áreas cuyo PARTICIPAC no suma 100 (se reescalan): {raros}",
    "",
    f"## Petróleo {YEAR}: operado vs por participación (dueños a dic-2025)",
    "",
    "| Grupo | Operado % | Por participación % | Gas operado % | Gas por participación % |",
    "|---|---|---|---|---|",
]
todos = set(oper.index) | set(f25.index)
for g in sorted(todos, key=lambda g: -f25.pet_own.get(g, 0)):
    L.append(
        f"| {g} | {oper.pet.get(g, 0):.1f} | {f25.pet_own.get(g, 0):.1f} "
        f"| {oper.gas.get(g, 0):.1f} | {f25.gas_own.get(g, 0):.1f} |"
    )

L += [
    "",
    f"## Petróleo y gas {YEAR} por categoría de controlante, según la foto de propiedad",
    "",
    "| Foto | Categoría | Petróleo % | Gas % |",
    "|---|---|---|---|",
]
for r in cat_foto.sort_values(["foto", "pet_own"], ascending=[True, False]).itertuples():
    L.append(f"| {r.foto} | {r.cat} | {r.pet_own:.1f} | {r.gas_own:.1f} |")

L += ["", "## Por categoría, si se cuenta por operador (2025)", ""]
for c, r in oper_cat.sort_values("pet", ascending=False).iterrows():
    L.append(f"- {c}: petróleo {r.pet:.1f}%, gas {r.gas:.1f}%")

(REP / "controles_propiedad.md").write_text("\n".join(L), encoding="utf-8")
print("\n".join(L))
