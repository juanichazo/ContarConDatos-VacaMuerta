# Vaca Muerta de punta a punta

Proyecto para Contar con Datos 2026 (UdeSA).

## Datos

Datos originales en `data/raw/` (hay que descargarlos a parte):

- [Producción de petróleo y gas por pozo (Capítulo IV)](https://datos.energia.gob.ar/dataset/produccion-de-petroleo-y-gas-por-pozo), archivo no convencional – Secretaría de Energía
- [Datos de fractura de pozos (Adjunto IV)](https://datos.energia.gob.ar/dataset/datos-de-fractura-de-pozos-adjunto-iv) – Secretaría de Energía
- [Listado de pozos cargados por empresas operadoras](https://datos.energia.gob.ar/dataset/listado-de-pozos-cargados-por-empresas-operadoras) – Secretaría de Energía
- Capas [Areas](https://hidrocarburos.energianeuquen.gob.ar/geoserver/Hidrocarburos/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=Hidrocarburos:Areas&outputFormat=application/json) y [Ductos](https://hidrocarburos.energianeuquen.gob.ar/geoserver/Hidrocarburos/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=Hidrocarburos:Ductos&outputFormat=application/json) – [GeoServer de Hidrocarburos de Neuquén](https://hidrocarburos.energianeuquen.gob.ar/gis)
- [Flare Volume Estimates by individual Flare Location 2012–2025](https://thedocs.worldbank.org/en/doc/b34e0c054bb3fe3695e70154c28eef3f-0400072026/related/Flare-Volume-Estimates-by-individual-Flare-Location-2012-2025.xlsx) – [Banco Mundial](https://www.worldbank.org/en/programs/gasflaringreduction/global-flaring-data)
- [Vaca Muerta: análisis 2025](https://www.iae.org.ar/wp-content/uploads/2026/03/Vaca-Muerta_analisis-2025_vmo_260330_155248.pdf) – IAE Mosconi

Descargados el 28/10/2026. Para validar, comparar con el hash en `data/raw/MANIFEST.sha256` 

## Correr

```
pip install duckdb pandas geopandas pyarrow openpyxl pdfplumber
python scripts/run_all.py

cd web
npm install
npm run build
```
