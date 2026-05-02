export const translations = {
  en: {
    sidebar: {
      brand: "AeroProc",
      title: "Hong Kong TMA",
      loading: "Loading waypoints...",
      tabs: {
        measuring: "Measuring",
        objects: "Objects",
        airspaces: "Airspaces",
        research: "Data",
        view: "View",
        builder: "Builder"
      },
      view: {
        search_placeholder: "Search aerodromes, fixes, NAVAIDs...",
        proc_search_placeholder: "Search procedures...",
        proc_label: "Procedures",
        sort_label: "Group by",
        meas_show: "Show leg measurements",
        meas_hide: "Hide leg measurements",
        sort_options: {
          ad_type: "Aerodrome › Type",
          type_ad: "Type › Aerodrome",
          alpha_asc: "Alphabetical A – Z",
          alpha_desc: "Alphabetical Z – A"
        },
        legend: {
          aerodrome: "Aerodrome",
          fix: "Fix",
          navaid: "NAVAID"
        },
        empty: {
          title: "No Procedures",
          text: "Saved procedures will appear here. Switch to the Builder tab to create one."
        },
        proc_item: {
          common: "Common",
          via: "via",
          pts: "pts",
          pt: "pt",
          edit: "Edit this procedure",
          hide: "Hide on map",
          show: "Show on map",
          delete: "Delete procedure permanently",
          delete_trans: "Delete this transition branch"
        }
      },
      builder: {
        title: "Builder",
        lock: {
          locked: "Locked",
          unlocked: "Unlocked",
          hint: "Unlock to create or edit procedures."
        },
        btn_new: "New Procedure",
        form: {
          title_new: "New Procedure",
          name: "Name",
          type: "Type",
          airport: "Airport",
          runway: "Runway(s)",
          line_style: "Line Style",
          color: "Color",
          btn_start: "▶ Start Drawing"
        },
        panel: {
          search_placeholder: "Search waypoints... (e.g. MUKUS)",
          drop_custom: "Drop Custom Point",
          manual_title: "Manual Point",
          chk_measurements: "Show leg measurements",
          btn_save: "✓ Save & Export",
          btn_cancel: "✕ Cancel",
          empty_msg: "No points yet. Click on the map or use Manual Point above.",
          transition_hint: "It will auto-finish when you click {ident}."
        }
      }
    },
    data_status: {
      modal_title: "Data Currency Status",
      disclaimer_title: "Training Tool Disclaimer:",
      disclaimer_body: "AeroProc is for ATC training purposes only. Always verify all procedures and navigation data against current official charts from AIS Hong Kong CAD before any operational or study use.",
      table: {
        source: "Source",
        age: "Age",
        downloaded: "Downloaded",
        status: "Status",
        days: "days",
        day: "day"
      },
      footer: {
        no_show: "Do not show again this session",
        dismiss: "Understood"
      },
      status: {
        stale: "STALE",
        outdated: "OUTDATED",
        current: "CURRENT"
      },
      badge: {
        stale: "Data Currency: STALE — click to review",
        outdated: "Data Currency: OUTDATED — click to review",
        ok: "All data sources current — click for details"
      }
    },
    map: {
      tools: {
        measuring_vector: {
          title: "Measuring Vector",
          body: "Click map to set origin, then<br>click again to set destination.",
          shortcut_o: "Set origin at cursor",
          shortcut_f: "Set destination at cursor"
        },
        draw_polygon: {
          title: "Draw Polygon",
          body: "Click to place vertices.<br>Double-click to close.<br>Right-click to delete."
        },
        draw_circle: {
          title: "Draw Circle",
          body: "Click centre, then set radius.<br>Click to fix.<br>Right-click to delete."
        },
        draw_line: {
          title: "Draw Line",
          body: "Click to place vertices.<br>Double-click to finalize.<br>Right-click to delete."
        },
        notation: {
          title: "Notation Tool",
          body: "Click map to drop a note.<br>Drag to move.<br>Right-click to edit."
        },
        geopoint: {
          title: "Geo Point Tool",
          body: "Drop precision markers.<br>Shows lat/lon coordinates.<br>Right-click to delete."
        },
        range: {
          title: "DME Range Rings",
          body: "Draw concentric distance rings.<br>Set interval and count.<br>Click map to place."
        },
        objects: {
          title: "Objects",
          body: "Toggle airports, fixes,<br>and NAVAID layers."
        },
        airspaces: {
          title: "Airspaces",
          body: "Toggle TMA and CTR/ATZ<br>airspace overlays."
        },
        research: {
          title: "Research",
          body: "Look up ICAO codes for<br>aircraft types, airlines,<br>and airports."
        },
        live_traffic: {
          title: "Live Traffic",
          body: "Display real-time ADS-B<br>aircraft positions."
        },
        settings: {
          title: "Display Settings",
          body: "Adjust map label size<br>and symbol size."
        }
      },
      weather: {
        btn: "Show Weather",
        loading: "Fetching weather...",
        error: "Weather unavailable",
        taf_na: "TAF not available",
        observed: "Observed",
        labels: {
          wind: "Wind",
          visibility: "Visibility",
          clouds: "Clouds",
          temp_dew: "Temp/Dew",
          qnh: "QNH"
        }
      }
    },
    ui: {
      categories: {
        draw: "Draw",
        data: "Data",
        live: "Live",
        view: "View"
      },
      shortcuts: {
        cancel: "Cancel shape",
        cancel_line: "Cancel line",
        deactivate: "Deactivate mode",
        stop_draw: "⏹ Stop Draw",
        stop_tool: "⏹ Stop Tool"
      },
      panels: {
        range: {
          title: "DME Range Rings",
          label_interval: "Interval (NM)",
          label_count: "Rings (max 20)",
          btn_place: "▶ Place Range",
          label_lat: "Lat",
          label_lon: "Lon",
          btn_here: "Place Here",
          empty_msg: "No ranges yet.<br>Click ▶ Place Range to start."
        },
        geopoint: {
          title: "Geo Points",
          btn_drop: "▶ Drop Point",
          empty_msg: "No points yet.<br>Click ▶ Drop Point to start."
        },
        objects: {
          title: "Objects",
          chk_major: "Major Airports",
          chk_regional: "Regional Airports",
          chk_heliports: "Heliports",
          chk_fixes: "RNAV Fixes",
          chk_navaids: "NAVAIDs"
        },
        airspaces: {
          title: "Airspaces",
          label_fir: "FIR Boundary",
          chk_fir: "Hong Kong FIR",
          label_fir_sectors: "FIR Sectors",
          chk_fir_central_fis: "Central FIS (Beneath TMA)",
          chk_fir_south_fis: "Southern FIS (Information)",
          chk_fir_south_acc: "Southern ACC (Radar)",
          label_overview: "TMA Overview",
          chk_outer: "Outer Boundary",
          label_sectors: "TMA Sectors",
          chk_all: "All Sectors",
          label_terminal: "Terminal Areas",
          chk_ctrs: "CTRs",
          chk_fizs: "FIZs",
          chk_atzs: "ATZs",
          label_vfr_reporting: "VFR & Reporting",
          chk_ucara_1: "UCARA (i)",
          chk_ucara_2: "UCARA (ii)"
        },
        traffic: {
          title: "Live Traffic",
          chk_feed: "Enable ADS-B Feed",
          chk_labels: "Show Labels",
          lbl_callsign: "Callsign",
          lbl_type: "Type & Route",
          lbl_altspd: "Alt & Speed",
          lbl_track: "TRK",
          chk_declutter: "Auto De-clutter",
          label_airport: "Airport",
          legend_other: "Other",
          status_offline: "OFFLINE",
          status_no_feed: "No feed available",
          units: {
            ft: "ft",
            kt: "kt",
            gnd: "GND"
          }
        },
        polygon: {
          title: "Polygon Shapes",
          btn_draw: "▶ Draw New",
          empty_msg: "No polygons yet.<br>Click ▶ Draw New to start."
        },
        circle: {
          title: "Circle Shapes",
          btn_draw: "▶ Draw New",
          empty_msg: "No circles yet.<br>Click ▶ Draw New to start."
        },
        line: {
          title: "Line Shapes",
          btn_draw: "▶ Draw New",
          empty_msg: "No lines yet.<br>Click ▶ Draw New to start."
        },
        actions: {
          zoom: "Zoom to shape",
          hide: "Hide shape",
          show: "Show shape",
          delete: "Delete shape",
          delete_point: "Delete point"
        },
        notation: {
          title: "Notes",
          btn_place: "▶ Place Note",
          empty_msg: "No notes yet.<br>Click ▶ Place Note to start."
        },
        settings: {
          title: "Display Settings",
          label_size: "Label Size",
          symbol_size: "Symbol Size",
          ui_size: "Interface Text"
        },
        research: {
          title: "Research",
          tab_aircraft: "Aircraft",
          tab_airline: "Airline",
          tab_airport: "Airport",
          placeholder: "e.g. B738, GLO, SBGR",
          placeholder_aircraft: "e.g. B738, A320, E175",
          placeholder_airline: "e.g. GLO, TAM, UAL",
          placeholder_airport: "e.g. SBGR, KJFK, EGLL",
          btn_search: "Search",
          empty_msg: "Enter an ICAO code and press Search.",
          searching: "Searching...",
          lookup_error: "Lookup error — check console for details.",
          not_found: "\"{code}\" not found in {category} database.",
          labels: {
            icao: "ICAO",
            manufacturer: "Manufacturer",
            model: "Model",
            wtc: "WTC",
            name: "Name",
            callsign: "Callsign",
            country: "Country"
          }
        }
      }
    }
  },
  pt: {
    sidebar: {
      brand: "AeroProc",
      title: "Hong Kong TMA",
      loading: "Carregando fixos...",
      tabs: {
        measuring: "Medição",
        objects: "Objetos",
        airspaces: "Espaço Aéreo",
        research: "Pesquisa",
        view: "Visualização",
        builder: "Criação"
      },
      view: {
        search_placeholder: "Buscar aeródromos, fixos, auxílios...",
        proc_search_placeholder: "Buscar procedimentos...",
        proc_label: "Procedimentos",
        sort_label: "Agrupar por",
        meas_show: "Mostrar medidas das pernas",
        meas_hide: "Esconder medidas das pernas",
        sort_options: {
          ad_type: "Aeródromo › Tipo",
          type_ad: "Tipo › Aeródromo",
          alpha_asc: "Alfabética A – Z",
          alpha_desc: "Alfabética Z – A"
        },
        legend: {
          aerodrome: "Aeródromo",
          fix: "Fixo",
          navaid: "Auxílio"
        },
        empty: {
          title: "Sem Procedimentos",
          text: "Procedimentos salvos aparecerão aqui. Mude para a aba de Criação para criar um."
        },
        proc_item: {
          common: "Comum",
          via: "via",
          pts: "pts",
          pt: "pt",
          edit: "Editar este procedimento",
          hide: "Esconder no mapa",
          show: "Mostrar no mapa",
          delete: "Excluir procedimento permanentemente",
          delete_trans: "Excluir este ramo de transição"
        }
      },
      builder: {
        title: "Criação",
        lock: {
          locked: "Bloqueado",
          unlocked: "Desbloqueado",
          hint: "Desbloqueie para criar ou editar procedimentos."
        },
        btn_new: "Novo Procedimento",
        form: {
          title_new: "Novo Procedimento",
          name: "Nome",
          type: "Tipo",
          airport: "Aeródromo",
          runway: "Pista(s)",
          line_style: "Estilo da Linha",
          color: "Cor",
          btn_start: "▶ Iniciar Desenho"
        },
        panel: {
          search_placeholder: "Buscar fixos... (ex: MUKUS)",
          drop_custom: "Inserir Ponto Livre",
          manual_title: "Ponto Manual",
          chk_measurements: "Mostrar distâncias das pernas",
          btn_save: "✓ Salvar e Exportar",
          btn_cancel: "✕ Cancelar",
          empty_msg: "Sem pontos ainda. Clique no mapa ou use Ponto Manual acima.",
          transition_hint: "Finalizará automaticamente ao clicar em {ident}."
        }
      }
    },
    data_status: {
      modal_title: "Status de Atualização de Dados",
      disclaimer_title: "Aviso de Ferramenta de Treinamento:",
      disclaimer_body: "AeroProc é apenas para fins de treinamento de ATC. Sempre verifique todos os procedimentos e dados de navegação em cartas oficiais atuais do AIS Hong Kong CAD antes de qualquer uso operacional ou de estudo.",
      table: {
        source: "Fonte",
        age: "Idade",
        downloaded: "Baixado",
        status: "Status",
        days: "dias",
        day: "dia"
      },
      footer: {
        no_show: "Não mostrar novamente nesta sessão",
        dismiss: "Entendido"
      },
      status: {
        stale: "EXPIRADO",
        outdated: "DESATUALIZADO",
        current: "ATUAL"
      },
      badge: {
        stale: "Status de Dados: EXPIRADO — clique para revisar",
        outdated: "Status de Dados: DESATUALIZADO — clique para revisar",
        ok: "Todas as fontes de dados atuais — clique para detalhes"
      }
    },
    map: {
      tools: {
        measuring_vector: {
          title: "Vetor de Medição",
          body: "Clique no mapa para origem, então<br>clique novamente para o destino.",
          shortcut_o: "Definir origem no cursor",
          shortcut_f: "Definir destino no cursor"
        },
        draw_polygon: {
          title: "Desenhar Polígono",
          body: "Clique para colocar vértices.<br>Duplo-clique para fechar.<br>Botão direito para excluir."
        },
        draw_circle: {
          title: "Desenhar Círculo",
          body: "Clique no centro, então o raio.<br>Clique para fixar.<br>Botão direito para excluir."
        },
        draw_line: {
          title: "Desenhar Linha",
          body: "Clique para colocar vértices.<br>Duplo-clique para finalizar.<br>Botão direito para excluir."
        },
        notation: {
          title: "Ferramenta de Notas",
          body: "Clique no mapa para uma nota.<br>Arraste para mover.<br>Botão direito para editar."
        },
        geopoint: {
          title: "Ponto Geográfico",
          body: "Marcadores de precisão.<br>Mostra coordenadas lat/lon.<br>Botão direito para excluir."
        },
        range: {
          title: "Anéis de Alcance DME",
          body: "Desenha anéis de distância.<br>Defina intervalo e quantidade.<br>Clique no mapa para inserir."
        },
        objects: {
          title: "Objetos",
          body: "Alternar visibilidade de<br>aeródromos, fixos e auxílios."
        },
        airspaces: {
          title: "Espaços Aéreos",
          body: "Alternar sobreposições de<br>TMA e CTR/ATZ."
        },
        research: {
          title: "Pesquisa",
          body: "Busque códigos ICAO para<br>aeronaves, empresas aéreas<br>e aeródromos."
        },
        live_traffic: {
          title: "Tráfego em Tempo Real",
          body: "Exibir posições ADS-B<br>de aeronaves em tempo real."
        },
        settings: {
          title: "Ajustes de Exibição",
          body: "Ajustar tamanho de textos<br>e símbolos no mapa."
        }
      },
      weather: {
        btn: "Ver Meteorologia",
        loading: "Buscando met...",
        error: "Met indisponível",
        taf_na: "TAF indisponível",
        observed: "Observado",
        labels: {
          wind: "Vento",
          visibility: "Visibilidade",
          clouds: "Nuvens",
          temp_dew: "Temp/Ponto",
          qnh: "QNH"
        }
      }
    },
    ui: {
      categories: {
        draw: "Desenho",
        data: "Dados",
        live: "Ao Vivo",
        view: "Exibição"
      },
      shortcuts: {
        cancel: "Cancelar forma",
        cancel_line: "Cancelar linha",
        deactivate: "Desativar modo",
        stop_draw: "⏹ Parar Desenho",
        stop_tool: "⏹ Parar Ferramenta"
      },
      panels: {
        range: {
          title: "Anéis de Alcance DME",
          label_interval: "Intervalo (NM)",
          label_count: "Anéis (max 20)",
          btn_place: "▶ Inserir Alcance",
          label_lat: "Lat",
          label_lon: "Lon",
          btn_here: "Inserir Aqui",
          empty_msg: "Sem alcances ainda.<br>Clique em ▶ Inserir Alcance para iniciar."
        },
        geopoint: {
          title: "Pontos Geográficos",
          btn_drop: "▶ Inserir Ponto",
          empty_msg: "Sem pontos ainda.<br>Clique em ▶ Inserir Ponto para iniciar."
        },
        objects: {
          title: "Objetos",
          chk_major: "Aeródromos Principais",
          chk_regional: "Aeródromos Regionais",
          chk_heliports: "Helipontos",
          chk_fixes: "Fixos RNAV",
          chk_navaids: "Auxílios (NAVAIDs)"
        },
        airspaces: {
          title: "Espaços Aéreos",
          label_fir: "Limite de FIR",
          chk_fir: "Hong Kong FIR",
          label_fir_sectors: "Setores FIR",
          chk_fir_central_fis: "FIS Central (Sob TMA)",
          chk_fir_south_fis: "FIS Sul (Informação)",
          chk_fir_south_acc: "ACC Sul (Radar)",
          label_overview: "Visão Geral TMA",
          chk_outer: "Limite Externo",
          label_sectors: "Setores TMA",
          chk_all: "Todos os Setores",
          label_terminal: "Áreas Terminais",
          chk_ctrs: "CTRs",
          chk_fizs: "FIZs",
          chk_atzs: "ATZs",
          label_vfr_reporting: "VFR & Reporte",
          chk_ucara_1: "UCARA (i)",
          chk_ucara_2: "UCARA (ii)"
        },
        traffic: {
          title: "Tráfego Real",
          chk_feed: "Habilitar Feed ADS-B",
          chk_labels: "Mostrar Rótulos",
          lbl_callsign: "Matrícula/Voo",
          lbl_type: "Tipo e Rota",
          lbl_altspd: "Alt e Vel",
          lbl_track: "TRK",
          chk_declutter: "Auto De-clutter",
          label_airport: "Aeródromo",
          legend_other: "Outros",
          status_offline: "OFFLINE",
          status_no_feed: "Feed indisponível",
          units: {
            ft: "pés",
            kt: "kt",
            gnd: "SOLO"
          }
        },
        polygon: {
          title: "Formas Poligonais",
          btn_draw: "▶ Novo Desenho",
          empty_msg: "Sem polígonos ainda.<br>Clique em ▶ Novo Desenho para iniciar."
        },
        circle: {
          title: "Formas Circulares",
          btn_draw: "▶ Novo Desenho",
          empty_msg: "Sem círculos ainda.<br>Clique em ▶ Novo Desenho para iniciar."
        },
        line: {
          title: "Linhas e Trajetos",
          btn_draw: "▶ Novo Desenho",
          empty_msg: "Sem linhas ainda.<br>Clique em ▶ Novo Desenho para iniciar."
        },
        actions: {
          zoom: "Focar na forma",
          hide: "Esconder forma",
          show: "Mostrar forma",
          delete: "Excluir forma",
          delete_point: "Excluir ponto"
        },
        notation: {
          title: "Notas",
          btn_place: "▶ Inserir Nota",
          empty_msg: "Sem notas ainda.<br>Clique em ▶ Inserir Nota para iniciar."
        },
        settings: {
          title: "Ajustes de Exibição",
          label_size: "Tamanho do Texto",
          symbol_size: "Tamanho do Símbolo",
          ui_size: "Texto da Interface"
        },
        research: {
          title: "Pesquisa",
          tab_aircraft: "Aeronave",
          tab_airline: "Empresa",
          tab_airport: "Aeródromo",
          placeholder: "ex: B738, GLO, SBGR",
          placeholder_aircraft: "ex: B738, A320, E175",
          placeholder_airline: "ex: GLO, TAM, UAL",
          placeholder_airport: "ex: SBGR, KJFK, EGLL",
          btn_search: "Pesquisar",
          empty_msg: "Insira um código ICAO e pressione Pesquisar.",
          searching: "Pesquisando...",
          lookup_error: "Erro na pesquisa — verifique o console para detalhes.",
          not_found: "\"{code}\" não encontrado no banco de {category}.",
          labels: {
            icao: "ICAO",
            manufacturer: "Fabricante",
            model: "Modelo",
            wtc: "WTC",
            name: "Nome",
            callsign: "Callsign",
            country: "País"
          }
        }
      }
    }
  }
};
