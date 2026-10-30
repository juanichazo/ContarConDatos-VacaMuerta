# Vaca Muerta de punta a punta

Proyecto para Contar con Datos 2026 (UdeSA).

## Datos

Datos originales en `data/raw/` (hay que descargarlos a parte):

- Producción de pozos de gas y petróleo no convencional (Capítulo IV) – Secretaría de Energía
- Datos de fractura de pozos (Adjunto IV) – Secretaría de Energía
- Listado de pozos cargados por empresas operadoras – Secretaría de Energía
- Capas Areas y Ductos – GeoServer de Hidrocarburos de Neuquén
- Flare Volume Estimates by individual Flare Location 2012–2025 – Banco Mundial
- Vaca Muerta: análisis 2025 – IAE Mosconi

## Correr

```
pip install duckdb pandas geopandas pyarrow openpyxl pdfplumber
python scripts/run_all.py

cd web
npm install
npm run build
```
