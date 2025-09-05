
// /api/export-excel.js
export const runtime = 'nodejs';
export const maxDuration = 15;

import { readFile, stat } from 'fs/promises';
import path from 'path';

// xlsx-populate es CJS; compat ESM:
import XlsxPopulateDefault from 'xlsx-populate';
const XlsxPopulate = XlsxPopulateDefault?.default || XlsxPopulateDefault;

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

export default async function handler(req, res) {
  try {
    cors(res);

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method === 'GET') return res.status(200).send('export-excel ok'); // healthcheck

    if (req.method !== 'POST') return res.status(405).send('METHOD_NOT_ALLOWED');

    const { sid, gid, ym, alumnos, allDays, byDay, monthlyTotals, perAlumno } = req.body || {};
    if (!sid || !gid || !ym) return res.status(400).send('BAD_REQUEST: faltan sid/gid/ym');
    if (!Array.isArray(alumnos) || !Array.isArray(allDays) || !byDay || !monthlyTotals || !perAlumno) {
      return res.status(400).send('BAD_REQUEST: estructura de datos inválida');
    }

    // Plantilla
    const tplPath = path.join(process.cwd(), 'templates', 'asistencia_template.xlsx');
    try { await stat(tplPath); }
    catch { return res.status(500).send(`TEMPLATE_NOT_FOUND: ${tplPath}`); }

    let wb;
    try {
      const tpl = await readFile(tplPath);
      wb = await XlsxPopulate.fromDataAsync(tpl);
    } catch (e) {
      return res.status(500).send('TEMPLATE_LOAD_FAILED: ' + (e?.message || String(e)));
    }

    // Escribir hojas
    try {
      const days = [...allDays].sort();

      const shMensual = wb.sheet('Mensual Grupal');
      shMensual.range('A3:F10000').clear();
      let r = 3;
      for (const d of days) {
        const v = byDay[d] || {A:0,R:0,F:0};
        const total = (v.A||0)+(v.R||0)+(v.F||0);
        shMensual.cell(`A${r}`).value(d);
        shMensual.cell(`B${r}`).value(v.A||0);
        shMensual.cell(`C${r}`).value(v.R||0);
        shMensual.cell(`D${r}`).value(v.F||0);
        shMensual.cell(`E${r}`).value(total);
        shMensual.cell(`F${r}`).value(total ? (v.A||0)/total : 0).style('numberFormat','0.0%');
        r++;
      }

      const shResumen = wb.sheet('Resumen del Mes');
      const marc = days.length * (alumnos.length || 0);
      shResumen.cell('A2').value('Mes');                   shResumen.cell('B2').value(ym);
      shResumen.cell('A3').value('Escuela');               shResumen.cell('B3').value(sid);
      shResumen.cell('A4').value('Grupo');                 shResumen.cell('B4').value(gid);
      shResumen.cell('A5').value('Alumnos');               shResumen.cell('B5').value(alumnos.length);
      shResumen.cell('A6').value('Días (calendario)');     shResumen.cell('B6').value(days.length);
      shResumen.cell('A7').value('Marcaciones esperadas'); shResumen.cell('B7').value(marc);
      shResumen.cell('A8').value('Métrica');               shResumen.cell('B8').value('Valor');
      shResumen.cell('C8').value('% sobre marcaciones');
      shResumen.cell('A9').value('A');  shResumen.cell('B9').value(monthlyTotals.A||0);
      shResumen.cell('C9').value(marc ? (monthlyTotals.A||0)/marc : 0).style('numberFormat','0.0%');
      shResumen.cell('A10').value('R'); shResumen.cell('B10').value(monthlyTotals.R||0);
      shResumen.cell('C10').value(marc ? (monthlyTotals.R||0)/marc : 0).style('numberFormat','0.0%');
      shResumen.cell('A11').value('F'); shResumen.cell('B11').value(monthlyTotals.F||0);
      shResumen.cell('C11').value(marc ? (monthlyTotals.F||0)/marc : 0).style('numberFormat','0.0%');

      const shAlu = wb.sheet('Por Alumno');
      shAlu.range('A3:F20000').clear();
      let r2 = 3;
      for (const a of alumnos) {
        const v = (perAlumno||{})[a.id] || {A:0,R:0,F:0};
        const total = (v.A||0)+(v.R||0)+(v.F||0);
        shAlu.cell(`A${r2}`).value(a.name || '(sin nombre)');
        shAlu.cell(`B${r2}`).value(v.A||0);
        shAlu.cell(`C${r2}`).value(v.R||0);
        shAlu.cell(`D${r2}`).value(v.F||0);
        shAlu.cell(`E${r2}`).value(total);
        shAlu.cell(`F${r2}`).value(total ? (v.A||0)/total : 0).style('numberFormat','0.0%');
        r2++;
      }
    } catch (e) {
      return res.status(500).send('WRITE_SHEETS_FAILED: ' + (e?.message || String(e)));
    }

    try {
      const out = await wb.outputAsync();
      res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="Asistencia_${sid}_${gid}_${ym}.xlsx"`);
      return res.status(200).send(out);
    } catch (e) {
      return res.status(500).send('WORKBOOK_OUTPUT_FAILED: ' + (e?.message || String(e)));
    }
  } catch (e) {
    return res.status(500).send('UNCAUGHT_ERROR: ' + (e?.message || String(e)));
  }
}
