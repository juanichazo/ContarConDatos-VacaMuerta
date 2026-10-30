"""Paso 1: producción de Vaca Muerta.

Lee el Capítulo IV (producción no convencional por pozo y mes), se queda
con la formación Vaca Muerta y arma dos tablas:
  - vm_pozo_mes.parquet: una fila por pozo y mes
  - vm_pozos.parquet:    una fila por pozo, con totales
Al final escribe reports/controles_produccion.md para revisar los números.
"""
import duckdb
from config import RAW, PROC, REP, M3_TO_BBL, YEAR

con = duckdb.connect()


def consulta(sql):
    return con.execute(sql).fetchall()


def uno(sql):
    """Devuelve el primer valor de la primera fila."""
    return con.execute(sql).fetchone()[0]


# --- Tabla pozo-mes -------------------------------------------------------
# Renombro columnas a algo más corto y pongo 0 donde no hay producción.
con.execute(f"""
create table pm as
select
    idpozo, anio, mes,
    make_date(anio::int, mes::int, 1) as fecha,
    coalesce(prod_pet, 0)  as pet_m3,
    coalesce(prod_gas, 0)  as gas_km3,
    coalesce(prod_agua, 0) as agua_m3,
    coalesce(iny_agua, 0)  as iny_agua_m3,
    tef, tipoestado, tipopozo, tipoextraccion,
    trim(idempresa) as idempresa,
    trim(empresa)   as empresa,
    sigla,
    trim(areapermisoconcesion)   as area,
    trim(idareapermisoconcesion) as idarea,
    trim(areayacimiento)         as yacimiento,
    provincia, sub_tipo_recurso, proyecto,
    coordenadax as lon,
    coordenaday as lat,
    profundidad, rectificado, fecha_data
from read_csv_auto('{RAW['prod']}', header=true, sample_size=-1)
where lower(trim(formacion)) = 'vaca muerta'
""")

duplicados = uno("select count(*) - count(distinct (idpozo, anio, mes)) from pm")
con.execute(f"copy pm to '{PROC / 'vm_pozo_mes.parquet'}' (format parquet)")


# --- Tabla de pozos -------------------------------------------------------
# Datos del último mes que reportó cada pozo + sumas de toda su historia.
con.execute(f"""
create table pozos as
with ultimo_mes as (
    select * exclude (rn) from (
        select *, row_number() over (partition by idpozo order by fecha desc) as rn
        from pm
    )
    where rn = 1
),
totales as (
    select
        idpozo,
        min(fecha) filter (where pet_m3 > 0 or gas_km3 > 0) as primera_prod,
        max(fecha) filter (where pet_m3 > 0 or gas_km3 > 0) as ultima_prod,
        sum(pet_m3)  as pet_acum_m3,
        sum(gas_km3) as gas_acum_km3,
        sum(pet_m3)  filter (where anio = {YEAR}) as pet_{YEAR}_m3,
        sum(gas_km3) filter (where anio = {YEAR}) as gas_{YEAR}_km3,
        sum(agua_m3) filter (where anio = {YEAR}) as agua_prod_{YEAR}_m3,
        sum(pet_m3)  filter (where anio = 2026) as pet_2026p_m3,
        sum(gas_km3) filter (where anio = 2026) as gas_2026p_km3
    from pm
    group by idpozo
)
select
    u.idpozo, u.sigla, u.idempresa, u.empresa, u.area, u.idarea, u.yacimiento,
    u.provincia, u.lon, u.lat, u.tipopozo, u.sub_tipo_recurso, u.profundidad,
    u.fecha as ultimo_reporte,
    t.* exclude (idpozo)
from ultimo_mes u
join totales t using (idpozo)
""")
con.execute(f"copy pozos to '{PROC / 'vm_pozos.parquet'}' (format parquet)")


