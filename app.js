



// --- Constantes y Estado Global ---
        const MONTHS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
        const FULL_MONTHS = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
        const GASTOS_SHEET_NAME = "Gastos";
        const INGRESOS_SHEET_NAME = "Ingresos";
        const STORAGE_KEY = 'expensasAppCentauroState_v2.5_Fixes'; // Version bump for fixes
        // --- MODIFICADO: Nombre Rubro Principal ---
        const CUOTA_RUBRO_NAME = "Expensas Ordinarias"; // Rubro principal para multiplicar x UF y base de Expensa Real
        const EXTRA_CUOTA_RUBRO_NAME = "Expensas Extraordinarias"; // Otro rubro a multiplicar x UF
        const SPECIAL_INGRESO_RUBROS = [CUOTA_RUBRO_NAME, EXTRA_CUOTA_RUBRO_NAME]; // Actualizado automáticamente

        let appState = getDefaultAppState(); // Iniciar con estado por defecto limpio

        // --- Inicialización ---
        document.addEventListener('DOMContentLoaded', () => {
            console.log(`DOM Cargado. Inicializando App ${STORAGE_KEY}...`);
            loadState(); // Cargar estado guardado si existe
            initTheme(); // Aplicar tema (antes de cualquier render que dependa de él)

            // Asegurar que exista al menos un escenario activo y válido
            validateAndSetActiveScenario();

            // --- MODIFICADO: Update UI instructions with the correct name ---
            const cuotaInfoSpan = document.getElementById('cuota-rubro-name-info');
            if (cuotaInfoSpan) cuotaInfoSpan.textContent = CUOTA_RUBRO_NAME; // Usa la constante actualizada

            initUI(); // Inicializar elementos de la UI que dependen del estado inicial
            addEventListeners(); // Añadir listeners globales
            updateUI(); // Renderizar todo con el estado actual/cargado
            console.log(`App ${STORAGE_KEY} Inicializada.`);
        });

        // --- Validación y Selección de Escenario Activo ---
        function validateAndSetActiveScenario() {
            let activeKeyIsValid = false;
            if (appState.activeScenarioKey && appState.scenarios[appState.activeScenarioKey]) {
                const activeYear = parseInt(appState.activeScenarioKey.split('_')[0]);
                if (appState.currentYear === activeYear) {
                    activeKeyIsValid = true;
                } else {
                    console.warn(`Mismatch: currentYear (${appState.currentYear}) vs activeScenarioKey year (${activeYear}). Adjusting currentYear.`);
                    appState.currentYear = activeYear;
                    activeKeyIsValid = true; // Key itself is valid, just needed year sync
                }
            }

            if (!activeKeyIsValid) {
                console.warn(`Clave activa inválida o ausente: ${appState.activeScenarioKey}. Buscando alternativa...`);
                // Try finding Base for current year
                const currentYearBaseKey = `${appState.currentYear}_Base`;
                // Try finding any scenario for current year
                const firstKeyForCurrentYear = Object.keys(appState.scenarios).find(k => k.startsWith(`${appState.currentYear}_`));
                // Try finding the very first scenario available
                const firstKeyOverall = Object.keys(appState.scenarios)[0];

                let fallbackKey = null;
                if (appState.scenarios[currentYearBaseKey]) {
                    fallbackKey = currentYearBaseKey;
                } else if (firstKeyForCurrentYear) {
                    fallbackKey = firstKeyForCurrentYear;
                } else if (firstKeyOverall) {
                    fallbackKey = firstKeyOverall;
                }

                if (fallbackKey) {
                    console.log(`Cambiando a escenario de fallback: ${fallbackKey}`);
                    appState.activeScenarioKey = fallbackKey;
                    appState.currentYear = parseInt(fallbackKey.split('_')[0]); // Update year based on the found key
                } else {
                    // No scenarios exist at all, create the default Base
                    console.log("No existen escenarios. Creando Base para el año actual.");
                    appState.currentYear = new Date().getFullYear();
                    initScenarioData(appState.currentYear); // Creates Base by default
                    appState.activeScenarioKey = `${appState.currentYear}_Base`;
                }
                saveState(); // Save potentially corrected state
            }

             // Ensure the selected scenario data structure is complete
             const currentScenario = getCurrentScenarioData();
             if (currentScenario) {
                initializeScenarioDataForRubros(currentScenario);
             }
        }


        // --- Gestión de Datos del Escenario ---
        function getCurrentScenarioData() {
             if (!appState.activeScenarioKey || !appState.scenarios[appState.activeScenarioKey]) {
                console.error(`Error Crítico: No se pudo obtener un escenario activo válido (actual: ${appState.activeScenarioKey}). Intentando recuperación.`);
                 // Attempt recovery one last time - this shouldn't be reached if validateAndSetActiveScenario works
                 validateAndSetActiveScenario();
                 if (!appState.activeScenarioKey || !appState.scenarios[appState.activeScenarioKey]){
                     // Still no valid scenario - critical state
                     showSnackbar("Error crítico: No se puede operar sin un escenario válido.", true, 'error', 10000);
                     // Maybe disable parts of the UI?
                     return null; // Indicate failure
                 }
             }
            return appState.scenarios[appState.activeScenarioKey];
        }

        function initScenarioData(year, scenarioName = 'Base') {
            const key = `${year}_${scenarioName.replace(/\s+/g, '_')}`;
            if (!appState.scenarios[key]) {
                console.log(`Inicializando nuevo escenario: ${key}`);
                // Start with a deep copy of the default structure's scenario part
                 const defaultScenarioStructure = JSON.parse(JSON.stringify(getDefaultAppState().scenarios.BaseExample || {
                     year: year,
                     scenarioName: scenarioName,
                     rubroOrder: { gastos: [], ingresos: [] },
                     data: { gastos: {}, ingresos: {} },
                     monthStatus: { gastos: {}, ingresos: {} },
                     reserveFund: { type: 'percent', values: Array(12).fill(5) },
                     calculated: {
                         gastoAjustado: {}, totalGastoRubroMes: {}, totalGastoProyectadoMes: Array(12).fill(0),
                         ingresoAjustado: {}, totalIngresoRubroMes: {}, totalIngresoProyectadoMes: Array(12).fill(0),
                         fondoReservaMes: Array(12).fill(0),
                         cuotaSobreGastosMes: Array(12).fill(0),
                         ipcManual: Array(12).fill(0),
                         cuotaIpcMes: Array(12).fill(0),
                         cuotaRealBaseMes: Array(12).fill(0), // Now Expensa Real Base
                         annualTotals: {
                             gastos: {__TOTAL__:0}, ingresos: {__TOTAL__:0}, fondoReserva: 0,
                             cuotaSobreGastos: 0, cuotaIpc: 0, cuotaRealBase: 0 // Now Expensa Real Base
                         }
                     }
                 }));
                 // Override year and name
                 defaultScenarioStructure.year = year;
                 defaultScenarioStructure.scenarioName = scenarioName;
                 // Copy global IPC settings into the new scenario's initial IPC snapshot
                 defaultScenarioStructure.calculated.ipcManual = [...appState.settings.ipcManual];

                 appState.scenarios[key] = defaultScenarioStructure;

                 // Ensure structures for existing global rubros are created within this new scenario
                initializeScenarioDataForRubros(appState.scenarios[key]);
            }
            return appState.scenarios[key];
        }


        function initializeScenarioDataForRubros(scenarioData) {
             if (!scenarioData) {
                console.warn("initializeScenarioDataForRubros llamado sin datos de escenario.");
                return;
             }

             // Ensure top-level structures exist using nullish coalescing
             scenarioData.rubroOrder = scenarioData.rubroOrder ?? { gastos: [], ingresos: [] };
             scenarioData.data = scenarioData.data ?? { gastos: {}, ingresos: {} };
             scenarioData.monthStatus = scenarioData.monthStatus ?? { gastos: {}, ingresos: {} };
             scenarioData.reserveFund = scenarioData.reserveFund ?? { type: 'percent', values: Array(12).fill(5) };
             scenarioData.calculated = scenarioData.calculated ?? {}; // Ensure calculated object exists
             scenarioData.calculated.annualTotals = scenarioData.calculated.annualTotals ?? {}; // Ensure annualTotals object exists

             // Ensure default calculated arrays/objects exist if missing
             const defaultCalculated = getDefaultAppState().scenarios.BaseExample?.calculated || {
                 gastoAjustado: {}, totalGastoRubroMes: {}, totalGastoProyectadoMes: Array(12).fill(0),
                 ingresoAjustado: {}, totalIngresoRubroMes: {}, totalIngresoProyectadoMes: Array(12).fill(0),
                 fondoReservaMes: Array(12).fill(0), cuotaSobreGastosMes: Array(12).fill(0), ipcManual: Array(12).fill(0), cuotaIpcMes: Array(12).fill(0), cuotaRealBaseMes: Array(12).fill(0),
                 annualTotals: { gastos: {__TOTAL__:0}, ingresos: {__TOTAL__:0}, fondoReserva: 0, cuotaSobreGastos: 0, cuotaIpc: 0, cuotaRealBase: 0 }
             };

             for(const key in defaultCalculated) {
                if(scenarioData.calculated[key] === undefined || scenarioData.calculated[key] === null) {
                     // Deep copy arrays/objects from default to avoid reference issues
                     scenarioData.calculated[key] = JSON.parse(JSON.stringify(defaultCalculated[key]));
                }
                 // Ensure nested annualTotals are objects
                if(key === 'annualTotals') {
                     scenarioData.calculated.annualTotals.gastos = scenarioData.calculated.annualTotals.gastos ?? { __TOTAL__: 0 };
                     scenarioData.calculated.annualTotals.ingresos = scenarioData.calculated.annualTotals.ingresos ?? { __TOTAL__: 0 };
                }
             }
             // Ensure ipcManual array exists and has 12 elements
             if (!Array.isArray(scenarioData.calculated.ipcManual) || scenarioData.calculated.ipcManual.length !== 12) {
                scenarioData.calculated.ipcManual = [...appState.settings.ipcManual]; // Copy from global settings
             }


             // Iterate through GLOBAL rubro lists from settings
             ['gastos', 'ingresos'].forEach(type => {
                 // Ensure type-specific structures exist in scenario
                 scenarioData.rubroOrder[type] = scenarioData.rubroOrder[type] ?? [];
                 scenarioData.data[type] = scenarioData.data[type] ?? {};
                 scenarioData.monthStatus[type] = scenarioData.monthStatus[type] ?? {};
                 scenarioData.calculated.annualTotals[type] = scenarioData.calculated.annualTotals[type] ?? { __TOTAL__: 0 };

                 // Process each rubro defined in global settings
                 appState.settings.rubros[type].forEach(rubro => {
                     // Ensure data/status structures for the rubro exist in the scenario
                     if (!scenarioData.data[type][rubro]) {
                         scenarioData.data[type][rubro] = { detailOrder: [], detailsData: {} };
                     }
                     if (!scenarioData.monthStatus[type][rubro]) {
                         scenarioData.monthStatus[type][rubro] = {}; // Initialize as object
                     }
                     // Initialize detailOrder/detailsData inside data[type][rubro] if they are missing
                     scenarioData.data[type][rubro].detailOrder = scenarioData.data[type][rubro].detailOrder ?? [];
                     scenarioData.data[type][rubro].detailsData = scenarioData.data[type][rubro].detailsData ?? {};


                     // Initialize calculated substructures if missing
                     if (type === 'gastos') {
                        scenarioData.calculated.gastoAjustado = scenarioData.calculated.gastoAjustado ?? {};
                        scenarioData.calculated.totalGastoRubroMes = scenarioData.calculated.totalGastoRubroMes ?? {};
                        if (!scenarioData.calculated.gastoAjustado[rubro]) scenarioData.calculated.gastoAjustado[rubro] = {};
                        if (!scenarioData.calculated.totalGastoRubroMes[rubro]) scenarioData.calculated.totalGastoRubroMes[rubro] = Array(12).fill(0);
                     } else { // ingresos
                        scenarioData.calculated.ingresoAjustado = scenarioData.calculated.ingresoAjustado ?? {};
                        scenarioData.calculated.totalIngresoRubroMes = scenarioData.calculated.totalIngresoRubroMes ?? {};
                         if (!scenarioData.calculated.ingresoAjustado[rubro]) scenarioData.calculated.ingresoAjustado[rubro] = {};
                         if (!scenarioData.calculated.totalIngresoRubroMes[rubro]) scenarioData.calculated.totalIngresoRubroMes[rubro] = Array(12).fill(0);
                     }

                     // Initialize annual totals for the rubro if missing
                     if (scenarioData.calculated.annualTotals[type][rubro] === undefined) {
                         scenarioData.calculated.annualTotals[type][rubro] = 0;
                     }
                 });
             });
        }


        // --- Lógica de Negocio y Cálculos ---
        function calculateAll(scenarioData) {
             console.log(`Recalculando TODO para: ${scenarioData?.year} - ${scenarioData?.scenarioName}`);
             if (!scenarioData) { console.error("CalculateAll: No scenario data provided."); renderEmptyState(); return; }

             // Ensure structures are complete before calculating
             initializeScenarioDataForRubros(scenarioData);

             const { data, monthStatus, reserveFund, rubroOrder } = scenarioData;
             const { settings } = appState;
             const { rubros, rubroConfig, coefficientTypes, cantidadUnidades, ipcManual } = settings; // Use GLOBAL settings IPC
             const calculated = scenarioData.calculated; // Direct reference

             // --- Reset Calculated Values ---
             calculated.gastoAjustado = {}; calculated.totalGastoRubroMes = {}; calculated.totalGastoProyectadoMes = Array(12).fill(0);
             calculated.ingresoAjustado = {}; calculated.totalIngresoRubroMes = {}; calculated.totalIngresoProyectadoMes = Array(12).fill(0);
             calculated.fondoReservaMes = Array(12).fill(0);
             calculated.cuotaSobreGastosMes = Array(12).fill(0);
             calculated.cuotaIpcMes = Array(12).fill(0); // Reset Cuota IPC
             calculated.cuotaRealBaseMes = Array(12).fill(0); // Reset Expensa Real Base
             calculated.ipcManual = [...ipcManual]; // Store snapshot of IPC used for this calculation

             calculated.annualTotals = {
                gastos: { __TOTAL__: 0 },
                ingresos: { __TOTAL__: 0 },
                fondoReserva: 0,
                cuotaSobreGastos: 0,
                cuotaIpc: 0,        // Reset Annual Cuota IPC
                cuotaRealBase: 0   // Reset Annual Expensa Real Base
             };
             // Ensure annual total objects exist (redundant with initialize, but safe)
             calculated.annualTotals.gastos = { __TOTAL__: 0 };
             calculated.annualTotals.ingresos = { __TOTAL__: 0 };
             // --- End Reset ---


             // 1. Gastos Ajustados y Totales
             // Use scenario-specific rubro order if available, otherwise process all in data
             const gastoRubrosToProcess = Array.isArray(rubroOrder?.gastos) && rubroOrder.gastos.length > 0
                                          ? rubroOrder.gastos
                                          : Object.keys(data?.gastos || {});

             gastoRubrosToProcess.forEach(rubro => {
                 if (!settings.rubros.gastos.includes(rubro)) {
                     console.warn(`Skipping calc for gasto rubro "${rubro}" not in settings or data.`);
                     return;
                 }
                 // Ensure data structure exists for this rubro
                 if (!data.gastos || !data.gastos[rubro]) {
                    console.warn(`Data missing for gasto rubro "${rubro}" during calculation.`);
                    return;
                 }

                 // Initialize calculated structures for this rubro
                 calculated.gastoAjustado[rubro] = {};
                 calculated.totalGastoRubroMes[rubro] = Array(12).fill(0);
                 calculated.annualTotals.gastos[rubro] = 0;

                 const config = rubroConfig[rubro] || {};
                 const coefTypeKey = config.coefficientType || 'None';
                 // Use .values directly, handle potential undefined type
                 const coefValues = coefficientTypes[coefTypeKey]?.values || Array(12).fill(1);

                 // Use scenario-specific detail order if available, otherwise process all in data
                 const detailOrder = Array.isArray(data.gastos[rubro].detailOrder) && data.gastos[rubro].detailOrder.length > 0
                                     ? data.gastos[rubro].detailOrder
                                     : Object.keys(data.gastos[rubro].detailsData || {});

                 detailOrder.forEach(detail => {
                      // Ensure data structure exists for this detail
                      if (!data.gastos[rubro].detailsData || data.gastos[rubro].detailsData[detail] === undefined) {
                           console.warn(`Data missing for gasto detail "${rubro}/${detail}" during calculation.`);
                           return;
                      }
                     calculated.gastoAjustado[rubro][detail] = Array(12).fill(0);
                     const baseValues = data.gastos[rubro].detailsData[detail] || Array(12).fill(0);
                     // Ensure status array exists
                     const statusArray = (monthStatus.gastos && monthStatus.gastos[rubro] && monthStatus.gastos[rubro][detail])
                                         ? monthStatus.gastos[rubro][detail]
                                         : Array(12).fill('Estimado');


                     for (let i = 0; i < 12; i++) {
                         const base = parseFloat(baseValues[i] || 0);
                         let adjusted = base;
                         // Apply coefficient only if the month is marked as 'Estimado'
                         if (statusArray[i] === 'Estimado') {
                             adjusted = base * parseFloat(coefValues[i] || 1);
                         }
                         // Store the final value (adjusted or base)
                         calculated.gastoAjustado[rubro][detail][i] = adjusted;
                         // Add to monthly total for the rubro using the final value
                         calculated.totalGastoRubroMes[rubro][i] += adjusted;
                     }
                 });

                 // Sum monthly totals for the rubro to overall monthly/annual totals
                 for (let i = 0; i < 12; i++) {
                     const monthTotalRubro = calculated.totalGastoRubroMes[rubro]?.[i] || 0;
                     calculated.totalGastoProyectadoMes[i] += monthTotalRubro;
                     calculated.annualTotals.gastos[rubro] += monthTotalRubro;
                 }
             });
             calculated.annualTotals.gastos.__TOTAL__ = calculated.totalGastoProyectadoMes.reduce((a, b) => a + b, 0);


             // 2. Ingresos Ajustados & Totales & Expensa Real Base Extraction
             const unidades = parseInt(cantidadUnidades) || 1;
             const ingresoRubrosToProcess = Array.isArray(rubroOrder?.ingresos) && rubroOrder.ingresos.length > 0
                                            ? rubroOrder.ingresos
                                            : Object.keys(data?.ingresos || {});

             ingresoRubrosToProcess.forEach(rubro => {
                 if (!settings.rubros.ingresos.includes(rubro)) {
                     console.warn(`Skipping calc for ingreso rubro "${rubro}" not in settings or data.`);
                     return;
                 }
                  // Ensure data structure exists for this rubro
                  if (!data.ingresos || !data.ingresos[rubro]) {
                     console.warn(`Data missing for ingreso rubro "${rubro}" during calculation.`);
                     return;
                  }

                 calculated.ingresoAjustado[rubro] = {}; // Stores BASE values for detail display
                 calculated.totalIngresoRubroMes[rubro] = Array(12).fill(0); // Stores FINAL calculated value (incl. UF mult)
                 calculated.annualTotals.ingresos[rubro] = 0;

                 const detailOrder = Array.isArray(data.ingresos[rubro].detailOrder) && data.ingresos[rubro].detailOrder.length > 0
                                     ? data.ingresos[rubro].detailOrder
                                     : Object.keys(data.ingresos[rubro].detailsData || {});

                 detailOrder.forEach(detail => {
                      // Ensure data structure exists for this detail
                      if (!data.ingresos[rubro].detailsData || data.ingresos[rubro].detailsData[detail] === undefined) {
                           console.warn(`Data missing for ingreso detail "${rubro}/${detail}" during calculation.`);
                           return;
                      }
                     const baseValues = data.ingresos[rubro].detailsData[detail] || Array(12).fill(0);
                     // Store BASE values in 'ingresoAjustado' for the detail table display
                     calculated.ingresoAjustado[rubro][detail] = baseValues.map(v => parseFloat(v || 0));

                     // --- Store Base for Expensa Real --- MODIFICADO
                     // If this is the primary cuota rubro AND the first detail, store its base values
                     if (rubro === CUOTA_RUBRO_NAME && detail === detailOrder[0]) {
                         for (let i = 0; i < 12; i++){
                            calculated.cuotaRealBaseMes[i] = parseFloat(baseValues[i] || 0);
                         }
                     }
                     // --- End Store Base ---

                     // Calculate the contribution of this detail's BASE value to the monthly rubro total (before UF mult)
                     for (let i = 0; i < 12; i++) {
                         calculated.totalIngresoRubroMes[rubro][i] += parseFloat(baseValues[i] || 0);
                     }
                 });

                 // After summing all details for the rubro, apply multiplication if it's a special rubro
                 if (SPECIAL_INGRESO_RUBROS.includes(rubro)) {
                     for (let i = 0; i < 12; i++) {
                         calculated.totalIngresoRubroMes[rubro][i] *= unidades;
                     }
                 }

                 // Sum the final calculated monthly totals for the rubro to the overall ingreso totals and annuals
                 for (let i = 0; i < 12; i++) {
                     const monthTotalRubroFinal = calculated.totalIngresoRubroMes[rubro]?.[i] || 0;
                     calculated.totalIngresoProyectadoMes[i] += monthTotalRubroFinal;
                     calculated.annualTotals.ingresos[rubro] += monthTotalRubroFinal;
                 }
             });
             calculated.annualTotals.ingresos.__TOTAL__ = calculated.totalIngresoProyectadoMes.reduce((a, b) => a + b, 0);


             // 3. Fondo Reserva
             for (let i = 0; i < 12; i++) {
                 const reserveValueInput = parseFloat(reserveFund?.values?.[i] || 0);
                 calculated.fondoReservaMes[i] = reserveFund?.type === 'percent'
                     ? calculated.totalGastoProyectadoMes[i] * (reserveValueInput / 100)
                     : reserveValueInput;
             }
             calculated.annualTotals.fondoReserva = calculated.fondoReservaMes.reduce((a, b) => a + b, 0);


             // 4. Cuota Sobre Gastos (Gasto + Fondo / UF)
             for (let i = 0; i < 12; i++) {
                 const totalGastoYFondo = (calculated.totalGastoProyectadoMes[i] || 0) + (calculated.fondoReservaMes[i] || 0);
                 calculated.cuotaSobreGastosMes[i] = unidades > 0 ? totalGastoYFondo / unidades : 0;
             }


             // 5. Cuota IPC (Cuota s/Gs * (1 + IPC%)) - Use IPC snapshot stored in calculated.ipcManual
             for (let i = 0; i < 12; i++) {
                 const cuotaBase = calculated.cuotaSobreGastosMes[i] || 0;
                 const ipc = parseFloat(calculated.ipcManual?.[i] || 0); // Use stored IPC
                 calculated.cuotaIpcMes[i] = cuotaBase * (1 + ipc / 100);
             }

             // 6. Calculate Annual Totals for new/modified columns
             calculated.annualTotals.cuotaSobreGastos = calculated.cuotaSobreGastosMes.reduce((a, b) => a + b, 0);
             calculated.annualTotals.cuotaIpc = calculated.cuotaIpcMes.reduce((a, b) => a + b, 0); // Sum calculated IPC cuotas
             calculated.annualTotals.cuotaRealBase = calculated.cuotaRealBaseMes.reduce((a, b) => a + b, 0); // Sum base real expensas


             console.log("Recálculo Finalizado.", calculated);
             saveState(); // Save state after successful calculation
             updateUI(); // Update the display
             showSnackbar("Cálculos actualizados correctamente.", false, 'success');
        }

        // --- Recalcular Estimados (ACUMULATIVO) ---
        function recalculateEstimates() {
            const scenarioData = getCurrentScenarioData();
            if (!scenarioData) { showSnackbar("No hay escenario activo para calcular estimados.", true, 'error'); return; }
            console.log(`Calculando estimados (Acumulativo) para: ${scenarioData.scenarioName}`);

            const { data, monthStatus, rubroOrder } = scenarioData;
            const { settings } = appState;
            const { rubros, rubroConfig, coefficientTypes } = settings;
            let changesMade = false;

            // Ensure rubroOrder.gastos exists and is an array
             const gastoRubrosToProcess = Array.isArray(rubroOrder?.gastos) ? rubroOrder.gastos : [];

            gastoRubrosToProcess.forEach(rubro => {
                if (!settings.rubros.gastos.includes(rubro)) return; // Skip rubros not in settings
                if (!data.gastos || !data.gastos[rubro]) return; // Skip if rubro data missing

                // Ensure detailOrder exists and is an array
                const detailOrder = Array.isArray(data.gastos[rubro].detailOrder) ? data.gastos[rubro].detailOrder : [];

                const rubroCoefConfig = rubroConfig[rubro] || {};
                const coefTypeKey = rubroCoefConfig.coefficientType || 'None';
                // Use .values directly, handle potential undefined type
                const coefValues = coefficientTypes[coefTypeKey]?.values || Array(12).fill(1);

                detailOrder.forEach(detail => {
                     if (!data.gastos[rubro].detailsData || data.gastos[rubro].detailsData[detail] === undefined) return; // Skip if detail data missing

                    // Ensure data and status arrays exist before accessing them
                    const currentStatuses = (monthStatus.gastos && monthStatus.gastos[rubro] && monthStatus.gastos[rubro][detail])
                                            ? monthStatus.gastos[rubro][detail]
                                            : Array(12).fill('Estimado');
                    const currentData = data.gastos[rubro].detailsData[detail] || Array(12).fill(0);

                    let lastRealMonthIndex = -1;
                    for (let i = currentStatuses.length - 1; i >= 0; i--) { // Iterate backwards
                        if (currentStatuses[i] === 'REAL') {
                            lastRealMonthIndex = i;
                            break;
                        }
                    }

                    if (lastRealMonthIndex === -1) {
                         // console.log(`   - ${rubro}/${detail}: Sin mes REAL encontrado, no se proyectará.`);
                         return; // Skip projection if no REAL month found
                    }

                    let previousMonthValue = parseFloat(currentData[lastRealMonthIndex] || 0); // Base value from the last REAL month

                    for (let j = lastRealMonthIndex + 1; j < 12; j++) {
                        const coefficient = parseFloat(coefValues[j] || 1);
                        // Accumulative calculation: multiply the PREVIOUS month's value by the CURRENT month's coefficient
                        const projectedValue = previousMonthValue * coefficient;

                        // Get current value, default to 0 if undefined
                        const currentMonthValue = data.gastos[rubro].detailsData[detail][j] ?? 0;

                        // Update only if the projected value is different OR if the status needs changing from REAL
                        if (currentMonthValue !== projectedValue || currentStatuses[j] !== 'Estimado') {
                            // Ensure nested structures exist before assigning (redundant with earlier checks, but safe)
                            if (!data.gastos[rubro]) data.gastos[rubro] = { detailOrder: [], detailsData: {} };
                            if (!data.gastos[rubro].detailsData[detail]) data.gastos[rubro].detailsData[detail] = Array(12).fill(0);
                            if (!monthStatus.gastos[rubro]) monthStatus.gastos[rubro] = {};
                            if (!monthStatus.gastos[rubro][detail]) monthStatus.gastos[rubro][detail] = Array(12).fill('Estimado');

                            data.gastos[rubro].detailsData[detail][j] = projectedValue;
                            monthStatus.gastos[rubro][detail][j] = 'Estimado'; // Ensure status is Estimado
                            changesMade = true;
                            // console.log(`     * ${MONTHS[j]} (${rubro}/${detail}): ${projectedValue.toFixed(2)} (Prev: ${previousMonthValue.toFixed(2)} * Coef: ${coefficient})`);
                        }
                        // Update previousMonthValue for the next iteration *using the newly calculated projected value*
                        previousMonthValue = projectedValue;
                    }
                });
            });

            if (changesMade) {
                console.log("Se realizaron cambios en los estimados, recalculando todo...");
                showSnackbar("Meses estimados recalculados (acum.). Actualizando dashboard...", false, 'info', 4000);
                calculateAll(scenarioData); // Recalculate everything after projections
            } else {
                console.log("No se necesitaron cambios en los estimados.");
                showSnackbar("No se encontraron meses estimados que requieran recalcular.", false, 'info');
            }
        }


        // --- Actualización de la Interfaz (UI) ---
        function initUI() {
             document.getElementById('exercise-year')?.setAttribute('value', appState.currentYear);
             document.getElementById('footer-year').textContent = new Date().getFullYear();
             updateScenarioSelector(); // Populate selector based on loaded state
             updateCurrentYearAndScenarioInUI(); // Set initial text based on active scenario/year
        }

        function updateUI() {
             console.log("Actualizando UI completa...");
             const scenarioData = getCurrentScenarioData(); // Get current data
             if (!scenarioData) {
                 console.error("updateUI: No hay escenario activo o datos disponibles. Renderizando estado vacío.");
                 renderEmptyState(); // Show empty state if no data
                 updateCurrentYearAndScenarioInUI(); // Still update year/scenario display (might show 'Ninguno')
                 updateScenarioSelector(); // Update selector too (might show empty)
                 updateReportsPanel(); // Disable report buttons
                 updateSettingsPanel(); // Update settings panel based on global state
                 return; // Stop further UI updates
             }

             // If we have data, ensure it's properly initialized
             initializeScenarioDataForRubros(scenarioData);

             // Update all relevant UI sections
             updateCurrentYearAndScenarioInUI();
             updateScenarioSelector(); // Ensure selector reflects current state
             updateDashboardTables(scenarioData); // Update summary and detail tables
             updateCharts(scenarioData); // Update all charts
             updateReserveFundPanel(scenarioData); // Update reserve fund inputs
             updateSettingsPanel(); // Update settings lists and inputs
             updateReportsPanel(); // Enable/disable report buttons
             console.log("UI Actualizada.");
        }

        function renderEmptyState() {
            console.log("Renderizando estado vacío...");
            // Clear tables
            const summaryTbody = document.getElementById('dashboard-summary')?.querySelector('tbody');
            const summaryTfoot = document.getElementById('dashboard-summary')?.querySelector('tfoot');
             const summaryHeaderCells = document.getElementById('dashboard-summary')?.querySelector('thead tr')?.cells?.length || 7;
            if(summaryTbody) summaryTbody.innerHTML = `<tr><td colspan="${summaryHeaderCells}" class="text-muted" style="text-align: center; padding: 20px;">No hay datos calculados para este escenario. Carga datos o usa los de ejemplo.</td></tr>`;
            if(summaryTfoot) summaryTfoot.innerHTML = '';

            const gastosTheadCells = document.getElementById('gastos-detail-table')?.querySelector('thead tr')?.cells?.length || 14;
            const gastosTbody = document.getElementById('gastos-detail-table')?.querySelector('tbody');
            const gastosTfoot = document.getElementById('gastos-detail-table')?.querySelector('tfoot');
            if(gastosTbody) gastosTbody.innerHTML = `<tr><td colspan="${gastosTheadCells}" class="text-muted" style="text-align: center; padding: 20px;">No hay datos de gastos.</td></tr>`;
            if(gastosTfoot) gastosTfoot.innerHTML = '';

            const ingresosTheadCells = document.getElementById('ingresos-detail-table')?.querySelector('thead tr')?.cells?.length || 14;
            const ingresosTbody = document.getElementById('ingresos-detail-table')?.querySelector('tbody');
            const ingresosTfoot = document.getElementById('ingresos-detail-table')?.querySelector('tfoot');
            if(ingresosTbody) ingresosTbody.innerHTML = `<tr><td colspan="${ingresosTheadCells}" class="text-muted" style="text-align: center; padding: 20px;">No hay datos de ingresos.</td></tr>`;
            if(ingresosTfoot) ingresosTfoot.innerHTML = '';

            // Clear charts
            destroyChart('evolutivoCuotaChart'); displayChartNoData('evolutivoCuotaChart', true);
            destroyChart('participacionGastosChart'); displayChartNoData('participacionGastosChart', true);
            destroyChart('participacionIngresosChart'); displayChartNoData('participacionIngresosChart', true);

            // Clear coefficient editor
            const coefEditor = document.getElementById('coefficient-values-editor');
            const coefNameSpan = document.getElementById('editing-coefficient-name');
            if(coefEditor) coefEditor.innerHTML = '<p class="text-muted">Selecciona un tipo de coeficiente de la lista.</p>';
            if(coefNameSpan) coefNameSpan.textContent = 'Ninguno';
            if(appState.uiState) appState.uiState.editingCoefficientType = null;
        }

        function destroyChart(canvasId) {
             const instance = window[`${canvasId}_instance`];
             if (instance) {
                instance.destroy();
                window[`${canvasId}_instance`] = null;
                // console.log(`Chart ${canvasId} destroyed.`);
             }
         }

        function displayChartNoData(canvasId, show) {
            const container = document.getElementById(canvasId)?.parentElement;
            const noDataElement = container?.querySelector('.chart-no-data');
            if (noDataElement) {
                noDataElement.style.display = show ? 'block' : 'none';
            }
            const canvasElement = document.getElementById(canvasId);
             if (canvasElement) {
                 canvasElement.style.display = show ? 'none' : 'block'; // Hide canvas if no data
             }
        }

        function updateCurrentYearAndScenarioInUI() {
            const scenarioData = getCurrentScenarioData();
            const year = scenarioData ? scenarioData.year : appState.currentYear;
            const scenarioName = scenarioData ? scenarioData.scenarioName : '(Ninguno)';
            // Update dashboard titles
            document.getElementById('dashboard-year').textContent = year;
            document.getElementById('dashboard-scenario').textContent = scenarioName;
            // Update titles in other tabs
            document.querySelectorAll('.current-year').forEach(el => el.textContent = year);
            document.querySelectorAll('.current-scenario').forEach(el => el.textContent = scenarioName);
            // Update year input in Upload tab if it differs
            const yearInput = document.getElementById('exercise-year');
            if (yearInput && yearInput.value !== String(year)) {
                 yearInput.value = year;
            }
        }

        function updateDashboardTables(scenarioData) {
             if (!scenarioData || !scenarioData.calculated) {
                 console.error("Faltan datos calculados en updateDashboardTables. Renderizando vacío.");
                 renderEmptyState();
                 return;
             }

             const { calculated } = scenarioData;
             // Use the IPC snapshot stored in 'calculated' for consistency
             const ipcSnapshot = calculated.ipcManual || appState.settings.ipcManual || Array(12).fill(0);
             const summaryTable = document.getElementById('dashboard-summary');
             const summaryTbody = summaryTable?.querySelector('tbody');
             const summaryTfoot = summaryTable?.querySelector('tfoot');

             if (!summaryTable || !summaryTbody || !summaryTfoot) {
                console.error("Elementos de la tabla de resumen no encontrados.");
                return;
             }
             const summaryHeaderCells = summaryTable.querySelector('thead tr')?.cells?.length || 7;


             summaryTbody.innerHTML = '';
             summaryTfoot.innerHTML = '';

             const hasData = calculated.totalGastoProyectadoMes?.some(v => v !== 0) || calculated.cuotaSobreGastosMes?.some(v => v !== 0);
             if (!hasData) {
                summaryTbody.innerHTML = `<tr><td colspan="${summaryHeaderCells}" class="text-muted" style="text-align: center; padding: 20px;">No hay datos calculados para mostrar en el resumen.</td></tr>`;
                // Clear detail tables as well if summary is empty
                 updateCollapsibleTable('gastos', scenarioData);
                 updateCollapsibleTable('ingresos', scenarioData);
                return;
            }

             // Populate tbody
             for (let i = 0; i < 12; i++) {
                 const row = summaryTbody.insertRow();
                 row.insertCell().textContent = MONTHS[i]; // Mes

                 // Gasto ($)
                 const gastoCell = row.insertCell();
                 gastoCell.textContent = formatCurrency(calculated.totalGastoProyectadoMes?.[i] || 0);
                 gastoCell.classList.add('number-cell');

                 // Fondo ($)
                 const fondoCell = row.insertCell();
                 fondoCell.textContent = formatCurrency(calculated.fondoReservaMes?.[i] || 0);
                 fondoCell.classList.add('number-cell');

                 // Cuota s/Gs ($)
                 const cuotaGsCell = row.insertCell();
                 cuotaGsCell.textContent = formatCurrency(calculated.cuotaSobreGastosMes?.[i] || 0);
                 cuotaGsCell.classList.add('number-cell');

                 // IPC (%)
                 const ipcVal = ipcSnapshot?.[i] || 0;
                 const ipcCell = row.insertCell();
                 ipcCell.textContent = `${ipcVal}%`;
                 ipcCell.classList.add('number-cell'); // Center align percentage

                 // Cuota IPC ($) - Use pre-calculated value
                 const cuotaIpcCell = row.insertCell();
                 cuotaIpcCell.textContent = formatCurrency(calculated.cuotaIpcMes?.[i] || 0);
                 cuotaIpcCell.classList.add('number-cell', 'estimated-month-cell'); // Mark as calculated/estimated

                 // Expensa Real ($) - Use pre-calculated base value (MODIFICADO)
                 const cuotaRealCell = row.insertCell();
                 cuotaRealCell.textContent = formatCurrency(calculated.cuotaRealBaseMes?.[i] || 0);
                 cuotaRealCell.classList.add('number-cell', 'real-month-cell'); // Mark as 'real' input visually
             }

             // Populate tfoot with annual totals
             const tfootRow = summaryTfoot.insertRow();
             tfootRow.insertCell().textContent = "TOTAL ANUAL";

             // Gasto Total
             const gastoFootCell = tfootRow.insertCell();
             gastoFootCell.textContent = formatCurrency(calculated.annualTotals?.gastos?.__TOTAL__ || 0);
             gastoFootCell.classList.add('number-cell');

             // Fondo Total
             const fondoFootCell = tfootRow.insertCell();
             fondoFootCell.textContent = formatCurrency(calculated.annualTotals?.fondoReserva || 0);
             fondoFootCell.classList.add('number-cell');

             // Cuota s/Gs Total
             const cuotaGsFootCell = tfootRow.insertCell();
             cuotaGsFootCell.textContent = formatCurrency(calculated.annualTotals?.cuotaSobreGastos || 0);
             cuotaGsFootCell.classList.add('number-cell');

             // IPC Total (Not applicable)
             tfootRow.insertCell().textContent = "-";

             // Cuota IPC Total
             const cuotaIpcFootCell = tfootRow.insertCell();
             cuotaIpcFootCell.textContent = formatCurrency(calculated.annualTotals?.cuotaIpc || 0);
             cuotaIpcFootCell.classList.add('number-cell', 'estimated-month-cell');

             // Expensa Real Total (MODIFICADO)
             const cuotaRealFootCell = tfootRow.insertCell();
             cuotaRealFootCell.textContent = formatCurrency(calculated.annualTotals?.cuotaRealBase || 0);
             cuotaRealFootCell.classList.add('number-cell', 'real-month-cell');

             // --- Update detail tables AFTER summary ---
             updateCollapsibleTable('gastos', scenarioData);
             updateCollapsibleTable('ingresos', scenarioData);
         }

        function updateCollapsibleTable(type, scenarioData) {
             const tableId = `${type}-detail-table`;
             const table = document.getElementById(tableId);
             if (!table) { console.warn(`Tabla ${tableId} no encontrada.`); return; }

             const thead = table.querySelector('thead');
             const tbody = table.querySelector('tbody');
             const tfoot = table.querySelector('tfoot');

             if (!thead || !tbody || !tfoot) { console.error(`Elementos internos de ${tableId} no encontrados.`); return;}

             tbody.innerHTML = '';
             tfoot.innerHTML = '';

             if (!scenarioData || !scenarioData.data || !scenarioData.calculated || !scenarioData.rubroOrder || !appState.settings || !appState.settings.rubros) {
                 const cols = thead.querySelector('tr')?.cells?.length || 14;
                 tbody.innerHTML = `<tr><td colspan="${cols}" class="text-muted" style="text-align: center; padding: 20px;">Faltan datos o configuración para mostrar el detalle.</td></tr>`;
                 return;
             }

             const { data, calculated, monthStatus, rubroOrder } = scenarioData;
             const config = appState.settings.rubroConfig || {};
             // Use 'gastoAjustado' for gastos (includes coefficient effect)
             // Use 'ingresoAjustado' for ingresos (stores BASE values for display consistency)
             const calculatedSet = calculated[type === 'gastos' ? 'gastoAjustado' : 'ingresoAjustado'] || {};
             // Use 'totalGastoRubroMes' or 'totalIngresoRubroMes' for rubro totals (includes UF mult for ingresos)
             const totalRubroSet = calculated[type === 'gastos' ? 'totalGastoRubroMes' : 'totalIngresoRubroMes'] || {};
             const annualRubroTotals = calculated.annualTotals?.[type] || { __TOTAL__: 0 };
             // --- FIX: Use scenario-specific rubro order ---
             const orderedRubros = Array.isArray(rubroOrder[type]) ? rubroOrder[type] : [];

             // --- Dynamically add Month Headers if not present ---
             let theadRow = thead.querySelector('tr');
             if (!theadRow) {
                 theadRow = thead.insertRow();
                 theadRow.insertCell().textContent = "Rubro / Detalle";
             }
             const expectedHeaderCount = 2 + MONTHS.length; // Rubro/Detalle + 12 Months + Total Anual
             if (theadRow.cells.length < expectedHeaderCount) {
                 // Clear existing cells beyond the first one
                 while (theadRow.cells.length > 1) theadRow.deleteCell(-1);
                 // Add month and total headers
                 MONTHS.forEach(month => {
                     const th = document.createElement('th');
                     th.textContent = month;
                     th.classList.add('number-cell');
                     theadRow.appendChild(th);
                 });
                 const thTotal = document.createElement('th');
                 thTotal.textContent = "Total Anual";
                 thTotal.classList.add('number-cell');
                 theadRow.appendChild(thTotal);
             }
             // --- End Dynamic Header ---


             if (orderedRubros.length === 0) {
                 tbody.innerHTML = `<tr><td colspan="${expectedHeaderCount}" class="text-muted" style="text-align: center; padding: 20px;">No hay rubros definidos o cargados para ${type} en este escenario.</td></tr>`;
                 return;
             }

             // Build table body rows
             let hasVisibleDetails = false; // Track if any details are actually processed
             orderedRubros.forEach(rubro => {
                if (!appState.settings.rubros[type].includes(rubro)) return;
                 if (!data[type]?.[rubro]) return; // Skip if no data for this rubro in scenario

                 const rubroData = data[type][rubro];
                 // --- FIX: Use scenario-specific detail order ---
                 const orderedDetails = Array.isArray(rubroData.detailOrder) ? rubroData.detailOrder : [];
                 // Use global config for collapsed state, ensure it exists
                 const rubroUiConfig = config[rubro] || { detailsCollapsed: true };

                 // --- Rubro Total Row ---
                 const totalRow = tbody.insertRow();
                 totalRow.classList.add('rubro-total-row');
                 if (rubroUiConfig.detailsCollapsed) totalRow.classList.add('collapsed');
                 totalRow.dataset.rubro = rubro;
                 totalRow.dataset.type = type;

                 totalRow.insertCell().textContent = rubro;

                 const monthlyTotals = totalRubroSet[rubro] || Array(12).fill(0);
                 monthlyTotals.forEach(val => {
                     const cell = totalRow.insertCell();
                     cell.textContent = formatCurrency(val);
                     cell.classList.add('number-cell');
                 });

                 const cellAnnualTotal = totalRow.insertCell();
                 cellAnnualTotal.textContent = formatCurrency(annualRubroTotals[rubro] || 0);
                 cellAnnualTotal.classList.add('number-cell');
                 // --- End Rubro Total Row ---


                 // --- Detail Rows (if any) ---
                 orderedDetails.forEach(detail => {
                      // --- FIX: Ensure detail data exists in calculatedSet before rendering row ---
                      if (!calculatedSet[rubro] || calculatedSet[rubro][detail] === undefined) {
                         console.warn(`Detalle calculado no encontrado para ${type}/${rubro}/${detail}. Omitiendo fila.`);
                         return;
                      }
                      hasVisibleDetails = true; // Mark that we are adding at least one detail row

                     const detailRow = tbody.insertRow();
                     detailRow.classList.add('detail-row');
                     detailRow.dataset.rubro = rubro;
                     detailRow.dataset.type = type;
                     if (rubroUiConfig.detailsCollapsed) detailRow.classList.add('hidden');

                     const cellDetailName = detailRow.insertCell();
                     cellDetailName.textContent = detail;
                     cellDetailName.classList.add('text-muted');

                     // Monthly value cells for the detail
                     const detailValues = calculatedSet[rubro][detail]; // Use pre-validated calculated values
                     const detailStatuses = monthStatus[type]?.[rubro]?.[detail] || Array(12).fill('Estimado'); // Get status for coloring
                     let annualDetailTotal = 0;

                     detailValues.forEach((val, index) => {
                         const cell = detailRow.insertCell();
                         cell.textContent = formatCurrency(val);
                         cell.classList.add('number-cell');
                         // Apply specific background based on status ONLY for GASTOS details
                         if (type === 'gastos') {
                             cell.classList.add(detailStatuses[index] === 'REAL' ? 'real-month-cell' : 'estimated-month-cell');
                         }
                         annualDetailTotal += val;
                     });

                     // Annual total cell for the detail
                     const cellAnnualDetail = detailRow.insertCell();
                     cellAnnualDetail.textContent = formatCurrency(annualDetailTotal);
                     cellAnnualDetail.classList.add('number-cell');
                 });
                 // --- End Detail Rows ---
             });

             // --- FIX: Check if tbody is empty *after* loops ---
             if (tbody.rows.length === 0) {
                 tbody.innerHTML = `<tr><td colspan="${expectedHeaderCount}" class="text-muted" style="text-align: center; padding: 20px;">No hay rubros con datos para mostrar en el detalle de ${type}.</td></tr>`;
             } else {
                 // Build table footer row (Overall Total) only if there was content
                 const tfootRow = tfoot.insertRow();
                 tfootRow.insertCell().textContent = `TOTAL GENERAL ${type.toUpperCase()}`;

                 // Use totalGastoProyectadoMes or totalIngresoProyectadoMes for footer totals
                 const totalGeneralMensual = calculated[type === 'gastos' ? 'totalGastoProyectadoMes' : 'totalIngresoProyectadoMes'] || Array(12).fill(0);
                 totalGeneralMensual.forEach(val => {
                     const cell = tfootRow.insertCell();
                     cell.textContent = formatCurrency(val);
                     cell.classList.add('number-cell');
                 });

                 const cellTotalAnualGeneral = tfootRow.insertCell();
                 cellTotalAnualGeneral.textContent = formatCurrency(annualRubroTotals.__TOTAL__ || 0);
                 cellTotalAnualGeneral.classList.add('number-cell');
             }

             // Ensure listeners are present (safe to call multiple times if logic prevents duplicates)
             addCollapsibleListeners();
         }


        function updateCharts(scenarioData) {
             if (!scenarioData || !scenarioData.calculated || !scenarioData.calculated.annualTotals) {
                 console.warn("Datos insuficientes para actualizar gráficos.");
                 destroyChart('evolutivoCuotaChart'); displayChartNoData('evolutivoCuotaChart', true);
                 destroyChart('participacionGastosChart'); displayChartNoData('participacionGastosChart', true);
                 destroyChart('participacionIngresosChart'); displayChartNoData('participacionIngresosChart', true);
                 return;
             }

             const { calculated } = scenarioData;
             const labels = MONTHS;

             const primaryColor = getComputedStyle(document.documentElement).getPropertyValue('--primary-color').trim();
             const accentColor = getComputedStyle(document.documentElement).getPropertyValue('--accent-color').trim();
             const secondaryColor = getComputedStyle(document.documentElement).getPropertyValue('--secondary-color').trim();
             const textColor = getComputedStyle(document.documentElement).getPropertyValue('--text-color').trim();
             const cardBg = getComputedStyle(document.documentElement).getPropertyValue('--card-bg').trim();
             const borderColor = getComputedStyle(document.documentElement).getPropertyValue('--border-color').trim();

             const chartColors = [ // Define a consistent palette
                primaryColor, accentColor, '#ffc107', '#6f42c1', '#fd7e14', '#17a2b8',
                '#dc3545', secondaryColor, '#20c997', '#0d6efd', '#198754', '#adb5bd' // More colors
             ];

             // --- Evolutivo Expensa Chart (Line) --- MODIFICADO
             destroyChart('evolutivoCuotaChart');
             const ctxEvolutivo = document.getElementById('evolutivoCuotaChart')?.getContext('2d');
             const evolutivoHasData = (calculated.cuotaSobreGastosMes?.some(v => v !== 0) ?? false) || (calculated.cuotaRealBaseMes?.some(v => v !== 0) ?? false);
             displayChartNoData('evolutivoCuotaChart', !evolutivoHasData);

             if (ctxEvolutivo && evolutivoHasData) {
                window.evolutivoCuotaChart_instance = new Chart(ctxEvolutivo, {
                    type: 'line',
                    data: {
                        labels: labels,
                        datasets: [
                            { // Cuota s/Gtos (Calculated from expenses + reserve)
                                label: 'Cuota s/Gtos ($)',
                                data: calculated.cuotaSobreGastosMes,
                                borderColor: primaryColor,
                                backgroundColor: hexToRgba(primaryColor, 0.1),
                                tension: 0.2,
                                fill: true,
                                yAxisID: 'yCuota'
                            },
                            { // Expensa Real Base (From Ingresos base data) - MODIFICADO
                                label: 'Expensa Real Base ($)',
                                data: calculated.cuotaRealBaseMes,
                                borderColor: accentColor,
                                backgroundColor: hexToRgba(accentColor, 0.1),
                                tension: 0.2,
                                fill: true,
                                yAxisID: 'yCuota' // Same axis for direct comparison
                            },
                             { // Cuota IPC (Calculated based on Cuota s/Gtos and IPC ref)
                                label: 'Cuota IPC ($)',
                                data: calculated.cuotaIpcMes,
                                borderColor: secondaryColor, // Use secondary color
                                backgroundColor: hexToRgba(secondaryColor, 0.1),
                                tension: 0.2,
                                fill: false, // Don't fill this one to avoid clutter
                                borderDash: [5, 5], // Dashed line for reference value
                                yAxisID: 'yCuota' // Same axis
                            }
                        ]
                    },
                    options: commonChartOptions('yCuota')
                 });
             }


             // --- Participación Gastos Chart (Pie) ---
             destroyChart('participacionGastosChart');
             const ctxGastos = document.getElementById('participacionGastosChart')?.getContext('2d');
             // Filter labels based on *global* settings first, then check for > 0 value
             const gastoLabels = (appState.settings.rubros?.gastos || []).filter(rubro =>
                 (calculated.annualTotals?.gastos?.[rubro] || 0) > 0
             );
             const gastoData = gastoLabels.map(rubro => calculated.annualTotals.gastos[rubro]);
             displayChartNoData('participacionGastosChart', gastoData.length === 0);

             if (ctxGastos && gastoData.length > 0) {
                 window.participacionGastosChart_instance = new Chart(ctxGastos, {
                     type: 'pie', // Changed to pie for variety, could be doughnut too
                     data: {
                         labels: gastoLabels,
                         datasets: [{
                             data: gastoData,
                             backgroundColor: generateColors(gastoData.length, chartColors, 0.8), // Use helper
                             borderColor: cardBg,
                             borderWidth: 2
                         }]
                     },
                     options: pieChartOptions('Gasto Anual')
                 });
             }


             // --- Participación Ingresos Chart (Pie) ---
             destroyChart('participacionIngresosChart');
             const ctxIngresos = document.getElementById('participacionIngresosChart')?.getContext('2d');
             // Filter labels based on *global* settings first, then check for > 0 value
             const ingresoLabels = (appState.settings.rubros?.ingresos || []).filter(rubro =>
                 (calculated.annualTotals?.ingresos?.[rubro] || 0) > 0
             );
             const ingresoData = ingresoLabels.map(rubro => calculated.annualTotals.ingresos[rubro]);
             displayChartNoData('participacionIngresosChart', ingresoData.length === 0);

             if (ctxIngresos && ingresoData.length > 0) {
                 window.participacionIngresosChart_instance = new Chart(ctxIngresos, {
                     type: 'pie', // Changed to pie
                     data: {
                         labels: ingresoLabels,
                         datasets: [{
                             data: ingresoData,
                             // Use different colors or reverse order from gastos chart
                             backgroundColor: generateColors(ingresoData.length, chartColors.slice().reverse(), 0.8), // Use helper
                             borderColor: cardBg,
                             borderWidth: 2
                         }]
                     },
                     options: pieChartOptions('Ingreso Anual')
                 });
             }
         }

         // Helper to generate enough colors for pie charts, repeating palette if necessary
         function generateColors(count, palette, alpha = 1) {
            const colors = [];
            for (let i = 0; i < count; i++) {
                colors.push(hexToRgba(palette[i % palette.length], alpha));
            }
            return colors;
         }

        function commonChartOptions(mainYAxisID = 'y', additionalScales = {}) {
            const textColor = getComputedStyle(document.documentElement).getPropertyValue('--text-color').trim();
            const borderColor = getComputedStyle(document.documentElement).getPropertyValue('--border-color').trim();
            return {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    [mainYAxisID]: {
                        beginAtZero: true,
                        ticks: { color: textColor, padding: 10, callback: value => formatCurrency(value).replace(",00", "") },
                        grid: { color: borderColor, drawTicks: false }, // Hide grid ticks
                        border: { color: borderColor } // Axis line color
                    },
                    x: {
                        ticks: { color: textColor, padding: 10 },
                        grid: { display: false }, // Hide vertical grid lines for cleaner look
                        border: { color: borderColor }
                    },
                    ...additionalScales // Include any additional axes passed in
                },
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { color: textColor, boxWidth: 15, padding: 20 }
                    },
                    tooltip: {
                        backgroundColor: hexToRgba(getComputedStyle(document.documentElement).getPropertyValue('--card-bg').trim(), 0.9),
                        titleColor: textColor,
                        bodyColor: textColor,
                        borderColor: getComputedStyle(document.documentElement).getPropertyValue('--border-color').trim(),
                        borderWidth: 1,
                        padding: 10,
                        callbacks: {
                             title: tooltipItems => tooltipItems[0]?.label ? FULL_MONTHS[MONTHS.indexOf(tooltipItems[0].label)] : '',
                             label: context => {
                                 let label = context.dataset.label || '';
                                 if (label) label += ': ';
                                 if (context.parsed.y !== null) label += formatCurrency(context.parsed.y);
                                 return label;
                            }
                        }
                    }
                },
                interaction: { mode: 'index', intersect: false },
            };
         }

        function pieChartOptions(labelPrefix = '') {
             const textColor = getComputedStyle(document.documentElement).getPropertyValue('--text-color').trim();
             const cardBg = getComputedStyle(document.documentElement).getPropertyValue('--card-bg').trim();
             const borderColor = getComputedStyle(document.documentElement).getPropertyValue('--border-color').trim();
             return {
                 responsive: true,
                 maintainAspectRatio: false,
                 plugins: {
                     legend: {
                         position: 'right',
                         labels: {
                            color: textColor, boxWidth: 15, padding: 15,
                             generateLabels: chart => {
                                const data = chart.data;
                                if (!data.labels.length || !data.datasets.length) return [];
                                const { labels } = data; const dataset = data.datasets[0];
                                const total = dataset.data.reduce((a, b) => a + b, 0);
                                return labels.map((label, i) => {
                                    const value = dataset.data[i];
                                    const percentage = total > 0 ? ((value / total) * 100).toFixed(1) + '%' : '0.0%';
                                    return {
                                        text: `${label} (${percentage})`,
                                        fillStyle: dataset.backgroundColor[i],
                                        strokeStyle: dataset.borderColor || dataset.backgroundColor[i],
                                        lineWidth: dataset.borderWidth || 0,
                                        hidden: isNaN(value) || chart.getDataVisibility(i), index: i
                                    };
                                });
                             }
                         }
                     },
                     tooltip: {
                         backgroundColor: hexToRgba(cardBg, 0.9),
                         titleColor: textColor, bodyColor: textColor,
                         borderColor: borderColor, borderWidth: 1, padding: 10,
                         callbacks: {
                            label: context => {
                                 let label = context.label || ''; if (label) label += ': ';
                                 if (context.parsed !== null) {
                                     const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                     const percentage = total > 0 ? ((context.parsed / total) * 100).toFixed(1) + '%' : '0.0%';
                                     label += `${formatCurrency(context.parsed)} (${percentage})`;
                                 }
                                 return label;
                            }
                         }
                     }
                 },
                 // cutout: '30%' // Optional: Makes it a Doughnut chart
             };
         }

        function updateReserveFundPanel(scenarioData) {
             if (!scenarioData || !scenarioData.reserveFund) {
                 console.warn("No reserve fund data to update panel.");
                 const panel = document.getElementById('reserve-fund-panel');
                 if (panel) panel.innerHTML = '<p class="text-muted">Datos del fondo de reserva no disponibles.</p>';
                 return;
            }
             const { reserveFund } = scenarioData;
             const panel = document.getElementById('reserve-fund-panel');
             if (!panel) return;
             panel.innerHTML = ''; // Clear previous inputs

             const typePercentRadio = document.getElementById('reserve-type-percent');
             const typeFixedRadio = document.getElementById('reserve-type-fixed');
             if (typePercentRadio) typePercentRadio.checked = reserveFund.type === 'percent';
             if (typeFixedRadio) typeFixedRadio.checked = reserveFund.type === 'fixed';

             const unitLabel = reserveFund.type === 'percent' ? '%' : '$';
             const currentStep = reserveFund.type === 'percent' ? '0.1' : '100';

             // Ensure values array has 12 elements
              const reserveValues = Array.isArray(reserveFund.values) && reserveFund.values.length === 12
                                     ? reserveFund.values
                                     : Array(12).fill(reserveFund.type === 'percent' ? 5 : 0);

             for (let i = 0; i < 12; i++) {
                 const monthDiv = document.createElement('div');
                 monthDiv.classList.add('month-config');

                 const label = document.createElement('label');
                 label.textContent = FULL_MONTHS[i];
                 label.htmlFor = `reserve-month-${i}`;

                 const input = document.createElement('input');
                 input.type = 'number';
                 input.id = `reserve-month-${i}`;
                 input.dataset.month = i;
                 input.value = reserveValues[i]; // Use validated array
                 input.step = currentStep;
                 input.min = '0';
                 input.style.textAlign = 'right';

                 const unitSpan = document.createElement('span');
                 unitSpan.textContent = unitLabel;
                 unitSpan.style.marginLeft = "5px";

                 monthDiv.appendChild(label);
                 monthDiv.appendChild(input);
                 monthDiv.appendChild(unitSpan);
                 panel.appendChild(monthDiv);
             }
        }

        function updateSettingsPanel() {
            const ufInput = document.getElementById('cantidad-unidades');
            if (ufInput) ufInput.value = appState.settings.cantidadUnidades;

            updateRubroList('gastos', 'gasto-rubro-list');
            updateRubroList('ingresos', 'ingreso-rubro-list');

            updateCoefficientTypeList();
            const currentEditing = appState.uiState.editingCoefficientType;
            if (currentEditing && appState.settings.coefficientTypes[currentEditing]) {
                renderCoefficientValuesEditor(currentEditing);
            } else {
                const editorDiv = document.getElementById('coefficient-values-editor');
                const nameSpan = document.getElementById('editing-coefficient-name');
                if (editorDiv) editorDiv.innerHTML = '<p class="text-muted">Selecciona un tipo de coeficiente de la lista para editar sus valores.</p>';
                if (nameSpan) nameSpan.textContent = 'Ninguno';
                if(appState.uiState.editingCoefficientType !== null && !appState.settings.coefficientTypes[appState.uiState.editingCoefficientType]) {
                   appState.uiState.editingCoefficientType = null; // Reset if type became invalid
                }
            }
            updateIPCManualInputs();
        }

        function updateRubroList(type, listId) {
             const list = document.getElementById(listId);
             if (!list) return;
             list.innerHTML = '';

             const rubros = appState.settings.rubros[type]?.slice().sort((a, b) => a.localeCompare(b)) || [];
             const config = appState.settings.rubroConfig || {};
             const coefTypes = appState.settings.coefficientTypes || {};

             if (rubros.length === 0) {
                 list.innerHTML = '<li class="text-muted" style="padding: 10px 8px;">No hay rubros definidos. Añade uno o carga un Excel.</li>';
                 return;
             }

             rubros.forEach(rubro => {
                 const li = document.createElement('li');
                 const span = document.createElement('span');
                 span.textContent = rubro;
                 li.appendChild(span);

                 if (type === 'gastos') {
                     const select = document.createElement('select');
                     select.title = `Asignar coeficiente de ajuste para ${rubro}`;
                     select.dataset.rubro = rubro;
                     select.onchange = handleCoefficientAssignmentChange;

                     // Sort coefficient types alphabetically by name for the dropdown
                     Object.keys(coefTypes)
                         .sort((a, b) => coefTypes[a].name.localeCompare(coefTypes[b].name))
                         .forEach(coefKey => {
                             const option = document.createElement('option');
                             option.value = coefKey;
                             option.textContent = coefTypes[coefKey].name;
                             // Ensure config[rubro] exists before accessing coefficientType
                             if (config[rubro]?.coefficientType === coefKey) {
                                 option.selected = true;
                             }
                             select.appendChild(option);
                         });
                     li.appendChild(select);
                 }

                 const deleteBtn = document.createElement('button');
                 deleteBtn.innerHTML = '<i class="fas fa-trash-alt"></i>';
                 deleteBtn.classList.add('button-danger', 'button-sm');
                 deleteBtn.title = `Eliminar rubro "${rubro}" (¡no se puede deshacer!)`;
                 deleteBtn.onclick = () => deleteRubro(type, rubro);
                 li.appendChild(deleteBtn);

                 list.appendChild(li);
             });
        }

        function updateCoefficientTypeList() {
             const list = document.getElementById('coefficient-type-list');
             if (!list) return;
             list.innerHTML = '';

             const types = appState.settings.coefficientTypes || {};
             const currentEditing = appState.uiState.editingCoefficientType;

             const sortedKeys = Object.keys(types)
                 .filter(key => key !== 'None') // Exclude the default 'None' type from the deletable list
                 .sort((a, b) => types[a].name.localeCompare(types[b].name));

             // Always add the 'None' type first, non-interactively
              const noneType = types['None'];
              if (noneType) {
                    const liNone = document.createElement('li');
                    const spanNone = document.createElement('span');
                    spanNone.textContent = noneType.name;
                    liNone.appendChild(spanNone);
                    const lockIcon = document.createElement('i');
                    lockIcon.className = 'fas fa-lock fa-fw';
                    lockIcon.title = 'Tipo por defecto (no eliminable ni editable).';
                    lockIcon.style.color = 'var(--secondary-color)';
                    lockIcon.style.marginLeft = 'auto';
                    liNone.appendChild(lockIcon);
                    liNone.style.opacity = '0.7'; // Visually distinct
                    list.appendChild(liNone);
              }


             if (sortedKeys.length === 0) {
                 list.innerHTML += '<li class="text-muted" style="padding: 10px 8px;">No hay tipos de coeficientes definidos (además de los por defecto).</li>';
                 return;
             }

             sortedKeys.forEach(key => {
                 const typeData = types[key];
                 const li = document.createElement('li');
                 li.style.cursor = 'pointer';
                 li.onclick = () => selectCoefficientTypeForEditing(key);

                 if (key === currentEditing) {
                     li.style.backgroundColor = 'var(--clickable-row-hover)';
                     li.style.fontWeight = 'bold';
                 }

                 const span = document.createElement('span');
                 span.textContent = typeData.name;
                 li.appendChild(span);

                 const actionsDiv = document.createElement('div');
                 actionsDiv.style.marginLeft = 'auto'; // Push actions right
                 actionsDiv.style.display = 'flex';
                 actionsDiv.style.alignItems = 'center';
                 actionsDiv.style.gap = '5px';

                 if (typeData.isDefault) { // Should only be true for built-ins if we add more
                     const lockIcon = document.createElement('i');
                     lockIcon.className = 'fas fa-lock fa-fw';
                     lockIcon.title = 'Tipo por defecto (no eliminable).';
                     lockIcon.style.color = 'var(--secondary-color)';
                     actionsDiv.appendChild(lockIcon);
                 } else {
                     const deleteBtn = document.createElement('button');
                     deleteBtn.innerHTML = '<i class="fas fa-trash-alt"></i>';
                     deleteBtn.classList.add('button-danger', 'button-sm');
                     deleteBtn.title = `Eliminar tipo "${typeData.name}"`;
                     deleteBtn.onclick = (e) => { e.stopPropagation(); deleteCoefficientType(key); };
                     actionsDiv.appendChild(deleteBtn);
                 }
                li.appendChild(actionsDiv);
                 list.appendChild(li);
             });
        }

        function selectCoefficientTypeForEditing(typeKey) {
             if (typeKey === 'None') {
                showSnackbar("El tipo 'Sin Coeficiente' no es editable.", false, 'info');
                return;
             }
             if (appState.settings.coefficientTypes[typeKey]) {
                 appState.uiState.editingCoefficientType = typeKey;
                 updateCoefficientTypeList(); // Re-render list to show selection highlight
                 renderCoefficientValuesEditor(typeKey);
             } else {
                 console.error(`Intentando editar tipo de coeficiente inexistente: ${typeKey}`);
             }
        }

        function renderCoefficientValuesEditor(typeKey) {
             const editorDiv = document.getElementById('coefficient-values-editor');
             const nameSpan = document.getElementById('editing-coefficient-name');
             if (!editorDiv || !nameSpan) return;
             editorDiv.innerHTML = '';

             if (!typeKey || !appState.settings.coefficientTypes[typeKey] || typeKey === 'None') {
                 editorDiv.innerHTML = '<p class="text-muted">Selecciona un tipo de coeficiente de la lista (que no sea "Sin Coeficiente") para editar sus valores.</p>';
                 nameSpan.textContent = 'Ninguno';
                 appState.uiState.editingCoefficientType = null;
                 return;
             }

             const typeData = appState.settings.coefficientTypes[typeKey];
             nameSpan.textContent = typeData.name;

             const table = document.createElement('table');
             table.style.width = '100%';
             const thead = table.createTHead().insertRow();
             const tbody = table.createTBody().insertRow();

             // thead.insertCell().textContent = "Mes"; // Removed, using col headers
             tbody.insertCell().textContent = "Valor Coef.";
             tbody.cells[0].style.fontWeight = "600"; // Bold the row header

             // Ensure values array exists and has 12 elements
             const values = Array.isArray(typeData.values) && typeData.values.length === 12
                             ? typeData.values
                             : Array(12).fill(1);


             MONTHS.forEach((month, index) => {
                 const th = thead.insertCell();
                 th.textContent = month;
                 th.classList.add('number-cell');
                 th.style.textAlign = 'center';

                 const td = tbody.insertCell();
                 td.classList.add('input-cell');
                 td.style.textAlign = 'center';

                 const input = document.createElement('input');
                 input.type = 'number';
                 input.step = '0.01';
                 input.min = '0';
                 input.value = values[index]; // Use validated array
                 input.dataset.month = index;
                 input.dataset.typeKey = typeKey;
                 input.onchange = handleCoefficientValueChange;
                 input.style.maxWidth = '80px';
                 input.title = `Coeficiente para ${FULL_MONTHS[index]}`;

                 td.appendChild(input);
             });

             editorDiv.appendChild(table);
        }

        function updateIPCManualInputs() {
             const ipcDiv = document.getElementById('ipc-inputs');
             if (!ipcDiv) return;
             ipcDiv.innerHTML = '';

             // Ensure IPC array exists and has 12 elements
             const ipcValues = Array.isArray(appState.settings.ipcManual) && appState.settings.ipcManual.length === 12
                                ? appState.settings.ipcManual
                                : Array(12).fill(0);

             for (let i = 0; i < 12; i++) {
                 const monthDiv = document.createElement('div');
                 monthDiv.classList.add('form-group');

                 const label = document.createElement('label');
                 label.textContent = FULL_MONTHS[i];
                 label.htmlFor = `ipc-month-${i}`;

                 const input = document.createElement('input');
                 input.type = 'number';
                 input.id = `ipc-month-${i}`;
                 input.dataset.month = i;
                 input.value = ipcValues[i]; // Use validated array
                 input.step = '0.1';
                 input.min = '0'; // Allow zero IPC
                 input.placeholder = '%';
                 input.style.textAlign = 'right';
                 input.style.maxWidth = '120px';
                 input.title = `IPC de referencia para ${FULL_MONTHS[i]} (%)`;

                 input.onchange = (event) => {
                     const monthIndex = parseInt(event.target.dataset.month);
                     const value = parseFloat(event.target.value);
                      if (monthIndex >= 0 && monthIndex < 12) {
                          // Allow 0 and positive numbers
                          // Ensure the global array exists before writing
                          if (!Array.isArray(appState.settings.ipcManual) || appState.settings.ipcManual.length !== 12) {
                            appState.settings.ipcManual = Array(12).fill(0);
                          }
                          appState.settings.ipcManual[monthIndex] = (!isNaN(value) && value >= 0) ? value : 0;
                          // No saveState/recalc here; happens on main Save button
                      } else {
                          console.error("Invalid month index for IPC input.");
                      }
                 };

                 monthDiv.appendChild(label);
                 monthDiv.appendChild(input);
                 ipcDiv.appendChild(monthDiv);
             }
        }


        // --- Manejo de Eventos ---
        function addEventListeners() {
             document.getElementById('theme-toggle')?.addEventListener('click', toggleTheme);

             document.getElementById('scenario-selector')?.addEventListener('change', (event) => {
                 const newKey = event.target.value;
                 if (newKey && appState.scenarios[newKey]) {
                     appState.activeScenarioKey = newKey;
                     appState.currentYear = parseInt(newKey.split('_')[0]);
                     console.log(`Escenario cambiado a: ${newKey}`);
                     saveState();
                     updateUI(); // Refresh UI for the new scenario
                 } else if (newKey === "") {
                     console.warn("Selector de escenario cambió a valor vacío (puede ocurrir si no hay escenarios).");
                 } else {
                      console.error(`Intento de cambiar a escenario inválido o no encontrado: ${newKey}`);
                      event.target.value = appState.activeScenarioKey; // Revert selection
                 }
             });

             // Drag & Drop Upload Area
             const uploadArea = document.getElementById('file-upload-area');
             if (uploadArea) {
                ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
                    uploadArea.addEventListener(eventName, preventDefaults, false);
                    document.body.addEventListener(eventName, preventDefaults, false); // Prevent browser opening file
                });
                ['dragenter', 'dragover'].forEach(eventName => {
                    uploadArea.addEventListener(eventName, () => uploadArea.style.backgroundColor = 'var(--clickable-row-hover)', false);
                });
                ['dragleave', 'drop'].forEach(eventName => {
                    uploadArea.addEventListener(eventName, () => uploadArea.style.backgroundColor = 'var(--bg-color)', false);
                });
                 uploadArea.addEventListener('drop', (event) => {
                    const files = event.dataTransfer.files;
                    if (files.length > 0) handleFileUpload(files);
                 }, false);
             }

             // Add collapsible listeners only once using delegation
             addCollapsibleListeners();
        }

        function preventDefaults (e) {
            e.preventDefault();
            e.stopPropagation();
        }

        let collapsibleListenersAdded = false; // Flag to prevent adding multiple times
        function addCollapsibleListeners() {
             // Use event delegation on a parent element that exists reliably (e.g., the main container)
             const container = document.querySelector('.container');
             // Only add the listener once
             if (!container || collapsibleListenersAdded) return;

             container.addEventListener('click', (event) => {
                 // Find the closest ancestor that is a collapsible total row
                 const targetRow = event.target.closest('tr.rubro-total-row');
                 // Check if the click happened inside one of the detail tables
                 if (targetRow && (targetRow.closest('#gastos-detail-table') || targetRow.closest('#ingresos-detail-table'))) {
                     const rubro = targetRow.dataset.rubro;
                     const type = targetRow.dataset.type;
                     if (rubro && type) {
                         toggleRubroDetails(type, rubro);
                     }
                 }
             });

             collapsibleListenersAdded = true; // Set flag
             console.log("Listeners delegados para filas colapsables añadidos al contenedor.");
        }


        function toggleRubroDetails(type, rubro) {
             // Toggle state in GLOBAL settings.rubroConfig
             // Ensure the config object exists for the rubro
             if (!appState.settings.rubroConfig[rubro]) {
                 appState.settings.rubroConfig[rubro] = { coefficientType: 'None', detailsCollapsed: false }; // Default expanded on first click if config didn't exist
             } else {
                 // Toggle the existing value, default to false (expanded) if property doesn't exist
                 appState.settings.rubroConfig[rubro].detailsCollapsed = !(appState.settings.rubroConfig[rubro].detailsCollapsed ?? false);
             }
             const isNowCollapsed = appState.settings.rubroConfig[rubro].detailsCollapsed;
             console.log(`Toggling ${type}/${rubro}. Now collapsed: ${isNowCollapsed}`);

             // Update UI for the current table
             const tableId = `${type}-detail-table`;
             const totalRow = document.querySelector(`#${tableId} tr.rubro-total-row[data-rubro="${rubro}"]`);
             const detailRows = document.querySelectorAll(`#${tableId} tr.detail-row[data-rubro="${rubro}"]`);

             if (totalRow) {
                totalRow.classList.toggle('collapsed', isNowCollapsed);
             } else {
                 console.warn(`Total row not found for ${type}/${rubro} during toggle.`);
             }

             detailRows.forEach(row => {
                 row.classList.toggle('hidden', isNowCollapsed);
             });

             saveState(); // Save the changed collapsed preference
        }

         function handleCoefficientAssignmentChange(event) {
             const select = event.target;
             const rubro = select.dataset.rubro;
             const newCoefType = select.value;

             if (rubro && newCoefType !== undefined) {
                 // Ensure config object exists before assigning
                 if (!appState.settings.rubroConfig[rubro]) {
                     appState.settings.rubroConfig[rubro] = { detailsCollapsed: true }; // Keep default collapsed state
                 }
                 appState.settings.rubroConfig[rubro].coefficientType = newCoefType;
                 console.log(`Coeficiente para "${rubro}" asignado a "${newCoefType}".`);
                 saveState(); // Save assignment immediately
                  showSnackbar(`Coeficiente para "${rubro}" asignado. Guardar Configuración recalculará los estimados.`, false, 'info');
             } else {
                  console.error("Error al asignar coeficiente: falta rubro o valor.", {rubro, newCoefType});
             }
         }

         function handleCoefficientValueChange(event) {
             const input = event.target;
             const monthIndex = parseInt(input.dataset.month);
             const typeKey = input.dataset.typeKey;
             const newValue = parseFloat(input.value);

             if (typeKey && appState.settings.coefficientTypes[typeKey] && !isNaN(monthIndex) && monthIndex >= 0 && monthIndex < 12) {
                 // Ensure values array exists before modifying
                 if (!Array.isArray(appState.settings.coefficientTypes[typeKey].values) || appState.settings.coefficientTypes[typeKey].values.length !== 12) {
                    appState.settings.coefficientTypes[typeKey].values = Array(12).fill(1);
                 }

                 if (!isNaN(newValue) && newValue >= 0) {
                     appState.settings.coefficientTypes[typeKey].values[monthIndex] = newValue;
                     console.log(`Valor mes ${MONTHS[monthIndex]} para "${typeKey}" actualizado a ${newValue}.`);
                     saveState(); // Save immediately
                     showSnackbar(`Valor para ${MONTHS[monthIndex]} de "${appState.settings.coefficientTypes[typeKey].name}" actualizado. Guardar Configuración recalculará.`, false, 'info');
                 } else {
                     input.value = appState.settings.coefficientTypes[typeKey].values[monthIndex]; // Revert invalid input
                     showSnackbar(`Valor inválido para ${MONTHS[monthIndex]}. Debe ser >= 0.`, true, 'error');
                 }
             } else {
                 console.error("Error al manejar cambio de valor de coeficiente.", { typeKey, monthIndex, newValue });
             }
         }


        // --- Funciones de Acción (Botones, etc.) ---
        function createNewExercise(year = null) {
             const inputYearElement = document.getElementById('exercise-year');
             const inputYear = year || parseInt(inputYearElement?.value);

             if (!inputYear || isNaN(inputYear) || inputYear < 2000 || inputYear > 2099) {
                 showSnackbar("Año inválido. Introduce un año entre 2000 y 2099.", true, 'error');
                 if(inputYearElement) inputYearElement.focus();
                 return;
             }

             console.log(`Creando o seleccionando Ejercicio ${inputYear}`);
             // Initialize the 'Base' scenario if it doesn't exist
             initScenarioData(inputYear, 'Base');

             // Set the application's current year and active scenario
             appState.currentYear = inputYear;
             appState.activeScenarioKey = `${inputYear}_Base`;

             saveState();

             // Update UI elements
             updateScenarioSelector();
             const selector = document.getElementById('scenario-selector');
             if (selector) selector.value = appState.activeScenarioKey;

             updateUI();
             showSnackbar(`Ejercicio ${inputYear} (Escenario Base) seleccionado/creado.`, false, 'success');
        }

        function createScenario(){
             const year = appState.currentYear;
             const existingScenariosCount = Object.keys(appState.scenarios).filter(k => k.startsWith(year + '_')).length;
             const defaultName = `Escenario ${existingScenariosCount + 1}`;

             let nombre = prompt(`Nombre para el nuevo escenario del año ${year}:`, defaultName);
             if (nombre === null) { showSnackbar("Creación cancelada.", false, 'info'); return; } // Handle Cancel
             nombre = nombre.trim();
             if (!nombre) { showSnackbar("El nombre no puede estar vacío.", true, 'error'); return; }

             const key = `${year}_${nombre.replace(/\s+/g,'_')}`;
             if (appState.scenarios[key]) {
                 showSnackbar(`El escenario "${nombre}" ya existe para ${year}. Elige otro nombre.`, true, 'warning');
                 return;
             }

             // Create a fresh, empty scenario
             console.log("Creando un escenario nuevo vacío.");
             initScenarioData(year, nombre); // Initialize with the new name

             appState.activeScenarioKey = key;
             saveState();

             updateScenarioSelector();
             const selector = document.getElementById('scenario-selector');
             if(selector) selector.value = key;
             updateUI();
             showSnackbar(`Escenario "${nombre}" creado y seleccionado.`, false, 'success');
        }

        function cloneScenario() {
             const currentScenario = getCurrentScenarioData();
             if (!currentScenario) {
                 showSnackbar("No hay un escenario activo para clonar.", true, 'error');
                 return;
             }

             const currentName = currentScenario.scenarioName;
             const defaultNewName = `${currentName} - Copia`;
             const newScenarioName = prompt(`Nombre para la copia del escenario "${currentName}":`, defaultNewName);

             if (newScenarioName === null) { showSnackbar("Clonación cancelada.", false, 'info'); return; }
             const trimmedNewName = newScenarioName.trim();
             if (!trimmedNewName) { showSnackbar("El nombre no puede estar vacío.", true, 'error'); return; }

             const newKey = `${currentScenario.year}_${trimmedNewName.replace(/\s+/g, '_')}`;
             if (appState.scenarios[newKey]) {
                 showSnackbar(`Ya existe un escenario "${trimmedNewName}" para ${currentScenario.year}.`, true, 'warning');
                 return;
             }

             // Deep clone using JSON methods for safety
             appState.scenarios[newKey] = JSON.parse(JSON.stringify(currentScenario));
             // Update specific properties for the new scenario
             appState.scenarios[newKey].scenarioName = trimmedNewName;
             appState.scenarios[newKey].year = currentScenario.year; // Ensure year is correct

             appState.activeScenarioKey = newKey;
             console.log(`Escenario clonado: ${appState.activeScenarioKey} -> ${newKey}`);
             saveState();

             updateScenarioSelector();
             const selector = document.getElementById('scenario-selector');
             if(selector) selector.value = newKey;
             updateUI();
             showSnackbar(`Escenario "${trimmedNewName}" clonado y seleccionado.`, false, 'success');
        }

        function deleteScenario() {
             const keyToDelete = appState.activeScenarioKey;
             const scenarioToDelete = appState.scenarios[keyToDelete];

             if (!scenarioToDelete) {
                 showSnackbar("No hay escenario activo para eliminar.", true, 'error');
                 return;
             }

             const scenariosForYear = Object.keys(appState.scenarios).filter(k => k.startsWith(`${scenarioToDelete.year}_`));
             if (scenariosForYear.length <= 1) {
                 showSnackbar(`No se puede eliminar el último escenario ("${scenarioToDelete.scenarioName}") para ${scenarioToDelete.year}.`, true, 'warning');
                 return;
             }

             if (confirm(`¿Seguro que quieres eliminar el escenario "${scenarioToDelete.scenarioName}"?\n\n¡Esta acción no se puede deshacer!`)) {
                 const year = scenarioToDelete.year;
                 const deletedName = scenarioToDelete.scenarioName;

                 delete appState.scenarios[keyToDelete];
                 console.log(`Escenario eliminado: ${keyToDelete}`);

                 // Determine next active scenario
                 const baseKey = `${year}_Base`;
                 const remainingKeysForYear = Object.keys(appState.scenarios).filter(k => k.startsWith(`${year}_`));
                 const firstGlobalKey = Object.keys(appState.scenarios)[0];

                 let nextActiveKey = null;
                 if (appState.scenarios[baseKey]) { nextActiveKey = baseKey; }
                 else if (remainingKeysForYear.length > 0) { nextActiveKey = remainingKeysForYear.sort((a,b) => appState.scenarios[a].scenarioName.localeCompare(appState.scenarios[b].scenarioName))[0]; }
                 else if (firstGlobalKey) { nextActiveKey = firstGlobalKey; }

                 appState.activeScenarioKey = nextActiveKey;

                 if (!appState.activeScenarioKey) {
                     console.log("No quedan escenarios, creando uno base para el año actual.");
                     appState.currentYear = new Date().getFullYear();
                     initScenarioData(appState.currentYear);
                     appState.activeScenarioKey = `${appState.currentYear}_Base`;
                 } else {
                     appState.currentYear = parseInt(appState.activeScenarioKey.split('_')[0]);
                 }

                 saveState();

                 updateScenarioSelector();
                 const selector = document.getElementById('scenario-selector');
                 if (selector && appState.activeScenarioKey) selector.value = appState.activeScenarioKey;
                 updateUI();
                 showSnackbar(`Escenario "${deletedName}" eliminado.`, false, 'success');
             } else {
                 showSnackbar("Eliminación cancelada.", false, 'info');
             }
        }


        function updateScenarioSelector() {
            const selector = document.getElementById('scenario-selector');
            if (!selector) return;
            const currentActiveKey = appState.activeScenarioKey; // Store current key before clearing
            selector.innerHTML = '';

            const currentYearScenariosKeys = Object.keys(appState.scenarios)
                .filter(key => key.startsWith(`${appState.currentYear}_`))
                .sort((a, b) => appState.scenarios[a].scenarioName.localeCompare(appState.scenarios[b].scenarioName));

            if (currentYearScenariosKeys.length === 0) {
                const opt = document.createElement('option');
                opt.value = "";
                opt.textContent = `(No hay escenarios para ${appState.currentYear})`;
                opt.disabled = true;
                selector.appendChild(opt);
                selector.disabled = true;
                // If the active key was from this year, it's now invalid. validateAndSetActiveScenario should handle this on next load/update.
                return;
            }

            selector.disabled = false;
            let activeKeyFoundInList = false;
            currentYearScenariosKeys.forEach(key => {
                const scenario = appState.scenarios[key];
                if (scenario) {
                    const opt = document.createElement('option');
                    opt.value = key;
                    opt.textContent = scenario.scenarioName;
                    if (key === currentActiveKey) {
                        opt.selected = true;
                        activeKeyFoundInList = true;
                    }
                    selector.appendChild(opt);
                }
            });

            // If the previously active key wasn't found in the current year's list,
            // default to the first one in the list, update state, and save.
            if (!activeKeyFoundInList && currentYearScenariosKeys.length > 0) {
                 const newActiveKey = currentYearScenariosKeys[0];
                 console.warn(`Active scenario key "${currentActiveKey}" not valid for year ${appState.currentYear}. Defaulting to "${newActiveKey}".`);
                 appState.activeScenarioKey = newActiveKey;
                 selector.value = newActiveKey; // Update selector display
                 saveState(); // Save the corrected active key
            } else if (activeKeyFoundInList) {
                 selector.value = currentActiveKey; // Ensure visual selection matches state
            }
         }

        // --- Carga de Archivo Excel ---
        function handleFileUpload(files) {
    if (!files.length) return;

    const file = files[0];
    const reader = new FileReader();

    reader.onload = function (e) {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array', cellDates: false });

            const gastosSheet = workbook.Sheets[GASTOS_SHEET_NAME];
            const ingresosSheet = workbook.Sheets[INGRESOS_SHEET_NAME];

            const gastosJson = XLSX.utils.sheet_to_json(gastosSheet, { header: 1 });
            const ingresosJson = XLSX.utils.sheet_to_json(ingresosSheet, { header: 1 });

            const headers = gastosJson[0].slice(2); // desde Ene en adelante
            const current = getCurrentScenarioData();
            if (!current) return;

            current.data.gastos = {};
            current.data.ingresos = {};
            current.rubroOrder.gastos = [];
            current.rubroOrder.ingresos = [];

            // Procesar gastos
            for (let i = 1; i < gastosJson.length; i++) {
                const row = gastosJson[i];
                const rubro = row[0]?.trim();
                const detalle = row[1]?.trim();
                if (!rubro || !detalle) continue;

                if (!current.data.gastos[rubro]) {
                    current.data.gastos[rubro] = { detailOrder: [], detailsData: {} };
                    current.rubroOrder.gastos.push(rubro);
                }

                current.data.gastos[rubro].detailOrder.push(detalle);
                current.data.gastos[rubro].detailsData[detalle] = headers.map((_, idx) => parseFloat(row[idx + 2] || 0));
            }

            // Procesar ingresos
            for (let i = 1; i < ingresosJson.length; i++) {
                const row = ingresosJson[i];
                const rubro = row[0]?.trim();
                const detalle = row[1]?.trim();
                if (!rubro || !detalle) continue;

                if (!current.data.ingresos[rubro]) {
                    current.data.ingresos[rubro] = { detailOrder: [], detailsData: {} };
                    current.rubroOrder.ingresos.push(rubro);
                }

                current.data.ingresos[rubro].detailOrder.push(detalle);
                current.data.ingresos[rubro].detailsData[detalle] = headers.map((_, idx) => parseFloat(row[idx + 2] || 0));
            }

            saveState();
            calculateAll(current);
        } catch (error) {
            console.error("Error procesando archivo Excel:", error);
            showSnackbar("Error al procesar el archivo Excel. Revisa el formato.", true, "error");
        }
    };

    reader.readAsArrayBuffer(file);
}

        function processSheetData(sheet, scenarioData, type, newRubrosTracker) {
            const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
            if (jsonData.length < 2) { console.warn(`Hoja "${type}" vacía o sin datos.`); return; }

            const header = jsonData[0].map(h => String(h ?? '').trim().toLowerCase());
            const rubroColIndex = header.indexOf('rubro');
            const detailColIndex = header.indexOf('detalle');
            if (rubroColIndex === -1) throw new Error(`Columna "Rubro" no encontrada en hoja "${type}".`);
            if (detailColIndex === -1) throw new Error(`Columna "Detalle" no encontrada en hoja "${type}".`);

            const monthColIndices = MONTHS.map(mShort => {
                const mShortLower = mShort.toLowerCase();
                // Allow full month name match as well (e.g., 'enero', 'febrero')
                const fullMonthLower = FULL_MONTHS[MONTHS.indexOf(mShort)].toLowerCase();
                return header.findIndex(h => h && (h.startsWith(mShortLower) || h === fullMonthLower));
            });

            const missingMonths = MONTHS.filter((_, i) => monthColIndices[i] === -1);
            if (missingMonths.length > 0) console.warn(`Meses no encontrados en hoja "${type}": [${missingMonths.join(', ')}]. Se usarán ceros.`);

             // Ensure scenario-level structures exist (these were reset just before calling this)
             scenarioData.rubroOrder[type] = scenarioData.rubroOrder[type] ?? [];
             scenarioData.data[type] = scenarioData.data[type] ?? {};
             scenarioData.monthStatus[type] = scenarioData.monthStatus[type] ?? {};

            // --- Row Processing ---
            for (let i = 1; i < jsonData.length; i++) {
                const row = jsonData[i];
                if (!row || !Array.isArray(row) || row.every(cell => cell === null || String(cell).trim() === '')) continue; // Skip empty/null rows

                const rubro = String(row[rubroColIndex] ?? '').trim();
                const detail = String(row[detailColIndex] ?? '').trim();
                if (!rubro || !detail) { console.warn(`Fila ${i+1} (${type}) omitida (falta Rubro o Detalle).`); continue; }

                // Add rubro to SCENARIO order if new
                if (!scenarioData.rubroOrder[type].includes(rubro)) {
                    scenarioData.rubroOrder[type].push(rubro);
                }
                // Initialize structures for the rubro in SCENARIO if first time
                if (!scenarioData.data[type][rubro]) {
                    scenarioData.data[type][rubro] = { detailOrder: [], detailsData: {} };
                }
                 // Initialize monthStatus object for the rubro if needed
                 if (!scenarioData.monthStatus[type][rubro]) {
                    scenarioData.monthStatus[type][rubro] = {};
                 }
                 // Add detail to SCENARIO order if new for this rubro
                 if (!scenarioData.data[type][rubro].detailOrder.includes(detail)) {
                    scenarioData.data[type][rubro].detailOrder.push(detail);
                 }
                // Initialize arrays for the specific detail in SCENARIO
                if (!scenarioData.data[type][rubro].detailsData[detail]) {
                    scenarioData.data[type][rubro].detailsData[detail] = Array(12).fill(0);
                }
                 // Initialize status array for the detail if needed (only for gastos)
                 if (type === 'gastos' && !scenarioData.monthStatus[type][rubro][detail]) {
                     scenarioData.monthStatus[type][rubro][detail] = Array(12).fill('Estimado');
                 }


                // Track new rubros for GLOBAL update later
                 if (!appState.settings.rubros[type].includes(rubro) && !newRubrosTracker[type].includes(rubro)) {
                    newRubrosTracker[type].push(rubro);
                 }

                // --- Process Monthly Values ---
                for (let m = 0; m < 12; m++) {
                    const colIndex = monthColIndices[m];
                    let value = 0;
                    let status = 'Estimado'; // Default status

                    if (colIndex !== -1 && row[colIndex] !== null) {
                        const cellValue = row[colIndex];
                        if (typeof cellValue === 'number' && !isNaN(cellValue)) {
                            value = cellValue;
                             if (type === 'gastos') status = 'REAL'; // Mark GASTOS with numbers as REAL
                        } else if (typeof cellValue === 'string' && cellValue.trim() !== '') {
                             // Try parsing string as number (handle currency symbols, thousands separators etc.)
                             const cleanedValue = cellValue.replace(/[$.]/g, '').replace(',', '.'); // Remove $, . (thousands), replace , (decimal) with .
                             const parsedNum = parseFloat(cleanedValue);
                             if (!isNaN(parsedNum)) {
                                 value = parsedNum;
                                 if (type === 'gastos') status = 'REAL';
                             } else {
                                  // console.warn(`Valor no numérico "${cellValue}" en ${type}/${rubro}/${detail} - ${MONTHS[m]}. Usando 0.`);
                             }
                         }
                    }
                    // Assign value to SCENARIO data
                    scenarioData.data[type][rubro].detailsData[detail][m] = value;
                     // Assign status ONLY for gastos based on Excel content
                     if (type === 'gastos') {
                         // Ensure the status array exists before assigning
                         if (!scenarioData.monthStatus[type][rubro][detail]) {
                             scenarioData.monthStatus[type][rubro][detail] = Array(12).fill('Estimado');
                         }
                         scenarioData.monthStatus[type][rubro][detail][m] = status;
                     }
                }
            }
             console.log(`Hoja "${type}" procesada. Rubros en orden: [${scenarioData.rubroOrder[type].join(', ')}]`);
        }


        function loadSampleData() {
            console.log("Cargando datos de ejemplo...");
            const scenarioData = getCurrentScenarioData();
            if (!scenarioData) { showSnackbar("No hay escenario activo. Crea o selecciona un año.", true, 'error'); return; }

            // Reset current scenario data
            scenarioData.data = { gastos: {}, ingresos: {} };
            scenarioData.monthStatus = { gastos: {}, ingresos: {} };
            scenarioData.rubroOrder = { gastos: [], ingresos: [] };
            // Calculated reset happens in calculateAll

            const sampleGastosRubros = ["Seguridad", "Jardinería", "Mantenimiento", "Administración", "Servicios Públicos"];
            // --- MODIFICADO: Usar constante ---
            const sampleIngresosRubros = [CUOTA_RUBRO_NAME, "Alquiler SUM", "Ingresos Extra", EXTRA_CUOTA_RUBRO_NAME];
            let settingsChanged = false;

            // Ensure sample rubros exist globally and locally
            sampleGastosRubros.forEach(r => {
                if (!appState.settings.rubros.gastos.includes(r)) { appState.settings.rubros.gastos.push(r); settingsChanged = true; }
                if (!appState.settings.rubroConfig[r]) appState.settings.rubroConfig[r] = { coefficientType: 'None', detailsCollapsed: true };
                if (!scenarioData.rubroOrder.gastos.includes(r)) scenarioData.rubroOrder.gastos.push(r);
            });
            sampleIngresosRubros.forEach(r => {
                 if (!appState.settings.rubros.ingresos.includes(r)) { appState.settings.rubros.ingresos.push(r); settingsChanged = true; }
                 if (!scenarioData.rubroOrder.ingresos.includes(r)) scenarioData.rubroOrder.ingresos.push(r);
            });

             // Initialize structures in the current scenario for these rubros AND ensure others are initialized
             initializeScenarioDataForRubros(scenarioData);
             if (settingsChanged) {
                 // Re-initialize all scenarios if global settings changed
                Object.values(appState.scenarios).forEach(scen => initializeScenarioDataForRubros(scen));
                saveState(); // Save settings early if they changed
             }

            // --- Gastos Data & Status ---
            scenarioData.data.gastos["Seguridad"].detailOrder = ["Vigilador Dia", "Vigilador Noche", "Monitoreo Cámaras"];
            scenarioData.data.gastos["Seguridad"].detailsData = {
                "Vigilador Dia":   [50000, 50500, 51000, 51500, 52000, 52500, 53000, 53500, 54000, 54500, 55000, 55500],
                "Vigilador Noche": [55000, 55500, 56000, 56500, 57000, 57500, 58000, 58500, 59000, 59500, 60000, 60500],
                "Monitoreo Cámaras": Array(12).fill(10000)
            };
            scenarioData.monthStatus.gastos["Seguridad"] = {
                "Vigilador Dia":   ['REAL','REAL','REAL','REAL',   'Estimado','Estimado','Estimado','Estimado','Estimado','Estimado','Estimado','Estimado'],
                "Vigilador Noche": ['REAL','REAL','REAL','REAL',   'Estimado','Estimado','Estimado','Estimado','Estimado','Estimado','Estimado','Estimado'],
                "Monitoreo Cámaras": ['REAL','REAL','REAL','REAL', 'Estimado','Estimado','Estimado','Estimado','Estimado','Estimado','Estimado','Estimado'] // Example: Real first 4 months
            };
             scenarioData.data.gastos["Jardinería"].detailOrder = ["Mantenimiento Parque", "Reposición Plantas"];
             scenarioData.data.gastos["Jardinería"].detailsData = {
                 "Mantenimiento Parque": [30000, 30000, 30500, 30500, 31000, 31000, 31500, 31500, 32000, 32000, 32500, 32500],
                 "Reposición Plantas":   [0,     0,     5000,  0,     0,     0,     0,     0,     6000,  0,     0,     0]
             };
             scenarioData.monthStatus.gastos["Jardinería"] = {
                 "Mantenimiento Parque": ['REAL','REAL','REAL','REAL','Estimado','Estimado','Estimado','Estimado','Estimado','Estimado','Estimado','Estimado'],
                 "Reposición Plantas":   ['REAL','REAL','REAL','REAL','Estimado','Estimado','Estimado','Estimado','REAL','Estimado','Estimado','Estimado']
             };
            scenarioData.data.gastos["Mantenimiento"].detailOrder = ["Bomba Agua Pozo", "Limpieza Tanques", "Pintura General"];
            scenarioData.data.gastos["Mantenimiento"].detailsData = {
                "Bomba Agua Pozo":  [0,     12000, 0,     0,     0,     0,     0,     13500, 0,     0,     0,     0],
                "Limpieza Tanques": [0,     0,     0,     15000, 0,     0,     0,     0,     0,     15000, 0,     0],
                "Pintura General":  [0,     0,     0,     0,     0,     0,     0,     0,     45000, 0,     0,     0]
            };
             scenarioData.monthStatus.gastos["Mantenimiento"] = {
                "Bomba Agua Pozo":  ['REAL','REAL','Estimado','Estimado','Estimado','Estimado','Estimado','REAL','Estimado','Estimado','Estimado','Estimado'],
                "Limpieza Tanques": ['Estimado','Estimado','Estimado','REAL','Estimado','Estimado','Estimado','Estimado','Estimado','REAL','Estimado','Estimado'],
                "Pintura General":  ['Estimado','Estimado','Estimado','Estimado','Estimado','Estimado','Estimado','Estimado','REAL','Estimado','Estimado','Estimado']
             };
             scenarioData.data.gastos["Administración"].detailOrder = ["Honorarios Admin", "Gastos Bancarios", "Papelería"];
            scenarioData.data.gastos["Administración"].detailsData = {
                "Honorarios Admin": Array(12).fill(40000),
                "Gastos Bancarios": [500,   500,   550,   550,   600,   600,   600,   650,   650,   700,   700,   700],
                "Papelería":        [1000,  0,     0,     1200,  0,     0,     1500,  0,     0,     1000,  0,     0]
            };
             scenarioData.monthStatus.gastos["Administración"] = {
                 "Honorarios Admin": ['REAL','REAL','REAL','REAL','Estimado','Estimado','Estimado','Estimado','Estimado','Estimado','Estimado','Estimado'], // Make first 4 real
                 "Gastos Bancarios": ['REAL','REAL','REAL','REAL','Estimado','Estimado','Estimado','Estimado','Estimado','Estimado','Estimado','Estimado'],
                 "Papelería":        ['REAL','REAL','REAL','REAL','Estimado','Estimado','REAL','Estimado','Estimado','REAL','Estimado','Estimado']
             };
            scenarioData.data.gastos["Servicios Públicos"].detailOrder = ["Luz Espacios Comunes", "Agua Riego"];
            scenarioData.data.gastos["Servicios Públicos"].detailsData = {
                "Luz Espacios Comunes": [18000, 19500, 21000, 20500, 19000, 18500, 19000, 20000, 22000, 23000, 21500, 20000],
                "Agua Riego":           [5000,  6000,  7500,  8000,  7000,  6500,  6000,  7000,  8500,  9000,  8000,  6000]
            };
             scenarioData.monthStatus.gastos["Servicios Públicos"] = {
                 "Luz Espacios Comunes": ['REAL','REAL','REAL','REAL','Estimado','Estimado','Estimado','Estimado','Estimado','Estimado','Estimado','Estimado'],
                 "Agua Riego":           ['REAL','REAL','REAL','REAL','Estimado','Estimado','Estimado','Estimado','Estimado','Estimado','Estimado','Estimado']
             };

            // --- Ingresos Data --- (No monthStatus here)
             // --- MODIFICADO: Usar constante en nombre de rubro ---
            scenarioData.data.ingresos[CUOTA_RUBRO_NAME].detailOrder = ["Valor Base UF"];
            scenarioData.data.ingresos[CUOTA_RUBRO_NAME].detailsData = { "Valor Base UF": [1500, 1500, 1550, 1550, 1600, 1600, 1650, 1650, 1700, 1700, 1750, 1750] }; // Varied example
            scenarioData.data.ingresos["Alquiler SUM"].detailOrder = ["Eventos Fin de Semana", "Eventos Semana"];
            scenarioData.data.ingresos["Alquiler SUM"].detailsData = {
                "Eventos Fin de Semana": [5000, 6000, 4000, 7000, 8000, 9000, 5000, 6000, 7500, 8500, 9500, 10000],
                "Eventos Semana":        [1000, 1500, 1000, 2000, 2500, 2000, 1500, 1800, 2200, 2500, 2000, 1500]
            };
            scenarioData.data.ingresos["Ingresos Extra"].detailOrder = ["Multas Reglamento", "Donaciones"];
            scenarioData.data.ingresos["Ingresos Extra"].detailsData = {
                "Multas Reglamento": [0,    1000, 500,  0,    1500, 0,    0,    500,  0,    1000, 0,    0],
                "Donaciones":        [0,    0,    0,    0,    5000, 0,    0,    0,    0,    0,    10000,0]
            };
            scenarioData.data.ingresos[EXTRA_CUOTA_RUBRO_NAME].detailOrder = ["Cuota Obra Pileta"];
            scenarioData.data.ingresos[EXTRA_CUOTA_RUBRO_NAME].detailsData = { "Cuota Obra Pileta": [0, 0, 0, 500, 500, 500, 500, 500, 0, 0, 0, 0] };


             // Update Settings panel if new rubros were added globally
            if (settingsChanged) {
                updateSettingsPanel();
            }

            const feedbackDiv = document.getElementById('file-upload-feedback');
            feedbackDiv.textContent = "Datos de ejemplo cargados.";
            feedbackDiv.style.color = 'var(--success-color)';

            // Recalculate with sample data
            calculateAll(scenarioData); // This also saves state & updates UI
            showSnackbar("Datos de ejemplo cargados y procesados.", false, 'success');
         }

        function downloadTemplate() {
             const wb = XLSX.utils.book_new();
             const year = appState.currentYear;

             // Gastos Sheet
             const ws_gastos_data = [
                 ["Rubro", "Detalle", "Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"],
                 ["Seguridad", "Vigilador Dia", 50000, 50500, 51000, null, null, null, null, null, null, null, null, null], // null = Estimado
                 ["Seguridad", "Monitoreo Cámaras", 10000, 10000, 10000, 10000, 10000, 10000, 10000, 10000, 10000, 10000, 10000, 10000], // Con valor = REAL
                 ["Jardinería", "Mantenimiento Parque", 30000, 30000, null, null, null, null, null, null, null, null, null, null],
                 ["Mantenimiento", "Limpieza Pileta", null, null, 5000, 5000, null, null, null, null, null, 5500, null, null], // Gastos esporádicos
                 ["Administración", "Honorarios Admin", 40000, 40000, 40000, 40000, null, null, null, null, null, null, null, null],
             ];
             const ws_gastos = XLSX.utils.aoa_to_sheet(ws_gastos_data);
             ws_gastos['!cols'] = [ {wch:20}, {wch:25}, {wch:10}, {wch:10}, {wch:10}, {wch:10}, {wch:10}, {wch:10}, {wch:10}, {wch:10}, {wch:10}, {wch:10}, {wch:10}, {wch:10} ];
             XLSX.utils.book_append_sheet(wb, ws_gastos, GASTOS_SHEET_NAME);

             // Ingresos Sheet - MODIFICADO
             const ws_ingresos_data = [
                 ["Rubro", "Detalle", "Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"],
                 [CUOTA_RUBRO_NAME, `Valor Base 1 UF`, 1500, 1500, 1500, 1600, 1600, 1600, 1700, 1700, 1700, 1800, 1800, 1800], // VALOR POR UF
                 [EXTRA_CUOTA_RUBRO_NAME, `Cuota Extra Obra (x UF)`, null, null, null, 500, 500, 500, 500, null, null, null, null, null], // VALOR POR UF
                 ["Alquiler SUM", "Evento Sabado", 5000, null, 6000, null, null, 7000, null, null, 8000, null, null, 9000], // Ingresos esporádicos
                 ["Ingresos Extra", "Multa Atraso", null, 1000, null, null, 1500, null, null, 500, null, null, null, null]
             ];
             const ws_ingresos = XLSX.utils.aoa_to_sheet(ws_ingresos_data);
             ws_ingresos['!cols'] = [ {wch:25}, {wch:25}, {wch:10}, {wch:10}, {wch:10}, {wch:10}, {wch:10}, {wch:10}, {wch:10}, {wch:10}, {wch:10}, {wch:10}, {wch:10}, {wch:10} ];
             XLSX.utils.book_append_sheet(wb, ws_ingresos, INGRESOS_SHEET_NAME);

             XLSX.writeFile(wb, `Plantilla_Expensas_${year}.xlsx`);
             showSnackbar("Plantilla de ejemplo descargada.", false, 'success');
        }

        function saveReserveFund() {
             console.log("Guardando config fondo reserva...");
             const scenarioData = getCurrentScenarioData();
             if (!scenarioData) { showSnackbar("No hay escenario activo.", true, 'error'); return; }

             // Ensure reserveFund object and values array exist
             scenarioData.reserveFund = scenarioData.reserveFund ?? { type: 'percent', values: Array(12).fill(5) };
             if (!Array.isArray(scenarioData.reserveFund.values) || scenarioData.reserveFund.values.length !== 12) {
                 scenarioData.reserveFund.values = Array(12).fill(scenarioData.reserveFund.type === 'percent' ? 5 : 0);
             }

             const newType = document.getElementById('reserve-type-percent').checked ? 'percent' : 'fixed';
             let valuesChanged = scenarioData.reserveFund.type !== newType;
             scenarioData.reserveFund.type = newType;

             const inputs = document.querySelectorAll('#reserve-fund-panel input[type="number"]');
             let validationOk = true;

             inputs.forEach(input => {
                 const monthIndex = parseInt(input.dataset.month);
                 const value = parseFloat(input.value);

                 if (!isNaN(value) && value >= 0 && monthIndex >= 0 && monthIndex < 12) {
                     if (scenarioData.reserveFund.values[monthIndex] !== value) {
                         scenarioData.reserveFund.values[monthIndex] = value;
                         valuesChanged = true;
                     }
                 } else {
                     input.value = scenarioData.reserveFund.values[monthIndex]; // Revert display
                     showSnackbar(`Valor inválido para ${FULL_MONTHS[monthIndex]}. Debe ser >= 0.`, true, 'error');
                     validationOk = false;
                 }
             });

             if (!validationOk) { console.warn("Guardado fondo reserva cancelado por valores inválidos."); return; }

             if (valuesChanged) {
                 console.log("Cambios detectados en fondo reserva. Recalculando...");
                 // Recalculate handles saveState and success message
                 calculateAll(scenarioData);
             } else {
                 showSnackbar("No se detectaron cambios en la configuración del fondo.", false, 'info');
             }
        }

        function saveSettings() {
             console.log("Guardando configuración general...");
             const oldSettingsJson = JSON.stringify(appState.settings);

             // --- Save Cantidad UF ---
             const cantidadInput = document.getElementById('cantidad-unidades');
             const newCantidadUnidades = parseInt(cantidadInput.value);
             if (!isNaN(newCantidadUnidades) && newCantidadUnidades > 0) {
                 appState.settings.cantidadUnidades = newCantidadUnidades;
             } else {
                 cantidadInput.value = appState.settings.cantidadUnidades; // Revert
                 showSnackbar("Cantidad de UF inválida (> 0).", true, 'error');
                 return; // Stop saving
             }

             // --- Manual IPC Inputs are already saved in state by their onchange handlers ---
             // --- Rubro Config (Coef assignments, collapsed state) saved by handlers ---
             // --- Coefficient Type Values saved by handlers ---

             // --- Ensure IPC Manual array is valid before saving ---
             if (!Array.isArray(appState.settings.ipcManual) || appState.settings.ipcManual.length !== 12) {
                appState.settings.ipcManual = Array(12).fill(0);
             }

             saveState(); // Save potential UF change and ensure IPC values are persisted

             const newSettingsJson = JSON.stringify(appState.settings);
             const settingsChangedForCalc = newSettingsJson !== oldSettingsJson;

             if (settingsChangedForCalc) {
                 console.log("Configuración cambiada, recalculando escenario activo...");
                 const scenarioData = getCurrentScenarioData();
                 if (scenarioData) {
                     // calculateAll handles success message
                     calculateAll(scenarioData);
                 } else {
                     showSnackbar("Configuración guardada, pero no hay escenario activo para recalcular.", false, 'warning');
                 }
             } else {
                 showSnackbar("Configuración guardada (sin cambios que requieran recálculo).", false, 'success');
             }
             // Refresh the panel UI just in case (e.g., if UF was reverted)
             updateSettingsPanel();
        }

        function addRubro(type) {
            const inputId = `new-${type}-rubro-name`;
            const input = document.getElementById(inputId);
            if (!input) { console.error(`Input no encontrado: ${inputId}`); showSnackbar("Error interno.", true); return; }
            const newRubroName = input.value.trim();

            if (!newRubroName) { showSnackbar("Nombre de rubro vacío.", true, 'warning'); input.focus(); return; }

            if (appState.settings.rubros[type].some(r => r.toLowerCase() === newRubroName.toLowerCase())) {
                showSnackbar(`Rubro "${newRubroName}" ya existe en ${type}.`, true, 'warning');
                input.select(); return;
            }

            // Add to global settings
            appState.settings.rubros[type].push(newRubroName);
            if (type === 'gastos' && !appState.settings.rubroConfig[newRubroName]) {
                appState.settings.rubroConfig[newRubroName] = { coefficientType: 'None', detailsCollapsed: true };
            }

            // Initialize data structures for this new rubro in ALL existing scenarios
            Object.values(appState.scenarios).forEach(scenario => {
                 initializeScenarioDataForRubros(scenario);
            });

            input.value = '';
            console.log(`Rubro ${type} añadido: ${newRubroName}`);
            saveState(); // Save updated settings and scenario structures

            updateRubroList(type, `${type}-rubro-list`);
            // Update the other list too if it's gastos (to update coefficient dropdowns)
            if(type === 'ingresos' && document.getElementById('gasto-rubro-list')) {
                 updateRubroList('gastos', 'gasto-rubro-list');
            }

            showSnackbar(`Rubro "${newRubroName}" (${type}) añadido.`, false, 'success');
        }

        function deleteRubro(type, rubroToDelete) {
             if (!confirm(`¿Seguro que quieres eliminar el rubro "${rubroToDelete}" (${type})?\n\nSe borrarán todos sus datos en TODOS los escenarios.\n¡No se puede deshacer!`)) {
                 showSnackbar("Eliminación cancelada.", false, 'info'); return;
             }

             // --- Remove from Global Settings ---
             appState.settings.rubros[type] = appState.settings.rubros[type].filter(r => r !== rubroToDelete);
             delete appState.settings.rubroConfig[rubroToDelete];
             console.log(`Rubro "${rubroToDelete}" eliminado de config global.`);

             // --- Remove from ALL Scenarios ---
             Object.keys(appState.scenarios).forEach(scenarioKey => {
                 const scenario = appState.scenarios[scenarioKey];
                 if (scenario) { // Check if scenario exists
                     // Check if type exists in scenario data
                     if (scenario.data?.[type]) {
                         delete scenario.data[type][rubroToDelete];
                     }
                     if (scenario.monthStatus?.[type]) {
                         delete scenario.monthStatus[type][rubroToDelete];
                     }
                     if (scenario.calculated) { // Check if calculated exists
                         if (type === 'gastos') {
                             if (scenario.calculated.gastoAjustado) delete scenario.calculated.gastoAjustado[rubroToDelete];
                             if (scenario.calculated.totalGastoRubroMes) delete scenario.calculated.totalGastoRubroMes[rubroToDelete];
                             if (scenario.calculated.annualTotals?.gastos) delete scenario.calculated.annualTotals.gastos[rubroToDelete];
                         } else { // ingresos
                             if (scenario.calculated.ingresoAjustado) delete scenario.calculated.ingresoAjustado[rubroToDelete];
                             if (scenario.calculated.totalIngresoRubroMes) delete scenario.calculated.totalIngresoRubroMes[rubroToDelete];
                             if (scenario.calculated.annualTotals?.ingresos) delete scenario.calculated.annualTotals.ingresos[rubroToDelete];
                         }
                     }
                     if (scenario.rubroOrder?.[type]) {
                         scenario.rubroOrder[type] = scenario.rubroOrder[type].filter(r => r !== rubroToDelete);
                     }
                 }
             });

             saveState();

             const activeScenario = getCurrentScenarioData();
             if (activeScenario) {
                 // Recalculate handles success message
                 calculateAll(activeScenario);
             } else {
                 updateUI(); // Just refresh lists if no active scenario
                 showSnackbar(`Rubro "${rubroToDelete}" (${type}) eliminado.`, false, 'success');
             }
             // Update settings panel lists explicitly
             updateSettingsPanel();
        }

        function addCoefficientType() {
             const input = document.getElementById('new-coefficient-type-name');
             if (!input) { console.error("Input no encontrado: new-coefficient-type-name"); showSnackbar("Error interno.", true); return; }
             const name = input.value.trim();

             if (!name) { showSnackbar("Nombre de tipo vacío.", true, 'warning'); input.focus(); return; }

             const key = name.replace(/\s+/g, '_').toUpperCase();
             const nameExists = Object.values(appState.settings.coefficientTypes).some(t => t.name.toLowerCase() === name.toLowerCase());
             // Also check if the generated key already exists
             if (appState.settings.coefficientTypes[key] || nameExists) {
                 showSnackbar(`Tipo "${name}" o clave "${key}" ya existe.`, true, 'warning');
                 input.select(); return;
             }

             appState.settings.coefficientTypes[key] = { name: name, values: Array(12).fill(1), isDefault: false };

             input.value = '';
             console.log(`Tipo coeficiente añadido: "${name}" (${key})`);
             saveState();

             updateCoefficientTypeList();
             updateRubroList('gastos', 'gasto-rubro-list'); // Update selects in gasto list
             showSnackbar(`Tipo de coeficiente "${name}" añadido.`, false, 'success');
        }

        function deleteCoefficientType(typeKey) {
             const type = appState.settings.coefficientTypes[typeKey];
             if (!type) { showSnackbar("Tipo no encontrado.", true, 'error'); return; }
             if (typeKey === 'None' || type.isDefault) { // Cannot delete 'None' or other defaults
                 showSnackbar(`Tipo por defecto "${type.name}" no se puede eliminar.`, true, 'warning'); return;
             }

             const isInUse = appState.settings.rubros.gastos.some(rubro => appState.settings.rubroConfig[rubro]?.coefficientType === typeKey);
             if (isInUse) {
                 showSnackbar(`Tipo "${type.name}" está en uso por uno o más rubros de gasto. Reasigna los rubros (a 'Sin Coeficiente' u otro) antes de eliminar este tipo.`, true, 'warning', 9000);
                 return;
             }

             if (confirm(`¿Seguro que quieres eliminar el tipo de coeficiente "${type.name}"?`)) {
                 const deletedName = type.name;
                 delete appState.settings.coefficientTypes[typeKey];

                 if (appState.uiState.editingCoefficientType === typeKey) {
                     appState.uiState.editingCoefficientType = null;
                     renderCoefficientValuesEditor(null); // Clear editor
                 }

                 console.log(`Tipo coeficiente eliminado: ${deletedName} (${typeKey})`);
                 saveState();

                 updateCoefficientTypeList();
                 updateRubroList('gastos', 'gasto-rubro-list'); // Update selects in gasto list

                 showSnackbar(`Tipo de coeficiente "${deletedName}" eliminado.`, false, 'success');
             } else {
                 showSnackbar("Eliminación cancelada.", false, 'info');
             }
        }

        function updateReserveUI() {
             const scenarioData = getCurrentScenarioData();
             if (!scenarioData) return;

             const selectedType = document.getElementById('reserve-type-percent').checked ? 'percent' : 'fixed';
             const panel = document.getElementById('reserve-fund-panel');
             if (!panel) return;

             const unitLabel = selectedType === 'percent' ? '%' : '$';
             const newStep = selectedType === 'percent' ? '0.1' : '100';

             panel.querySelectorAll('input[type="number"]').forEach(input => input.step = newStep);
             panel.querySelectorAll('.month-config span').forEach(span => span.textContent = unitLabel);

             console.log(`UI fondo reserva actualizada a tipo: ${selectedType}`);
        }

        function exportToExcel() {
             console.log("Iniciando exportación Excel...");
             const scenarioData = getCurrentScenarioData();
             // --- FIX: Check for calculated data existence more thoroughly ---
             if (!scenarioData || !scenarioData.calculated || !scenarioData.calculated.annualTotals || !scenarioData.calculated.totalGastoProyectadoMes || !scenarioData.calculated.totalIngresoProyectadoMes) {
                 showSnackbar("No hay datos calculados válidos para exportar.", true, 'error'); return;
             }
             const { year, scenarioName, data, calculated, reserveFund, rubroOrder } = scenarioData;
             const { settings } = appState;
             const { rubros, rubroConfig, coefficientTypes, cantidadUnidades, ipcManual: ipcSettings } = settings; // Use settings IPC for reference row

             try {
                 const wb = XLSX.utils.book_new();

                 // Define basic cell formats (more complex styling is harder with aoa_to_sheet)
                 const headerStyle = { font: { bold: true }, alignment: { horizontal: "center" } };
                 const currencyFormat = "$ #,##0.00";
                 const percentFormat = "0.0%";
                 const numberFormat = "#,##0.00"; // Non-currency number

                 // --- Helper to create data for sheets ---
                 const createSheetData = (title, headers, dataRows) => {
                     // Filter out rows that are just placeholders (like section headers) before adding data
                     const validDataRows = dataRows.filter(row => Array.isArray(row) && row.length > 0);
                     return [[title], [], headers, ...validDataRows];
                 };

                 // --- 1. Detalle Gastos Sheet ---
                 const gastosHeaders = ["Rubro", "Detalle", "Coef. Aplicado", ...FULL_MONTHS, "Total Anual"];
                 const gastosRows = [];
                 (rubroOrder?.gastos || []).forEach(rubro => {
                     if (!settings.rubros.gastos.includes(rubro)) return;
                     const config = rubroConfig[rubro] || {};
                     const coefName = coefficientTypes[config.coefficientType || 'None']?.name || 'N/A';
                     const detailOrder = data.gastos?.[rubro]?.detailOrder || [];
                     detailOrder.forEach(detail => {
                         const values = calculated.gastoAjustado?.[rubro]?.[detail] || Array(12).fill(0);
                         const annualTotal = values.reduce((a, b) => a + (b || 0), 0);
                         gastosRows.push([rubro, detail, coefName, ...values, annualTotal]);
                     });
                 });
                 const gastosSheetData = createSheetData(`DETALLE GASTOS ${year} - ${scenarioName}`, gastosHeaders, gastosRows);
                 const ws_gastos = XLSX.utils.aoa_to_sheet(gastosSheetData);
                 // Basic Widths
                 ws_gastos['!cols'] = [{wch:20},{wch:25},{wch:18}, ...Array(12).fill({wch:12}), {wch:14}];
                 // Apply formatting (basic example for values)
                 gastosRows.forEach((_, rowIndex) => {
                     for (let col = 3; col < 15 + 1; col++) { // Months + Total
                         const cellRef = XLSX.utils.encode_cell({r: rowIndex + 3, c: col}); // +3 for title, space, header
                         if(ws_gastos[cellRef]) { ws_gastos[cellRef].z = currencyFormat; ws_gastos[cellRef].t = 'n';}
                     }
                 });
                 XLSX.utils.book_append_sheet(wb, ws_gastos, "Detalle Gastos");


                 // --- 2. Detalle Ingresos Sheet (Shows BASE values) ---
                 const ingresosHeaders = ["Rubro", "Detalle", ...FULL_MONTHS, "Total Anual"];
                 const ingresosRows = [];
                 (rubroOrder?.ingresos || []).forEach(rubro => {
                    if (!settings.rubros.ingresos.includes(rubro)) return;
                    const detailOrder = data.ingresos?.[rubro]?.detailOrder || [];
                    detailOrder.forEach(detail => {
                        const values = calculated.ingresoAjustado?.[rubro]?.[detail] || Array(12).fill(0); // BASE values
                        const annualTotal = values.reduce((a, b) => a + (b || 0), 0);
                        const rubroNote = SPECIAL_INGRESO_RUBROS.includes(rubro) ? ` (Valor Base x UF)` : '';
                        ingresosRows.push([`${rubro}${rubroNote}`, detail, ...values, annualTotal]);
                    });
                 });
                 const ingresosSheetData = createSheetData(`DETALLE INGRESOS (Valores Base) ${year} - ${scenarioName}`, ingresosHeaders, ingresosRows);
                 const ws_ingresos = XLSX.utils.aoa_to_sheet(ingresosSheetData);
                 ws_ingresos['!cols'] = [{wch:25},{wch:25}, ...Array(12).fill({wch:12}), {wch:14}];
                 ingresosRows.forEach((_, rowIndex) => {
                     for (let col = 2; col < 14 + 1; col++) { // Months + Total
                         const cellRef = XLSX.utils.encode_cell({r: rowIndex + 3, c: col});
                         if(ws_ingresos[cellRef]) { ws_ingresos[cellRef].z = currencyFormat; ws_ingresos[cellRef].t = 'n';}
                     }
                 });
                 XLSX.utils.book_append_sheet(wb, ws_ingresos, "Detalle Ingresos (Base)");


                 // --- 3. Resumen General Sheet ---
                 const resumenHeaders = ["Concepto", ...FULL_MONTHS, "Total Anual"];
                 const resumenRows = [];
                 const addRow = (label, values, format, isPercent = false) => {
                    const annual = values.reduce ? values.reduce((a, b) => a + (b || 0), 0) : values; // Sum if array, else take value
                    resumenRows.push([label, ...values, annual]);
                    const lastRowIndex = resumenRows.length - 1 + 3; // 0-based + 3 offset
                    // Mark row for formatting later
                     resumenRows[resumenRows.length-1].formatInfo = { format, isPercent, rowIndex: lastRowIndex };
                 };

                 // Gastos Section
                 resumenRows.push(["--- GASTOS ---"]);
                 (rubroOrder?.gastos || []).forEach(rubro => {
                     if (!settings.rubros.gastos.includes(rubro)) return;
                     addRow(`Gasto - ${rubro}`, calculated.totalGastoRubroMes?.[rubro] || Array(12).fill(0), currencyFormat);
                 });
                 addRow("TOTAL GASTOS ($)", calculated.totalGastoProyectadoMes || [], currencyFormat);
                 resumenRows.push([]); // Spacer

                 // Ingresos Section (Calculated totals incl. UF mult)
                 resumenRows.push(["--- INGRESOS (Calculados) ---"]);
                 (rubroOrder?.ingresos || []).forEach(rubro => {
                     if (!settings.rubros.ingresos.includes(rubro)) return;
                     addRow(`Ingreso - ${rubro}`, calculated.totalIngresoRubroMes?.[rubro] || [], currencyFormat);
                 });
                 addRow("TOTAL INGRESOS ($)", calculated.totalIngresoProyectadoMes || [], currencyFormat);
                 resumenRows.push([]); // Spacer

                 // Fondo Reserva Section
                 resumenRows.push(["--- FONDO RESERVA ---"]);
                 const reserveLabel = `Fondo Reserva Config (${reserveFund.type === 'percent' ? '%' : '$'})`;
                 addRow(reserveLabel, reserveFund.values.map(v => parseFloat(v || 0)), reserveFund.type === 'percent' ? percentFormat : currencyFormat, reserveFund.type === 'percent');
                 addRow("Fondo Reserva Calculado ($)", calculated.fondoReservaMes || [], currencyFormat);
                 resumenRows.push([]); // Spacer

                 // Cuotas & IPC Section
                 resumenRows.push(["--- CUOTAS Y REFERENCIAS ---"]);
                 addRow(`Unidades Funcionales (UF)`, [cantidadUnidades, ...Array(11).fill(null)], numberFormat); // Show UF count once
                 addRow("Cuota s/Gtos Calculada ($)", calculated.cuotaSobreGastosMes || [], currencyFormat);
                 addRow("IPC Referencia (%)", (ipcSettings || Array(12).fill(0)), percentFormat, true);
                 addRow("Cuota IPC Calculada ($)", calculated.cuotaIpcMes || [], currencyFormat);
                 addRow("Cuota Real Base ($)", calculated.cuotaRealBaseMes || [], currencyFormat);

                 // Create Resumen Sheet
                 const resumenSheetData = createSheetData(`RESUMEN GENERAL ${year} - ${scenarioName}`, resumenHeaders, resumenRows);
                 const ws_resumen = XLSX.utils.aoa_to_sheet(resumenSheetData);
                 ws_resumen['!cols'] = [{wch:30}, ...Array(12).fill({wch:12}), {wch:14}];
                  // Apply Formatting based on stored info
                 resumenRows.forEach(row => {
                    if (row.formatInfo) {
                         for (let col = 1; col < 13 + 1; col++) { // Months + Total
                             const cellRef = XLSX.utils.encode_cell({r: row.formatInfo.rowIndex, c: col});
                             if(ws_resumen[cellRef]) {
                                 // Convert percent values for Excel (e.g., 5 -> 0.05)
                                 if (row.formatInfo.isPercent && typeof ws_resumen[cellRef].v === 'number') {
                                     ws_resumen[cellRef].v /= 100;
                                 }
                                 ws_resumen[cellRef].z = row.formatInfo.format;
                                 ws_resumen[cellRef].t = 'n';
                             }
                         }
                    }
                 });
                 XLSX.utils.book_append_sheet(wb, ws_resumen, "Resumen General");


                 // --- Write File ---
                 const filename = `Reporte_Expensas_${year}_${scenarioName.replace(/\s+/g, '_')}.xlsx`;
                 XLSX.writeFile(wb, filename);
                 showSnackbar("Reporte Excel generado.", false, 'success');

             } catch (error) {
                  console.error("Error exportando a Excel:", error);
                  showSnackbar(`Error al generar Excel: ${error.message}`, true, 'error');
             }
        }


        function exportChart(canvasId, filename) {
             const canvas = document.getElementById(canvasId);
             const chartInstance = window[`${canvasId}_instance`];
             if (!canvas || !chartInstance || chartInstance.data.datasets.every(ds => ds.data.length === 0 || ds.data.every(d => d === 0))) {
                 showSnackbar(`Gráfico "${canvasId}" no encontrado o sin datos para exportar.`, true, 'warning');
                 return;
             }
             try {
                 chartInstance.update('none'); // Ensure rendered without animation for export
                 setTimeout(() => { // Allow canvas redraw
                     const imageURL = canvas.toDataURL('image/png');
                     const link = document.createElement('a');
                     link.href = imageURL;
                     link.download = filename;
                     document.body.appendChild(link);
                     link.click();
                     document.body.removeChild(link);
                     showSnackbar(`Gráfico "${filename}" exportado como PNG.`, false, 'success');
                 }, 150);
             } catch (e) {
                 console.error(`Error exportando gráfico "${canvasId}":`, e);
                 showSnackbar("Error al exportar gráfico.", true, 'error');
             }
        }


        // --- Utilidades ---
        function formatCurrency(value) {
             const num = Number(value);
             if (isNaN(num)) return "$ 0,00";
             // Use es-AR locale for Argentinian Peso formatting
             return `$ ${num.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        }

        function hexToRgba(hex, alpha) {
            hex = String(hex).trim().replace('#', '');
            if (!/^[0-9A-F]{3,6}$/i.test(hex)) return `rgba(0,0,0,${alpha})`; // Fallback black
            if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
            const r = parseInt(hex.slice(0, 2), 16), g = parseInt(hex.slice(2, 4), 16), b = parseInt(hex.slice(4, 6), 16);
            return (isNaN(r) || isNaN(g) || isNaN(b)) ? `rgba(0,0,0,${alpha})` : `rgba(${r}, ${g}, ${b}, ${alpha})`;
        }

        function openTab(evt, tabName) {
             let i, tabcontent, tablinks;
             tabcontent = document.getElementsByClassName("tab-content");
             for (i = 0; i < tabcontent.length; i++) { tabcontent[i].classList.remove("active"); tabcontent[i].style.display = "none"; }
             tablinks = document.getElementsByClassName("tab-link");
             for (i = 0; i < tablinks.length; i++) { tablinks[i].classList.remove("active"); }
             const tabToShow = document.getElementById(tabName);
             if(tabToShow) { tabToShow.style.display = "block"; void tabToShow.offsetWidth; tabToShow.classList.add("active"); }
             if(evt?.currentTarget) evt.currentTarget.classList.add("active");

             if (tabName === 'dashboard') { // Resize charts when dashboard tab is shown
                 requestAnimationFrame(() => {
                    ['evolutivoCuotaChart', 'participacionGastosChart', 'participacionIngresosChart'].forEach(id => {
                        if (window[`${id}_instance`]) window[`${id}_instance`].resize();
                    });
                 });
             }
        }

        function showSnackbar(message, isError = false, level = null, duration = 4000) {
             const snackbar = document.getElementById('snackbar');
             if (!snackbar) return;
             snackbar.textContent = message;
             let effectiveLevel = level ?? (isError ? 'error' : 'success'); // Default to success if not error

             snackbar.className = 'show'; // Base class to make it visible and positioned
             if (effectiveLevel === 'error') snackbar.classList.add('error');
             else if (effectiveLevel === 'warning') snackbar.classList.add('warning');
             else if (effectiveLevel === 'info') snackbar.classList.add('info');
             // Success uses default style (no extra class needed)

             if (snackbar.timer) clearTimeout(snackbar.timer);
             snackbar.timer = setTimeout(() => {
                 snackbar.className = ''; // Remove all classes to hide
                 snackbar.timer = null;
             }, duration);
        }


        // --- Tema Oscuro/Claro ---
        function initTheme() {
            const savedTheme = localStorage.getItem('theme');
            const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
            appState.darkMode = (savedTheme === 'dark') || (!savedTheme && !!prefersDark); // Use saved or system pref
            applyTheme(false); // Apply initial theme without transition/chart update

            window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', event => {
                if (!localStorage.getItem('theme')) { // Only follow system if no explicit choice saved
                    appState.darkMode = event.matches;
                    applyTheme(); // Apply with transition/chart update
                    saveState(); // Save the implicit preference change
                }
            });
        }

        function toggleTheme() {
            appState.darkMode = !appState.darkMode;
            localStorage.setItem('theme', appState.darkMode ? 'dark' : 'light'); // Save explicit choice
            applyTheme();
            saveState();
        }

        function applyTheme(updateCharts = true){
            const body = document.body;
            const toggleButton = document.getElementById('theme-toggle');
            body.classList.toggle('dark-mode', appState.darkMode);
            if (toggleButton) {
                 toggleButton.innerHTML = appState.darkMode ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';
                 toggleButton.title = appState.darkMode ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro';
            }

            if (updateCharts) { // Avoid updating charts on initial load before they exist
                 requestAnimationFrame(() => { // Defer chart updates slightly
                     const textColor = getComputedStyle(document.documentElement).getPropertyValue('--text-color').trim();
                     const borderColor = getComputedStyle(document.documentElement).getPropertyValue('--border-color').trim();
                     Chart.defaults.color = textColor;
                     Chart.defaults.borderColor = borderColor;
                     // Update existing instances
                     ['evolutivoCuotaChart', 'participacionGastosChart', 'participacionIngresosChart'].forEach(id => {
                          if (window[`${id}_instance`]) window[`${id}_instance`].update();
                     });
                 });
            }
        }

        // --- Persistencia (localStorage) ---
        function saveState() {
             try {
                 const stateToSave = {
                     currentYear: appState.currentYear,
                     scenarios: appState.scenarios,
                     activeScenarioKey: appState.activeScenarioKey,
                     settings: appState.settings,
                     darkMode: appState.darkMode,
                     // Don't save uiState intentionally
                 };
                 localStorage.setItem(STORAGE_KEY, JSON.stringify(stateToSave));
                 // console.log("Estado guardado.");
             } catch (e) {
                 console.error("Error guardando estado:", e);
                 showSnackbar("Error al guardar estado.", true, 'error');
             }
         }

        function loadState() {
             try {
                 const savedState = localStorage.getItem(STORAGE_KEY);
                 if (savedState) {
                     const loadedState = JSON.parse(savedState);
                     appState = deepMerge(getDefaultAppState(), loadedState); // Merge loaded into default structure
                     console.log(`Estado ${STORAGE_KEY} cargado.`);
                 } else {
                     console.log("No hay estado guardado. Usando estado por defecto.");
                     appState = getDefaultAppState();
                 }
             } catch (e) {
                 console.error("Error cargando estado:", e);
                 showSnackbar("Error cargando estado guardado. Usando valores por defecto.", true, 'error');
                 appState = getDefaultAppState(); // Fallback
             }
             // Post-load validation is now handled by validateAndSetActiveScenario in DOMContentLoaded
        }

        function getDefaultAppState() {
            const defaultYear = new Date().getFullYear();
            // Use JSON parse/stringify for a clean deep copy
            return JSON.parse(JSON.stringify({
                 currentYear: defaultYear,
                 scenarios: {}, // Start with empty scenarios object
                 activeScenarioKey: null, // Will be set by validation logic
                 settings: {
                     cantidadUnidades: 100,
                     rubros: { gastos: [], ingresos: [] },
                     rubroConfig: {},
                     coefficientTypes: {
                         "None": { name: "Sin Coeficiente", values: Array(12).fill(1), isDefault: true },
                         "IPC": { name: "IPC (Ejemplo)", values: [1.05, 1.04, 1.06, 1.03, 1.04, 1.05, 1.03, 1.04, 1.05, 1.06, 1.04, 1.05], isDefault: true },
                         "UTEDYC": { name: "UTEDYC (Ejemplo)", values: [1, 1, 1.10, 1, 1, 1.08, 1, 1, 1.07, 1, 1, 1.05], isDefault: true },
                         "Sueldos": { name: "Sueldos Generales", values: [1, 1, 1.08, 1, 1, 1.06, 1, 1, 1.05, 1, 1, 1.04], isDefault: false }
                     },
                     ipcManual: [5, 4, 6, 3, 4, 5, 3, 4, 5, 6, 4, 5] // Default IPC ref values (%)
                 },
                 uiState: { // Transient state
                    editingCoefficientType: null
                 },
                 darkMode: false // Default theme
             }));
        }

        function deepMerge(target, source) {
             const output = { ...target };
             if (isObject(target) && isObject(source)) {
                 Object.keys(source).forEach(key => {
                     const targetValue = target[key];
                     const sourceValue = source[key];
                     if (isObject(sourceValue) && isObject(targetValue)) {
                         output[key] = deepMerge(targetValue, sourceValue);
                     } else if (Array.isArray(sourceValue) && Array.isArray(targetValue)) {
                         // Simple array merge: source overwrites target - adjust if needed
                          output[key] = [...sourceValue];
                     } else {
                          output[key] = sourceValue !== undefined ? sourceValue : targetValue;
                     }
                 });
             }
             return output;
         }

        function isObject(item) {
             return (item && typeof item === 'object' && !Array.isArray(item));
        }

        // --- Funciones Adicionales o de UI ---
        function updateReportsPanel() {
             const scenarioData = getCurrentScenarioData();
             const hasCalculatedData = scenarioData?.calculated && (
                (scenarioData.calculated.totalGastoProyectadoMes?.some(v => v !== 0) ?? false) ||
                (scenarioData.calculated.totalIngresoProyectadoMes?.some(v => v !== 0) ?? false)
             );
             const disable = !scenarioData || !hasCalculatedData;

             document.querySelectorAll('#reports button').forEach(btn => { btn.disabled = disable; });
        }

        function clearScenarioData() {
             const key = appState.activeScenarioKey;
             const scenario = appState.scenarios[key];
             if (!scenario) { showSnackbar('No hay escenario activo.', true, 'error'); return; }

             if (!confirm(`¿Borrar TODOS los datos (gastos, ingresos, estado meses) del escenario "${scenario.scenarioName}"?\n\nConfiguración de Fondo de Reserva se mantendrá.\n¡No se puede deshacer!`)) {
                 showSnackbar("Operación cancelada.", false, 'info'); return;
             }

             // Reset data, keep reserve fund
             scenario.rubroOrder = { gastos: [], ingresos: [] };
             scenario.data = { gastos: {}, ingresos: {} };
             scenario.monthStatus = { gastos: {}, ingresos: {} };
             // Calculated is reset within calculateAll

             console.log(`Datos borrados para escenario: ${key}`);
             saveState(); // Save cleared data structures
             // Recalculate to update totals to zero and refresh UI
             calculateAll(scenario); // Handles success message
        }


function renderDetalleTabla(tablaId, data, tipo) {
    const tbody = document.querySelector(`#${tablaId} tbody`);
    tbody.innerHTML = ''; // Limpiar contenido previo

    const rubros = Object.keys(data);
    rubros.forEach(rubro => {
        const rubroRow = document.createElement("tr");
        rubroRow.classList.add("rubro-total-row", "collapsed");
        rubroRow.innerHTML = `<td>${rubro}</td>`; // Solo el nombre del rubro, columnas se agregan en otro paso
        tbody.appendChild(rubroRow);

        const detalles = Object.keys(data[rubro]?.detailsData || {});
        detalles.forEach(detalle => {
            const fila = document.createElement("tr");
            fila.classList.add("detail-row", "hidden");
            fila.innerHTML = `<td>${detalle}</td>`; // También, columnas se agregan en otro paso
            tbody.appendChild(fila);
        });

        // Toggle expand/collapse
        rubroRow.addEventListener("click", () => {
            rubroRow.classList.toggle("collapsed");
            const nextRows = [];
            let next = rubroRow.nextElementSibling;
            while (next && next.classList.contains("detail-row")) {
                nextRows.push(next);
                next = next.nextElementSibling;
            }
            nextRows.forEach(row => {
                row.classList.toggle("hidden");
            });
        });
    });
}
