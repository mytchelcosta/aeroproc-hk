# Implementation Plan: AeroProc Hong Kong (VHHH)

This document tracks the roadmap for the Hong Kong adaptation of the AeroProc procedural visualization tool.

## Phase 1: Regional Foundation (Completed)
Establish the geospatial and localization baseline for the Hong Kong TMA.

- [x] **Map Calibration**: Center map on VHHH (`22.3089, 113.9146`).
- [x] **Magnetic Declination**: Adjust to **3° West**.
- [x] **Persistence Key**: Update Storage Key to `aeroproc_procs_hk`.
- [x] **UI Localization**: Full English/Portuguese support for HK-specific terminology.

## Phase 2: Data Ingestion & Expansion (Completed)
Migrate localized aviation datasets and expand fidelity using industry-standard formats.

- [x] **RNAV Fixes**: Bulk extraction of **884 waypoints** from `.sct` sector files.
- [x] **Navaids**: Integrated 21 VORs and NDBs with precise frequencies.
- [x] **SCT Parser**: Developed `scripts/parse_sct.js` for automated EuroScope data conversion.
- [x] **Runways**: Populated thresholds for VHHH, VMMC, and ZGSZ.

## Phase 3: Airspace & Sector Modeling (Completed)
Detailed modeling of the Hong Kong FIR subdivisions.

- [x] **FIR Boundary**: Precise modeling of the HK FIR.
- [x] **Sub-Sectors**: Implemented overlapping Southern ACC (Radar) and Southern FIS (Information) layers.
- [x] **Central FIS**: Added service volume beneath the TMA footprint.
- [x] **UCARA**: Integrated Uncontrolled Airspace Reporting Areas with standard amber/dashed styling.
- [x] **ATZ Correction**: Corrected HK ATZ categorization and styling (Orange).

## Phase 4: CI/CD & Deployment (Completed)
Establish a professional delivery pipeline.

- [x] **GitHub Actions**: Automated build and deploy workflow.
- [x] **Pages Integration**: Configured repository for Action-based deployment.
- [x] **Live Environment**: Accessible at [mytchelcosta.github.io/aeroproc-hk/](https://mytchelcosta.github.io/aeroproc-hk/).

## Phase 5: Procedure Migration (In Progress)
Migrate instrument procedures from official AIP HK sources.

- [ ] **STAR Definitions**: Implement arrivals (e.g., SIERA, ABBEY, CANTO).
- [ ] **SID Definitions**: Implement departures (e.g., BEKOL, OCEAN).
- [ ] **Procedure JSON**: Centralize data in `procedures_hk.json`.

## Phase 6: Advanced HK Features (Planned)
- [ ] **Airway Network**: Extract `[AIRWAY]` segments from SCT for high-altitude route visualization.
- [ ] **Weather Integration**: Finalize METAR/TAF fetching via Cloudflare Workers.

---

## 📈 Advancement Tracking
| Milestone | Progress | Status |
| :--- | :--- | :--- |
| **Foundation** | 100% | Done |
| **Data Expansion** | 100% | Done |
| **Airspace Modeling** | 100% | Done |
| **CI/CD** | 100% | Done |
| **Procedures** | 10% | Active |

*Last Updated: 2026-05-02*
