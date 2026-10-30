"""Rutas y constantes que usan todos los scripts."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

# datos originales (no se modifican nunca)
RAW_DIR = ROOT / "data" / "raw"
RAW = {
    "prod": RAW_DIR / "produccin-de-pozos-de-gas-y-petrleo-no-convencional.csv",
    "padron": RAW_DIR / "listado-de-pozos-cargados-por-empresas-operadoras.csv",
    "frac": RAW_DIR / "datos-de-fractura-de-pozos-de-hidrocarburos-adjunto-iv-actualizacin-diaria.csv",
    "areas": RAW_DIR / "Areas.application",
    "ductos": RAW_DIR / "Ductos.application",
    "flare": RAW_DIR / "Flare-Volume-Estimates-by-individual-Flare-Location-2012-2025.xlsx",
    "iae": RAW_DIR / "Vaca-Muerta-Analisis-IAE.pdf",
}

# carpetas de salida
PROC = ROOT / "data" / "processed"
CUR = ROOT / "data" / "curated"
REP = ROOT / "reports"
WEBDATA = ROOT / "web" / "src" / "data"

for carpeta in [PROC, CUR, REP, WEBDATA]:
    carpeta.mkdir(parents=True, exist_ok=True)

M3_TO_BBL = 6.28981  # 1 m³ de petróleo = 6,28981 barriles
YEAR = 2025          # año base (2026 todavía está incompleto)
