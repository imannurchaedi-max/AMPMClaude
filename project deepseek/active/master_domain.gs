// master_domain.gs
// Read master data: MST_MACHINE, MST_STATION, MST_AM_TASK.

var LIST_SHEETS = {
  machine: SHEETS.MST_MACHINE,
  station: SHEETS.MST_STATION,
  task: SHEETS.MST_AM_TASK,
  user: SHEETS.MST_USER
};

function getList(type) {
  var name = LIST_SHEETS[type];
  if (!name) return { ok: false, error: 'Unknown type: ' + type };
  return { ok: true, type: type, data: readSheetObjects_(name) };
}

function getTasks(line, machineId, station, frequency) {
  var tasks = readSheetObjects_(SHEETS.MST_AM_TASK);
  var out = [];
  for (var i = 0; i < tasks.length; i++) {
    var t = tasks[i];
    if (String(t.active).toUpperCase() === 'FALSE') continue;
    if (frequency && String(t.frequency) !== String(frequency)) continue;
    if (line && String(t.line).toUpperCase() !== String(line).toUpperCase()) continue;
    if (machineId && String(t.machines || '').indexOf(String(machineId)) < 0) continue;
    if (station) {
      var st = String(t.station || '');
      var sts = String(t.stations || '');
      if (st !== String(station) && sts.indexOf(String(station)) < 0) continue;
    }
    out.push(t);
  }
  return { ok: true, data: out };
}
