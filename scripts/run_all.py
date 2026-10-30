"""Corre todo el pipeline en orden.

Uso: python scripts/run_all.py
"""
import subprocess
import sys
from pathlib import Path

carpeta = Path(__file__).parent

scripts = [
    "01_produccion.py",
    "02_fractura.py",
    "03_concesiones.py",
    "04_propiedad.py",
    "05_quema.py",
    "06_dinero.py",
    "07_export_web.py",
]

for script in scripts:
    print(f"\n===== {script} =====", flush=True)
    resultado = subprocess.run([sys.executable, str(carpeta / script)], cwd=carpeta)
    if resultado.returncode != 0:
        sys.exit(f"Falló {script}")
