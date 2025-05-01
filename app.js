// ====== Constantes ======
const MONTHS = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
const GASTOS_SHEET_NAME = "Gastos";
const INGRESOS_SHEET_NAME = "Ingresos";
const CUOTA_RUBRO_NAME = "Expensas Ordinarias";
const EXTRA_CUOTA_RUBRO_NAME = "Expensas Extraordinarias";

// ====== Estado Global ======
let appState = {
  currentYear: new Date().getFullYear(),
  scenarios: {},
  settings: { cantidadUnidades: 100 }
};

// ====== Inicialización ======
document.addEventListener('DOMContentLoaded', () => {
  loadState();
  validateAndSetActiveScenario();
  addEventListeners();
  updateUI();
});

// ====== Manejo de Archivo Excel ======
function handleFileUpload(files) {
  if (!files.length) return;
  const file = files[0];
  const reader = new FileReader();
  reader.onload = e => {
    const data = new Uint8Array(e.target.result);
    const wb = XLSX.read(data,{type:'array'});
    const gastosJson = XLSX.utils.sheet_to_json(wb.Sheets[GASTOS_SHEET_NAME],{header:1});
    const ingresosJson = XLSX.utils.sheet_to_json(wb.Sheets[INGRESOS_SHEET_NAME],{header:1});
    const headers = gastosJson[0].slice(2);
    const current = getCurrentScenarioData();
    current.data = { gastos: {}, ingresos: {} };
    // Gastos
    for(let i=1;i<gastosJson.length;i++){
      const [rubro,detalle,...vals] = gastosJson[i];
      if(!rubro||!detalle) continue;
      current.data.gastos[rubro] = current.data.gastos[rubro]||{detailOrder:[],detailsData:{}};
      current.data.gastos[rubro].detailOrder.push(detalle);
      current.data.gastos[rubro].detailsData[detalle]=vals.map(v=>parseFloat(v)||0);
    }
    // Ingresos
    for(let i=1;i<ingresosJson.length;i++){
      const [rubro,detalle,...vals] = ingresosJson[i];
      if(!rubro||!detalle) continue;
      current.data.ingresos[rubro] = current.data.ingresos[rubro]||{detailOrder:[],detailsData:{}};
      current.data.ingresos[rubro].detailOrder.push(detalle);
      current.data.ingresos[rubro].detailsData[detalle]=vals.map(v=>parseFloat(v)||0);
    }
    saveState();
    updateUI();
  };
  reader.readAsArrayBuffer(file);
}

// ====== Actualización de UI ======
function updateUI() {
  const current = getCurrentScenarioData();
  updateCollapsibleTable('gastos', current);
  updateCollapsibleTable('ingresos', current);
}

// ====== Tablas Colapsables ======
function updateCollapsibleTable(type, scenarioData) {
  const tableId = `${type}-detail-table`;
  const table = document.getElementById(tableId);
  if(!table) return;
  const tbody=table.querySelector('tbody');
  tbody.innerHTML='';
  const data = scenarioData.data[type]||{};
  // Render rubros y detalles
  for(const [rubro,obj] of Object.entries(data)){
    const totalRow=document.createElement('tr');
    totalRow.classList.add('rubro-total-row');
    totalRow.innerHTML=`<td>${rubro}</td>`;
    tbody.appendChild(totalRow);
    obj.detailOrder.forEach(detalle=>{
      const row=document.createElement('tr');
      row.classList.add('detail-row');
      row.innerHTML=`<td style="padding-left:40px;">${detalle}</td>`;
      tbody.appendChild(row);
    });
    totalRow.addEventListener('click',()=>{
      const collapsed=totalRow.classList.toggle('collapsed');
      let next=totalRow.nextElementSibling;
      while(next&&next.classList.contains('detail-row')){
        next.classList.toggle('hidden',collapsed);
        next=next.nextElementSibling;
      }
    });
  }
  // Pie de tabla (tfoot)
  const tfoot=table.querySelector('tfoot'); tfoot.innerHTML='';
  const footRow=document.createElement('tr');
  const cellLabel=document.createElement('td');
  cellLabel.textContent='Total Anual';
  footRow.appendChild(cellLabel);
  // Totales mensuales simples (sin UF)
  const calc = scenarioData.calculated;
  const totals = (type==='gastos') ? calc.totalGastoProyectadoMes : calc.totalIngresoProyectadoMes;
  totals.forEach(v=>{
    const td=document.createElement('td');
    td.classList.add('number-cell');
    td.textContent=(v||0).toLocaleString(undefined,{minimumFractionDigits:2});
    footRow.appendChild(td);
  });
  tfoot.appendChild(footRow);
}

// ====== Toggle Global ======
function toggleAll(type) {
  const tableId = type==='gastos'?'gastos-detail-table':'ingresos-detail-table';
  document.querySelectorAll(`#${tableId} .rubro-total-row`).forEach(rubroRow=>{
    const collapsed=rubroRow.classList.toggle('collapsed');
    let next=rubroRow.nextElementSibling;
    while(next&&next.classList.contains('detail-row')){
      next.classList.toggle('hidden',collapsed);
      next=next.nextElementSibling;
    }
  });
}

document.addEventListener('DOMContentLoaded',()=>{
  document.getElementById('excel-file-input')?.addEventListener('change',e=>handleFileUpload(e.target.files));
  document.getElementById('toggleGastos')?.addEventListener('click',()=>toggleAll('gastos'));
  document.getElementById('toggleIngresos')?.addEventListener('click',()=>toggleAll('ingresos'));
});

// ====== Helpers de Estado ======
function getCurrentScenarioData(){
  const key=`${appState.currentYear}_Base`;
  if(!appState.scenarios[key]){
    appState.scenarios[key]={data:{gastos:{},ingresos:{}},calculated:{totalGastoProyectadoMes:Array(12).fill(0),totalIngresoProyectadoMes:Array(12).fill(0)}};
  }
  return appState.scenarios[key];
}
function saveState(){localStorage.setItem('expensasState',JSON.stringify(appState));}
function loadState(){try{const s=JSON.parse(localStorage.getItem('expensasState')||'{}');appState=Object.assign(appState,s);}catch{} }
function validateAndSetActiveScenario(){}
