"""Paso 6: libro contable 2025.

Qué entra a Vaca Muerta (arena, agua, inversión), qué se produce (petróleo,
gas) y a dónde va (exportación, mercado interno, regalías), en unidades
físicas y en dólares. Precios y cifras externas en data/curated/precios_y_cifras.csv.
Escribe dinero.json y reports/libro_contable.md.
"""
import json

import pandas as pd

from config import PROC, CUR, REP, M3_TO_BBL, YEAR

cifras = pd.read_csv(CUR / "precios_y_cifras.csv", comment=None).set_index("clave")


def valor(clave):
    return float(cifras.loc[clave, "valor"])


def fuente(clave):
    return cifras.loc[clave, "fuente"]


def nota(clave):
    return cifras.loc[clave, "nota"]


# --- Datos físicos del año ------------------------------------------------
pm = pd.read_parquet(PROC / "vm_pozo_mes.parquet")
y = pm[pm.anio == YEAR]

fr = pd.read_parquet(PROC / "vm_fractura.parquet")
fy = fr[fr.anio == YEAR]

pz = pd.read_parquet(PROC / "vm_pozos_area.parquet")

pet_bbl = y.pet_m3.sum() * M3_TO_BBL
gas_m3 = y.gas_km3.sum() * 1e3
arena_t = fy.arena_t.sum()
agua_m3 = fy.agua_m3.sum()
etapas = fy.etapas.sum()
pozos_fracturados = fy.idpozo.nunique()


# --- Precios --------------------------------------------------------------
p_pet = valor("precio_pet_usd_bbl")
p_gas = valor("precio_gas_usd_mmbtu")
mmbtu = valor("gas_mmbtu_por_m3")

val_pet = pet_bbl * p_pet
val_gas = gas_m3 * mmbtu * p_gas

# Exportaciones: el IAE da el % exportado de toda la cuenca.
# Supuesto: Vaca Muerta exporta el mismo %.
pct_exp_pet = valor("iae_export_pet_pct")
pct_exp_gas = valor("iae_export_gas_pct")
cuenca_pet = valor("iae_export_pet_mmbbl") / (pct_exp_pet / 100)  # MMbbl producidos en la cuenca
exp_pet_bbl = pet_bbl * pct_exp_pet / 100

# gas exportado: precio implícito = USD exportados / MMBTU exportados (cuenca)
gas_exp_m3 = gas_m3 * pct_exp_gas / 100
gas_int_m3 = gas_m3 * (1 - pct_exp_gas / 100)
p_gas_exp = valor("iae_export_gas_musd") * 1e6 / (valor("iae_export_gas_mmm3") * 1e6 * mmbtu)


def item(lado, clave, etiqueta, fisico, unidad, usd, fuente, nota=""):
    return {
        "lado": lado,
        "clave": clave,
        "etiqueta": etiqueta,
        "fisico": fisico,
        "unidad": unidad,
        "usd": usd,
        "fuente": fuente,
        "nota": nota,
    }


libro = [
    # lo que entra
    item("entra", "arena", "Arena de fractura", arena_t, "t",
         arena_t * valor("precio_arena_pozo_usd_t"),
         f"Adjunto IV; precio: {fuente('precio_arena_pozo_usd_t')}",
         "USD = costo puesto en pozo (145 USD/t); en cantera vale 22 USD/t"),
    item("entra", "agua", "Agua de fractura", agua_m3, "m³", None,
         "Adjunto IV",
         "Sin precio abierto: el canon se cobra en litros de gasoil"),
    item("entra", "camiones", "Viajes de camión con arena",
         arena_t / valor("t_por_viaje_camion"), "viajes", None,
         fuente("t_por_viaje_camion"),
         "Estimación: arena ÷ 38 t por viaje"),
    item("entra", "etapas", "Etapas de fractura", etapas, "etapas", None,
         "Adjunto IV", ""),
    item("entra", "inversion", "Inversión", None, "",
         valor("iae_inversion_vm_musd") * 1e6,
         fuente("iae_inversion_vm_musd"), nota("iae_inversion_vm_musd")),

    # lo que se produce
    item("adentro", "petroleo", "Petróleo producido", pet_bbl, "bbl", val_pet,
         f"Capítulo IV; precio {p_pet} USD/bbl ({fuente('precio_pet_usd_bbl')})", ""),
    item("adentro", "gas", "Gas producido", gas_m3, "m³", val_gas,
         f"Capítulo IV; precio {p_gas} USD/MMBTU ({fuente('precio_gas_usd_mmbtu')})",
         f"Conversión {mmbtu} MMBTU/m³ (a verificar)"),

    # a dónde va
    item("sale", "pet_export", "Petróleo exportado", exp_pet_bbl, "bbl",
         exp_pet_bbl * p_pet,
         fuente("iae_export_pet_pct"),
         f"Se aplica el {pct_exp_pet}% exportado de la cuenca a Vaca Muerta (supuesto)"),
    item("sale", "pet_interno", "Petróleo al mercado interno", pet_bbl - exp_pet_bbl, "bbl",
         (pet_bbl - exp_pet_bbl) * p_pet,
         "Diferencia producción − exportado",
         "Valuado al mismo precio por simplicidad"),
    item("sale", "gas_export", "Gas exportado", gas_exp_m3, "m³",
         gas_exp_m3 * mmbtu * p_gas_exp,
         fuente("iae_export_gas_pct"),
         "Porcentaje de la cuenca aplicado a VM; USD prorrateado del total de la cuenca"),
    item("sale", "gas_interno", "Gas al mercado interno", gas_int_m3, "m³",
         gas_int_m3 * mmbtu * p_gas,
         "Diferencia producción − exportado", ""),
    item("sale", "regalias", "Regalías a Neuquén", None, "",
         valor("iae_regalias_vm_musd") * 1e6,
         fuente("iae_regalias_vm_musd"), nota("iae_regalias_vm_musd")),
]


