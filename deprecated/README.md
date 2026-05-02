# AeroProc — MEDIA Folder

This folder contains all external data sources and reference charts used by the AeroProc application.

---

## 📋 Version Registry

All data source versions, download dates, and update instructions are tracked in:

**[DATA_MANIFEST.json](./DATA_MANIFEST.json)**

> **Always update `DATA_MANIFEST.json` when you replace a data file.**
> Filenames in this folder must never be renamed — the app code references them directly.

---

## 📁 Folder Structure

### CSV Data Files (OurAirports — open source, updated monthly)
| File | Used By App | Purpose |
|---|---|---|
| `airports.csv` | ✅ Yes | Aerodrome markers (Tiers 1/2/3), filtered to 300NM from SBGR |
| `navaids.csv` | ✅ Yes | VOR/NDB markers, filtered to 300NM from SBGR |
| `runways.csv` | 🔜 Future | Runway rendering |
| `airport-frequencies.csv` | 🔜 Future | Frequencies information panel |
| `airport-comments.csv` | ⬜ Reserved | Pilot comments — low priority |
| `countries.csv` | ⬜ Reserved | ISO country codes |
| `regions.csv` | ⬜ Reserved | ISO region codes |

### XLSX Data Files (DECEA AISWEB — AIRAC cycle, every 28 days)
| File | Used By App | Purpose |
|---|---|---|
| `waypoint_aisweb.xlsx` | ✅ Yes | Official Brazilian RNAV fixes, filtered to 300NM from SBGR |

### TXT Data Files (AeroNav Global — updated yearly)
| File | Used By App | Purpose |
|---|---|---|
| `ICAO_Airlines.txt` | ✅ Yes | Callsign lookup (airline name, ICAO code, country) |
| `ICAO_Aircraft.txt` | ✅ Yes | Aircraft type and Wake Turbulence Category lookup |
| `ICAO_Airports.txt` | ❌ Deprecated | No coordinates — superseded by `airports.csv` |

### Aerodrome Chart Folders
Each subfolder contains official instrument charts (PDF) for the respective airport, sourced from **AISWEB DECEA** or **CGNA**:

| Folder | Airport |
|---|---|
| `SBGR/` | Guarulhos Int'l |
| `SBSP/` | Congonhas |
| `SBKP/` | Viracopos |
| `SBSJ/` | São José dos Campos |
| `SBMT/` | Campo de Marte |
| `SBST/` | Santos (Guarujá) |
| `SBJD/` | Jundiaí |
| `SBJH/` | Catarina (São Roque) |
| `SDCO/` | Sorocaba |
| `SDAM/` | Amarais (Campinas) |
| `SBXP/` | Sorocaba Executive |

---

## ⏰ Update Schedule

| Priority | File | Frequency | Source |
|---|---|---|---|
| 🔴 CRITICAL | `waypoint_aisweb.xlsx` | Every 28 days (AIRAC) | [aisweb.decea.mil.br](https://aisweb.decea.mil.br/?i=espaco-aereo&p=fixos) |
| 🟡 IMPORTANT | `airports.csv` | Monthly | [ourairports.com/data/](https://ourairports.com/data/) |
| 🟡 IMPORTANT | `navaids.csv` | Monthly | [ourairports.com/data/](https://ourairports.com/data/) |
| 🟢 LOW | `ICAO_Airlines.txt` | Yearly | AeroNav Global |
| 🟢 LOW | `ICAO_Aircraft.txt` | Yearly | AeroNav Global |

---

*Last reviewed: 2025-04-25*
