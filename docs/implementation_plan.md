# Implementation Plan: AeroProc Hong Kong (VHHH)

This document tracks the roadmap for the Hong Kong adaptation of the AeroProc procedural visualization tool.

## Phase 1: Regional Foundation (Completed)
Establish the geospatial and localization baseline for the Hong Kong TMA.

- [x] **Map Calibration**: Center map on VHHH (`22.3089, 113.9146`).
- [x] **Magnetic Declination**: Adjust to **3° West** (updated `Helpers.js` and Compass Rose).
- [x] **Persistence Key**: Update Storage Key to `aeroproc_procs_hk` to isolate local procedures.
- [x] **UI Localization**: Replace all "São Paulo" and "AISWEB" branding with "Hong Kong" and "AIS Hong Kong CAD".

## Phase 2: Data Ingestion (Completed)
Migrate localized aviation datasets from reference material.

- [x] **RNAV Fixes**: Extract and implement 34 waypoints into `fixes_hk.json`.
- [x] **Airspaces**: Define HK TMA, CTR, and ATZ boundaries in `airspaces_aip.json`.
- [x] **Navaids**: Integrated `TD` and `CH` VOR/DME into the primary data loader.
- [x] **Runways**: Manually populate VHHH, VMMC, and ZGSZ threshold coordinates in `DataLoader.js`.

## Phase 3: Traffic Calibration (Completed)
Update the live ADS-B engine for the Hong Kong area.

- [x] **Hub Definition**: Define VHHH, VMMC, and ZGSZ as primary proximity hubs.
- [x] **Color Heuristics**: Update traffic classification logic to identify local flights vs. overflights.
- [x] **Center Point**: Center ADS-B queries on the VHHH coordinates.

## Phase 4: Procedure Migration (Upcoming)
Migrate instrument procedures from the reference HTML/PDFs.

- [ ] **STAR Definitions**: Migrate standard terminal arrivals (e.g., SIERA, ABBEY).
- [ ] **SID Definitions**: Migrate standard instrument departures.
- [ ] **Procedure JSON**: Create `procedures_hk.json` to store these as "built-in" defaults.

## Phase 5: Advanced Features & Refinement (Planned)
Enhance the HK experience with additional data and UI tools.

- [ ] **VFR Corridor Integration**: Research and implement HK REA/REH corridors if data becomes available.
- [ ] **Detailed Airspace**: Implement sub-sector boundaries for the HK TMA if required for vertical training.
- [ ] **Weather Proxy Verification**: Confirm Cloudflare Worker proxy reliably fetches METAR/TAF for HK region airports.
- [ ] **UI Cleanup**: Final audit of all labels to ensure 100% region consistency.

---

## 📈 Advancement Tracking
| Milestone | Progress | Status |
| :--- | :--- | :--- |
| **Foundation** | 100% | Done |
| **Data Migration** | 100% | Done |
| **Traffic Integration** | 100% | Done |
| **Procedures** | 0% | Backlog |
| **Advanced Tools** | 0% | Backlog |

*Last Updated: 2026-05-02*
