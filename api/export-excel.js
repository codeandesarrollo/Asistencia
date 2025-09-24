// /api/export-excel.js
export const runtime = 'nodejs';
export const maxDuration = 15;

import { readFile, stat } from 'fs/promises';
import path from 'path';

// xlsx-populate es CJS; compat ESM
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

    // === Plantilla ===
    const tplPath = path.join(process.cwd(), 'templates', 'asistencia_template_v2.xlsx');
    try { await stat(tplPath); }
    catch { return res.status(500).send(`TEMPLATE_NOT_FOUND: ${tplPath}`); }

    let wb;
    try {
      const tpl = await readFile(tplPath);
      wb = await XlsxPopulate.fromDataAsync(tpl);
    } catch (e) {
      return res.status(500).send('TEMPLATE_LOAD_FAILED: ' + (e?.message || String(e)));
    }

    try {
      const days = [...allDays].sort();

      // ===== Hoja: Mensual Grupal =====
      const shMensual = wb.sheet('Mensual Grupal');
      shMensual.range('A3:F10000').clear();
      let r = 3;
      for (const d of days) {
        const v = byDay[d] || { A:0, R:0, F:0 };
        const a  = Number(v.A) || 0;
        const rr = Number(v.R) || 0;
        const f  = Number(v.F) || 0;
        const total = a + rr + f;

        shMensual.cell(`A${r}`).value(d);
        shMensual.cell(`B${r}`).value(a);
        shMensual.cell(`C${r}`).value(rr);
        shMensual.cell(`D${r}`).value(f);
        shMensual.cell(`E${r}`).value(total);
        shMensual.cell(`F${r}`).value(total ? a/total : 0).style('numberFormat','0.0%'); // %A del día
        r++;
      }

      // ===== Hoja: Resumen del Mes — % sobre registros (A+R+F) =====
      const shResumen = wb.sheet('Resumen del Mes');

      const alumnosCount   = alumnos.length || 0;
      const diasCalendario = days.length;
      const marcEsperadas  = diasCalendario * alumnosCount;

      const A = Number(monthlyTotals?.A || 0);
      const R = Number(monthlyTotals?.R || 0);
      const F = Number(monthlyTotals?.F || 0);
      const regSum = A + R + F;
      const pctVal = (n) => regSum > 0 ? n / regSum : 0;

      // Cabecera informativa
      shResumen.cell('A2').value('Mes');                   shResumen.cell('B2').value(ym);
      shResumen.cell('A3').value('Escuela');               shResumen.cell('B3').value(sid);
      shResumen.cell('A4').value('Grupo');                 shResumen.cell('B4').value(gid);
      shResumen.cell('A5').value('Alumnos');               shResumen.cell('B5').value(alumnosCount);
      shResumen.cell('A6').value('Días (calendario)');     shResumen.cell('B6').value(diasCalendario);
      shResumen.cell('A7').value('Marcaciones esperadas'); shResumen.cell('B7').value(marcEsperadas);

      shResumen.cell('A8').value('Métrica');
      shResumen.cell('B8').value('Valor');

      // Encabezado del % (por si había celdas combinadas en la banda azul)
      try {
        const hdrRange = shResumen.range('C8:K8');
        hdrRange.merged(false);
        hdrRange.clear();
        shResumen.cell('C8').value('% sobre registros');
        hdrRange.merged(true);
      } catch {
        shResumen.cell('C8').value('% sobre registros');
      }

      // Marca para verificar que esta versión corrió y qué plantilla cargó
      shResumen.cell('E2').value(`TPL: asistencia_template_v2.xlsx • ROUTE:/api/export-excel`);

      // Valores A/R/F
      shResumen.cell('A9').value('A');  shResumen.cell('B9').value(A);
      shResumen.cell('A10').value('R'); shResumen.cell('B10').value(R);
      shResumen.cell('A11').value('F'); shResumen.cell('B11').value(F);

      // C9:C11 (lectura humana, no dependas del gráfico aquí)
      ['C9','C10','C11'].forEach((addr, i) => {
        const val = i === 0 ? pctVal(A) : i === 1 ? pctVal(R) : pctVal(F);
        shResumen.cell(addr).formula(null).value(val).style('numberFormat','0.0%');
      });

      // D9:D11 -> estos son los que debe usar la dona de la plantilla
      shResumen.cell('D8').value('% sobre registros');
      shResumen.cell('D9').value(pctVal(A)).style('numberFormat','0.0%');
      shResumen.cell('D10').value(pctVal(R)).style('numberFormat','0.0%');
      shResumen.cell('D11').value(pctVal(F)).style('numberFormat','0.0%');

      // ===== Hoja: Por Alumno =====
      const shAlu = wb.sheet('Por Alumno');
      shAlu.range('A3:F20000').clear();
      let r2 = 3;
      for (const a of alumnos) {
        const v = (perAlumno || {})[a.id] || { A:0, R:0, F:0 };
        const aA = Number(v.A) || 0;
        const aR = Number(v.R) || 0;
        const aF = Number(v.F) || 0;
        const total = aA + aR + aF;

        shAlu.cell(`A${r2}`).value(a.name || '(sin nombre)');
        shAlu.cell(`B${r2}`).value(aA);
        shAlu.cell(`C${r2}`).value(aR);
        shAlu.cell(`D${r2}`).value(aF);
        shAlu.cell(`E${r2}`).value(total);
        shAlu.cell(`F${r2}`).value(total ? aA/total : 0).style('numberFormat','0.0%'); // %A por alumno
        r2++;
      }

      // Re-cálculo completo al abrir (por si Excel está en cálculo manual)
      wb._node.workbook.calcPr = { $: { calcId: '0', fullCalcOnLoad: '1' } };

    } catch (e) {
      return res.status(500).send('WRITE_SHEETS_FAILED: ' + (e?.message || String(e)));
    }

    try {
      const out = await wb.outputAsync();
      res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Cache-Control', 'no-store'); // evita caché
      res.setHeader('Content-Disposition', `attachment; filename="Asistencia_${sid}_${gid}_${ym}_OA.xlsx"`);
      return res.status(200).send(out);
    } catch (e) {
      return res.status(500).send('WORKBOOK_OUTPUT_FAILED: ' + (e?.message || String(e)));
    }
  } catch (e) {
    return res.status(500).send('UNCAUGHT_ERROR: ' + (e?.message || String(e)));
  }
}
