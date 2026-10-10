/**
 * PAS — sincronizzazione del registro IR (questa scheda) verso l'app.
 * Sheet "IR Purchase list", scheda IR. Funzione chiamata ogni ora da un trigger.
 *
 * Proprietà dello script (Progetto → Impostazioni → Proprietà dello script):
 *   SUPABASE_URL  = https://xxlmbliiktiemwdlbcfn.supabase.co
 *   SUPABASE_KEY  = chiave "publishable" del progetto Supabase (Settings → API Keys)
 *   SYNC_TOKEN    = token generato con:  select pas.create_ir_sync_token();
 *
 * Il foglio resta la fonte: l'app riceve solo le righe e crea/aggiorna le richieste "legacy".
 */

var IR_SHEET_ID = 1583820415; // gid della scheda IR
var FIRST_DATA_ROW = 1;       // si legge tutta la scheda: le intestazioni vengono scartate dal filtro sul numero IR
var BATCH = 200;

function syncIrRegister() {
  var props = PropertiesService.getScriptProperties();
  var url = props.getProperty('SUPABASE_URL');
  var key = props.getProperty('SUPABASE_KEY');
  var token = props.getProperty('SYNC_TOKEN');
  if (!url || !key || !token) throw new Error('Mancano SUPABASE_URL / SUPABASE_KEY / SYNC_TOKEN nelle proprietà dello script');

  var sheet = SpreadsheetApp.getActive().getSheets().filter(function (s) {
    return s.getSheetId() === IR_SHEET_ID;
  })[0];
  if (!sheet) throw new Error('Scheda IR non trovata');

  var last = sheet.getLastRow();
  if (last < FIRST_DATA_ROW) return;
  var values = sheet.getRange(FIRST_DATA_ROW, 1, last - FIRST_DATA_ROW + 1, 16).getDisplayValues();

  var rows = [];
  var prevDate = null;
  for (var i = 0; i < values.length; i++) {
    var d = parseDate_(values[i][3]);
    var req = rowToRequest_(values[i], prevDate);
    if (d) prevDate = d;
    if (req) rows.push(req);
  }

  var total = { inserted: 0, updated: 0, skipped: 0 };
  for (var s = 0; s < rows.length; s += BATCH) {
    var res = callRpc_(url, key, token, rows.slice(s, s + BATCH));
    total.inserted += res.inserted;
    total.updated += res.updated;
    total.skipped += res.skipped;
  }
  console.log('Sync IR: ' + rows.length + ' righe inviate → ' + JSON.stringify(total));
}

function callRpc_(url, key, token, rows) {
  // Le chiavi nuove (sb_publishable_...) vanno solo nell'intestazione apikey; la chiave "anon" JWT
  // (eyJ...) può andare anche come Bearer.
  var headers = { apikey: key, 'Content-Profile': 'pas', 'Accept-Profile': 'pas' };
  if (key.indexOf('eyJ') === 0) headers.Authorization = 'Bearer ' + key;
  var resp = UrlFetchApp.fetch(url + '/rest/v1/rpc/sync_ir_register', {
    method: 'post',
    contentType: 'application/json',
    headers: headers,
    payload: JSON.stringify({ p_token: token, p_rows: rows }),
    muteHttpExceptions: true,
  });
  if (resp.getResponseCode() >= 300) {
    throw new Error('Sync fallita (' + resp.getResponseCode() + '): ' + resp.getContentText());
  }
  return JSON.parse(resp.getContentText());
}

// ---- trasformazione riga → richiesta (stessa logica validata sull'import del 26/09) ----

function clean_(s) { return String(s == null ? '' : s).trim(); }
function ws_(s) { return String(s == null ? '' : s).replace(/[\s ]+/g, ' ').trim(); }

function money_(s) {
  var m = clean_(s).replace(/ /g, ' ').match(/-?\d[\d.]*(?:,\d+)?/);
  return m ? parseFloat(m[0].replace(/\./g, '').replace(',', '.')) : null;
}

function parseDate_(s) {
  var m = clean_(s).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  var dd = +m[1], mm = +m[2], yy = +m[3];
  var dt = new Date(Date.UTC(yy, mm - 1, dd));
  if (dt.getUTCFullYear() !== yy || dt.getUTCMonth() !== mm - 1 || dt.getUTCDate() !== dd) return null;
  return yy + '-' + ('0' + mm).slice(-2) + '-' + ('0' + dd).slice(-2);
}

function flag_(s) { return ['x', 'si', 'sì', 'yes', 'true', '1', 'ok'].indexOf(clean_(s).toLowerCase()) >= 0; }

function procFromPrice_(p) {
  if (p <= 200) return 'DIR';
  if (p <= 2500) return 'SQ';
  if (p <= 20000) return '3Q';
  if (p <= 100000) return 'SP';
  return 'TEN';
}

function rowToRequest_(r, prevDate) {
  var ir = clean_(r[0]);
  var description = ws_(r[11]);
  if (!ir || !description) return null;
  if (!/^\d+(_[A-Za-z0-9]+)?$/.test(ir)) return null; // scarta intestazioni e righe non IR

  var proc = null;
  var m = clean_(r[8]).match(/^([A-Z])\)\s*(\S+)/);
  if (m) proc = m[2].toUpperCase();
  else if (['DIR', 'SQ', '3Q', 'SP', 'TEN'].indexOf(clean_(r[8]).toUpperCase()) >= 0) proc = clean_(r[8]).toUpperCase();

  var price = money_(r[9]) || 0;
  if (!proc) proc = procFromPrice_(price);

  var project = clean_(r[6]) || 'NA';
  var notes = [clean_(r[2]), clean_(r[15])].filter(function (n) { return n; });

  return {
    ir: ir,
    project: project,
    budget: clean_(r[7]) || 'NA',
    description: description,
    price: price,
    proc: proc,
    cup: ws_(r[5]) || null,
    supplier: clean_(r[10]) || null,
    coordination: project.toLowerCase() === 'struttura',
    institutional: flag_(r[12]),
    occasional: flag_(r[13]),
    created: parseDate_(r[3]) || prevDate,
    initiator: clean_(r[4]) || null,
    protocol: clean_(r[1]) || null,
    note: notes.join(' | ') || null,
  };
}

/** Eseguire UNA volta: crea il trigger orario. */
function installHourlyTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'syncIrRegister') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('syncIrRegister').timeBased().everyHours(1).create();
}
