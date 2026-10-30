"""Paso 2: fractura (Adjunto IV).

Limpia los datos de fractura de Vaca Muerta y calcula:
  - vm_fractura.parquet:        una fila por campaña de fractura
  - vm_fractura_pozo.parquet:   una fila por pozo (suma de campañas)
  - vm_productividad12.parquet: petróleo de los primeros 12 meses vs arena usada
Escribe reports/controles_fractura.md.
"""
import duckdb
from config import RAW, PROC, REP, M3_TO_BBL, YEAR

con = duckdb.connect()


def consulta(sql):
    return con.execute(sql).fetchall()


def contar(tabla):
    return con.execute(f"select count(*) from {tabla}").fetchone()[0]


# --- Limpieza -------------------------------------------------------------
con.execute(f"""
create table f0 as
select * from read_csv_auto('{RAW['frac']}', header=true, sample_size=-1)
where lower(formacion_productiva) like '%vaca muerta%'
""")
n_original = contar("f0")

# 1) Duplicados de carga: mismo pozo, mismas fechas y mismos valores.
#    Me quedo con la carga más nueva.
con.execute("""
create table f1 as
select * exclude (rn) from (
    select *,
        row_number() over (
            partition by idpozo, fecha_inicio_fractura, fecha_fin_fractura,
                         cantidad_fracturas, arena_bombeada_nacional_tn,
                         arena_bombeada_importada_tn, agua_inyectada_m3
            order by fecha_data desc
        ) as rn
    from f0
)
where rn = 1
""")
n_sin_dup = contar("f1")

# 2) Saco fechas futuras.
# 3) El valor 537.184,6 m³ de agua aparece igual en 3 pozos: es un error de carga.
#    Los ceros los tomo como "sin dato".
con.execute("""
create table f as
select
    idpozo, sigla,
    areapermisoconcesion as area,
    empresa_informante   as empresa,
    fecha_inicio_fractura as fi,
    fecha_fin_fractura    as ff,
    anio_if as anio,
    mes_if  as mes,
    nullif(cantidad_fracturas, 0)         as etapas,
    nullif(longitud_rama_horizontal_m, 0) as rama_m,
    arena_bombeada_nacional_tn  as arena_nac_t,
    arena_bombeada_importada_tn as arena_imp_t,
    nullif(arena_bombeada_nacional_tn + arena_bombeada_importada_tn, 0) as arena_t,
    case
        when agua_inyectada_m3 = 537184.6 then null
        else nullif(agua_inyectada_m3, 0)
    end as agua_m3,
    potencia_equipos_fractura_hp as hp,
    tipo_terminacion
from f1
where fecha_inicio_fractura <= date '2026-10-28'
""")
n_limpio = contar("f")
con.execute(f"copy f to '{PROC / 'vm_fractura.parquet'}' (format parquet)")

# Un pozo puede tener varias campañas: las sumo.
con.execute(f"""
copy (
    select
        idpozo,
        min(fi) as primera_fractura,
        max(ff) as ultima_fractura,
        sum(etapas)      as etapas,
        max(rama_m)      as rama_m,
        sum(arena_t)     as arena_t,
        sum(arena_imp_t) as arena_imp_t,
        sum(agua_m3)     as agua_m3,
        count(*)         as campanias
    from f
    group by idpozo
) to '{PROC / 'vm_fractura_pozo.parquet'}' (format parquet)
""")

por_anio = consulta("""
    select
        anio,
        count(distinct idpozo),
        sum(etapas),
        round(sum(arena_t)),
        round(sum(arena_imp_t)),
        round(sum(agua_m3)),
        round(avg(agua_m3)),
        round(median(agua_m3)),
        round(median(arena_t)),
        round(median(rama_m))
    from f
    where anio >= 2019
    group by 1
    order by 1
""")


# --- Productividad --------------------------------------------------------
# Petróleo de los primeros 12 meses de cada pozo / toneladas de arena.
# Solo pozos que empezaron entre ene-2023 y sep-2025, así todos tienen
# 12 meses completos de datos.
pozo_mes = PROC / "vm_pozo_mes.parquet"
pozos = PROC / "vm_pozos.parquet"
frac_pozo = PROC / "vm_fractura_pozo.parquet"