# --- Barril desarmado -----------------------------------------------------
# Cuánto de cada barril se queda Neuquén, Nación y la empresa, según
# destino (interno / exportación) y régimen (RIGI).
barril = {}
for regimen in ["int", "exp", "rigi"]:
    b = {
        "neuquen": valor(f"barril_{regimen}_neuquen"),
        "nacion": valor(f"barril_{regimen}_nacion"),
        "fob": valor("barril_fob"),
    }
    b["empresa"] = b["fob"] - b["neuquen"] - b["nacion"]
    barril[regimen] = b


# --- Indicadores ----------------------------------------------------------
activos = y[(y.pet_m3 > 0) | (y.gas_km3 > 0)].idpozo.nunique()
nuevos = (pd.to_datetime(pz.primera_prod).dt.year == YEAR).sum()

salida = {
    "anio": YEAR,
    "precios": {
        "pet_usd_bbl": p_pet,
        "gas_usd_mmbtu": p_gas,
        "gas_mmbtu_m3": mmbtu,
        "arena_usd_t": valor("precio_arena_pozo_usd_t"),
    },
    "libro": libro,
    "barril": barril,
    "barril_fuente": fuente("barril_fob"),
    "kpi": {
        "pozos_activos": int(activos),
        "pozos_nuevos": int(nuevos),
        "pozos_fracturados": int(pozos_fracturados),
        "kg_arena_por_bbl": arena_t * 1000 / pet_bbl,
        "m3_agua_por_pozo": agua_m3 / pozos_fracturados,
    },
    "cuenca_pet_mmbbl": cuenca_pet,
}
json.dump(salida, open(PROC / "dinero.json", "w"), ensure_ascii=False, indent=1, default=float)


# --- Reporte --------------------------------------------------------------
def miles(v):
    return "{:,.0f}".format(v) if v else "—"


R = [
    f"# Libro contable {YEAR}",
    "",
    "| Lado | Concepto | Físico | Unidad | USD (M) | Fuente / nota |",
    "|---|---|---|---|---|---|",
]
for i in libro:
    usd = "{:,.0f}".format(i["usd"] / 1e6) if i["usd"] else "—"
    R.append(f"| {i['lado']} | {i['etiqueta']} | {miles(i['fisico'])} | {i['unidad']} | {usd} | {i['fuente']}. {i['nota']} |")

val_total = val_pet + val_gas
R += [
    "",
    f"- Valor de la producción: petróleo {val_pet / 1e9:.2f} mil M USD + gas {val_gas / 1e9:.2f} mil M USD = {val_total / 1e9:.2f} mil M USD",
    f"- Regalías / valor de producción: {valor('iae_regalias_vm_musd') * 1e6 / val_total * 100:.1f}% (regalía legal 12% sobre valor en boca de pozo)",
    f"- Arena por barril: {arena_t * 1000 / pet_bbl:.1f} kg; agua por pozo fracturado: {agua_m3 / pozos_fracturados:,.0f} m³",
    "",
    "## Barril desarmado (USD por 1.000 bbl, FOB 80.500)",
    "",
]
for k, b in barril.items():
    R.append(
        f"- {k}: Neuquén {b['neuquen']:,.0f} ({b['neuquen'] / b['fob'] * 100:.1f}%), "
        f"Nación {b['nacion']:,.0f} ({b['nacion'] / b['fob'] * 100:.1f}%), "
        f"empresa {b['empresa']:,.0f} ({b['empresa'] / b['fob'] * 100:.1f}%)"
    )

(REP / "libro_contable.md").write_text("\n".join(R), encoding="utf-8")
print("\n".join(R))
