// dashboard_domain.gs
// Dashboard / KPI summary.

function getDashboard() {
  var checks = readSheetObjects_(SHEETS.TRX_AM_CHECK);
  var totalOk = 0, totalNg = 0, totalNa = 0;
  for (var i = 0; i < checks.length; i++) {
    totalOk += Number(checks[i].ok_count || 0);
    totalNg += Number(checks[i].ng_count || 0);
    totalNa += Number(checks[i].na_count || 0);
  }

  var findings = readSheetObjects_(SHEETS.TRX_FINDING);
  var openFindings = 0;
  for (var j = 0; j < findings.length; j++) {
    if (String(findings[j].status).toUpperCase() === 'OPEN') openFindings++;
  }

  return {
    ok: true,
    data: {
      total_checks: checks.length,
      total_ok: totalOk,
      total_ng: totalNg,
      total_na: totalNa,
      open_findings: openFindings,
      total_findings: findings.length
    }
  };
}
