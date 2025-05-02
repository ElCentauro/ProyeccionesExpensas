
// ================== Estado global ==================
const appState = {
  activeScenarioKey: '2025_Base',
  scenarios: {
    '2025_Base': {
      year: 2025,
      scenarioName: 'Base',
      data: { gastos: {} },       // rubro -> [12 números]
      indicesConfig: {}           // rubro -> mes -> %
    }
  }
};

// ----- Cargar estado desde LocalStorage -----
try{
  const stored = localStorage.getItem('appState');
  if(stored){
    Object.assign(appState, JSON.parse(stored));
    console.log('[DEBUG] appState restaurado');
  }
}catch(e){console.warn('No LS',e);}

// ======= Persistencia helper =======
function persistAppState(){
  try{ localStorage.setItem('appState', JSON.stringify(appState)); }
  catch(e){ console.warn('Persist fail',e); }
}

// ============ Excel Upload ==========
document.getElementById('btnUploadExcel').onclick = ()=> document.getElementById('fileExcel').click();
document.getElementById('fileExcel').onchange = handleExcel;

function handleExcel(e){
  const file = e.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = ev=>{
    try{
      const wb = XLSX.read(ev.target.result, {type:'binary'});
      processWorkbook(wb);
      persistAppState();
      recalculateProjectedExpenses();
      renderDashboard();
    }catch(err){alert('Error procesando archivo Excel: '+err.message);}
  };
  reader.readAsBinaryString(file);
}

function processWorkbook(wb){
  // demo: asumimos hoja1 con rubro en A, ene..dic en B..M
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, {header:1,blankrows:false});
  const esc = appState.scenarios[appState.activeScenarioKey];
  esc.data.gastos = {};
  rows.slice(1).forEach(r=>{
    const rubro = r[0];
    if(!rubro) return;
    esc.data.gastos[rubro] = Array.from({length:12},(_,i)=> +r[i+1]||0);
  });
  console.log('[DEBUG] gastos cargados', esc.data.gastos);
}

// ========== Configuración de índices ==========
const modal = document.getElementById('configModal');
document.getElementById('btnOpenConfig').onclick = ()=>{
  fillConfigTable();
  modal.classList.remove('hidden');
};
document.getElementById('btnCloseConfig').onclick = ()=> modal.classList.add('hidden');

function fillConfigTable(){
  const tbody = document.querySelector('#tblIndices tbody');
  tbody.innerHTML = '';
  const esc = appState.scenarios[appState.activeScenarioKey];
  Object.keys(esc.data.gastos).forEach(rubro=>{
    const tr = document.createElement('tr');
    const tdR = document.createElement('td'); tdR.textContent = rubro; tr.appendChild(tdR);
    for(let m=0;m<12;m++){
      const td = document.createElement('td');
      const inp = document.createElement('input'); inp.type='number'; inp.style.width='60px';
      inp.value = esc.indicesConfig?.[rubro]?.[m] ?? '';
      td.appendChild(inp); tr.appendChild(td);
    }
    tbody.appendChild(tr);
  });
}

document.getElementById('btnSaveConfig').onclick = ()=>{
  const esc = appState.scenarios[appState.activeScenarioKey];
  esc.indicesConfig = {};
  document.querySelectorAll('#tblIndices tbody tr').forEach(tr=>{
    const rubro = tr.cells[0].textContent.trim();
    esc.indicesConfig[rubro] = {};
    [...tr.querySelectorAll('input')].forEach((inp,i)=>{
      esc.indicesConfig[rubro][i]= parseFloat(inp.value)||0;
    });
  });
  persistAppState();
  recalculateProjectedExpenses();
  renderDashboard();
  modal.classList.add('hidden');
};

// ======= Proyección de gastos =========
function recalculateProjectedExpenses(){
  const esc = appState.scenarios[appState.activeScenarioKey];
  const gastos = esc.data.gastos;
  const idx = esc.indicesConfig;
  Object.keys(gastos).forEach(rubro=>{
    const vals = gastos[rubro];
    // último mes real
    let lastReal = -1;
    vals.forEach((v,i)=>{ if(v) lastReal=i; });
    if(lastReal<0) return;
    for(let m=lastReal+1;m<12;m++){
      const factor = 1 + ((idx?.[rubro]?.[m]||0)/100);
      vals[m] = Math.round(vals[m-1]*factor*100)/100;
    }
  });
  console.log('[DEBUG] proyección OK', gastos);
  persistAppState();
}

// ========= Render Dashboard =========
function renderDashboard(){
  const esc = appState.scenarios[appState.activeScenarioKey];
  const tbl = document.getElementById('tblGastos');
  const thead = tbl.querySelector('thead');
  const tbody = tbl.querySelector('tbody');
  thead.innerHTML = '<tr><th>Rubro</th>'+['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'].map(m=>'<th>'+m+'</th>').join('')+'</tr>';
  tbody.innerHTML = '';
  Object.entries(esc.data.gastos).forEach(([rubro,vals])=>{
    const tr = document.createElement('tr');
    tr.className = 'proj-row';
    const tdR = document.createElement('td'); tdR.textContent=rubro; tr.appendChild(tdR);
    vals.forEach((v,i)=>{
      const td=document.createElement('td'); td.textContent=v? v.toLocaleString('es-AR',{minimumFractionDigits:2}):'';
      if(i<=2) tr.className='real-row'; // enero-marzo reales (demo)
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
}
renderDashboard(); // inicial

// ======= Botones Backup LS =======
(function(){
  const bar=document.getElementById('toolsBar');
  const btnExp=document.createElement('button'); btnExp.textContent='⬇️'; btnExp.title='Exportar Backup';
  const btnImp=document.createElement('button'); btnImp.textContent='⬆️'; btnImp.title='Importar Backup';
  const inp = document.createElement('input'); inp.type='file'; inp.accept='.json'; inp.style.display='none';

  btnExp.onclick=()=>{
    const data={}; for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);data[k]=localStorage.getItem(k);}
    const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url;a.download='localStorageBackup.json';a.click();URL.revokeObjectURL(url);
  };
  btnImp.onclick=()=>inp.click();
  inp.onchange=e=>{
    const f=e.target.files[0]; if(!f)return;
    const r=new FileReader(); r.onload=ev=>{
      try{const obj=JSON.parse(ev.target.result); Object.entries(obj).forEach(([k,v])=>localStorage.setItem(k,v)); alert('Backup importado. Recarga la página.');}
      catch(err){alert('Backup inválido');}
    }; r.readAsText(f);
  };
  bar.append(btnExp,btnImp,inp);
})();