# --- Controles ------------------------------------------------------------
total = consulta(f"select sum(pet_m3), sum(gas_km3) from pm where anio = {YEAR}")[0]
pet_total, gas_total = total[0], total[1]

activos = uno(f"""
    select count(distinct idpozo) from pm
    where anio = {YEAR} and (pet_m3 > 0 or gas_km3 > 0)
""")
nuevos = uno(f"select count(*) from pozos where year(primera_prod) = {YEAR}")
sin_prod = uno("select count(*) from pozos where primera_prod is null")
ultimo_mes = uno("select max(fecha) from pm")
filas = uno("select count(*) from pm")
n_pozos = uno("select count(*) from pozos")

por_mes = consulta("""
    select
        strftime(fecha, '%Y-%m'),
        count(distinct idpozo),
        count(distinct idpozo) filter (where pet_m3 > 0 or gas_km3 > 0),
        round(sum(pet_m3) * 6.28981 / 1e6, 2),
        round(sum(gas_km3) / 1e3, 1)
    from pm
    where fecha >= '2024-09-01'
    group by 1
    order by 1
""")
por_operador = consulta(f"""
    select empresa, sum(pet_m3) as p, sum(gas_km3) as g
    from pm
    where anio = {YEAR}
    group by 1
    order by p desc
""")
coords = consulta("""
    select
        count(*) filter (where lon between -71 and -67 and lat between -40 and -34),
        count(*)
    from pozos
""")[0]
por_provincia = consulta("select provincia, count(*) from pozos group by 1 order by 2 desc")

pet_mmbbl = pet_total * M3_TO_BBL / 1e6
dif_pet = (pet_mmbbl / 182.2 - 1) * 100       # IAE: 182,2 millones de barriles
dif_gas = (gas_total / 1e3 / 27401 - 1) * 100  # IAE: 27.401 millones de m³

L = [
    "# Controles: producción Vaca Muerta (Capítulo IV no convencional)",
    "",
    f"- Filas pozo-mes Vaca Muerta: {filas:,}; duplicados pozo-mes: {duplicados}",
    f"- Pozos: {n_pozos:,} ({sin_prod} nunca produjeron); por provincia: {por_provincia}",
    f"- Último mes con datos: {ultimo_mes}",
    f"- Coordenadas dentro de la caja de la cuenca: {coords[0]} de {coords[1]} (coordenadax = longitud, coordenaday = latitud)",
    f"- {YEAR}: petróleo {pet_total:,.0f} m³ = {pet_mmbbl:.2f} MMbbl; gas {gas_total:,.0f} miles de m³ = {gas_total / 1e6:.2f} bcm",
    f"- Control IAE {YEAR}: 182,2 MMbo y 27.401 MMm³ → diferencia petróleo {dif_pet:+.1f}%, gas {dif_gas:+.1f}%",
    f"- Pozos activos en {YEAR}: {activos:,}; pozos con primera producción en {YEAR}: {nuevos}",
    "",
    "## Pozos que reportan por mes (sep-2024 en adelante)",
    "",
    "| Mes | Pozos que reportan | Pozos con producción | Petróleo (MMbbl) | Gas (MMm³) |",
    "|---|---|---|---|---|",
]
for mes, reportan, producen, pet, gas in por_mes:
    L.append(f"| {mes} | {reportan:,} | {producen:,} | {pet} | {gas:,} |")

L += [
    "",
    f"## Petróleo y gas {YEAR} por operador (Capítulo IV)",
    "",
    "| Operador | Petróleo % | Gas % |",
    "|---|---|---|",
]
for empresa, pet, gas in por_operador:
    # solo operadores con más de 0,1% de petróleo o de gas
    if pet / pet_total > 0.001 or gas / gas_total > 0.001:
        L.append(f"| {empresa} | {pet / pet_total * 100:.1f} | {gas / gas_total * 100:.1f} |")

(REP / "controles_produccion.md").write_text("\n".join(L), encoding="utf-8")
print("\n".join(L[:12]))