con.execute(f"""
create table prod12 as
with p as (
    select idpozo, primera_prod
    from '{pozos}'
    where primera_prod between date '2023-01-01' and date '2025-09-01'
),
m as (
    select pm.idpozo, sum(pet_m3) as pet12, sum(gas_km3) as gas12
    from '{pozo_mes}' pm
    join p using (idpozo)
    where pm.fecha >= p.primera_prod
      and pm.fecha <  p.primera_prod + interval 12 month
    group by 1
)
select
    m.*, p.primera_prod,
    z.empresa, z.area, z.tipopozo,
    fp.arena_t, fp.agua_m3, fp.etapas, fp.rama_m
from m
join p using (idpozo)
join '{pozos}' z using (idpozo)
join '{frac_pozo}' fp using (idpozo)
where fp.arena_t > 0
""")
con.execute(f"copy prod12 to '{PROC / 'vm_productividad12.parquet'}' (format parquet)")

por_empresa = consulta(f"""
    select
        empresa,
        count(*) as n,
        round(sum(pet12) * {M3_TO_BBL} / sum(arena_t), 2) as bbl_por_t,
        round(median(pet12 * {M3_TO_BBL} / arena_t), 2)   as med,
        round(median(pet12 * {M3_TO_BBL}))                as bbl12_med,
        round(median(rama_m))                             as rama
    from prod12
    where tipopozo = 'Petrolífero'
    group by 1
    having count(*) >= 10
    order by bbl_por_t desc
""")

arena_anio = consulta(f"select sum(arena_t) from f where anio = {YEAR}")[0][0]
pet_anio = consulta(f"select sum(pet_m3) from '{pozo_mes}' where anio = {YEAR}")[0][0]
kg_por_bbl = arena_anio * 1000 / (pet_anio * M3_TO_BBL)


# --- Controles ------------------------------------------------------------
def celda(i, v):
    # la primera columna es el año: va sin separador de miles
    if i > 0 and isinstance(v, (int, float)) and v is not None:
        return f"{v:,}"
    return str(v)


L = [
    "# Controles: fractura (Adjunto IV, Vaca Muerta)",
    "",
    f"- Filas Vaca Muerta: {n_original}; tras quitar duplicados exactos: {n_sin_dup}; tras quitar fechas futuras: {n_limpio}",
    "- Valor 537.184,6 m³ de agua (3 pozos, idéntico) tratado como error de carga → nulo.",
    "- 2026 está subcargado (la carga mensual cae desde julio-2026), por eso el año base es 2025.",
    "",
    "| Año | Pozos fracturados | Etapas | Arena (t) | Arena importada (t) | Agua (m³) | Agua prom./pozo | Agua mediana/pozo | Arena mediana/pozo (t) | Rama mediana (m) |",
    "|---|---|---|---|---|---|---|---|---|---|",
]
for fila in por_anio:
    celdas = [celda(i, v) for i, v in enumerate(fila)]
    L.append("| " + " | ".join(celdas) + " |")

L += [
    "",
    f"- Arena {YEAR} ÷ petróleo {YEAR}: {kg_por_bbl:.1f} kg por barril (cociente de flujos anuales, no coeficiente técnico)",
    "",
    "## Productividad: barriles de los primeros 12 meses por tonelada de arena (pozos petrolíferos, primera producción ene-2023 a sep-2025, ≥10 pozos)",
    "",
    "| Operador | Pozos | bbl/t (agregado) | bbl/t (mediana) | bbl 12 meses (mediana) | Rama mediana (m) |",
    "|---|---|---|---|---|---|",
]
for empresa, n, bbl_t, med, bbl12, rama in por_empresa:
    L.append(f"| {empresa} | {n} | {bbl_t} | {med} | {bbl12:,.0f} | {rama} |")

(REP / "controles_fractura.md").write_text("\n".join(L), encoding="utf-8")
print("\n".join(L))
