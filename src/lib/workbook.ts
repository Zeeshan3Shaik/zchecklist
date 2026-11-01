import type { Checklist } from "./zchecklist";
import { categoryLabel, formatDDMMYY, STATUS_LABEL, summarize } from "./zchecklist";

export async function buildWorkbook(c: Checklist, chart?: string) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "ZChecklist";
  wb.created = new Date();
  const s = summarize(c.statuses);
  const ws = wb.addWorksheet("Checklist Report", { views: [{ state: "frozen", ySplit: 19 }] });
  const rows = [
    ["ZChecklist — Checklist Report"], [], ["Checklist", c.name],
    ["Selected date", formatDDMMYY(c.checklist_date)], ["Category", categoryLabel(c.category)],
    ["Created", new Date(c.created_at).toLocaleString()], ["Updated", new Date(c.updated_at).toLocaleString()],
    ["Completed", c.completed_at ? new Date(c.completed_at).toLocaleString() : "In progress"],
    ["Generated", new Date().toLocaleString()], [], ["Total members", s.total],
    ["Done", s.done.length], ["Not Done", s.notDone.length], ["Absent", s.absent.length], ["Unmarked", s.unmarked.length],
    ["Done / total", s.donePct / 100], ["Marked / total", s.markedPct / 100], [], ["Roll Number", "Status"],
  ];
  rows.forEach((r) => ws.addRow(r));
  for (let i = 0; i < c.member_count; i++) ws.addRow([i + 1, STATUS_LABEL[c.statuses[i] as keyof typeof STATUS_LABEL] ?? "Unmarked"]);
  ws.getCell("B16").numFmt = "0.0%";
  ws.getCell("B17").numFmt = "0.0%";
  ws.autoFilter = `A19:B${19 + c.member_count}`;
  ws.pageSetup = { orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
  const analytics = wb.addWorksheet("Analytics");
  analytics.addRows([["ZChecklist — Status Distribution"], [], ["Status", "Observations", "Of total"],
    ["Done", s.done.length, s.done.length / s.total], ["Not Done", s.notDone.length, s.notDone.length / s.total],
    ["Absent", s.absent.length, s.absent.length / s.total], ["Unmarked", s.unmarked.length, s.unmarked.length / s.total], [],
    ["Done / total", s.donePct / 100], ["Marked / total", s.markedPct / 100]]);
  for (let i = 4; i <= 7; i++) analytics.getCell(`C${i}`).numFmt = "0.0%";
  analytics.getCell("B9").numFmt = "0.0%";
  analytics.getCell("B10").numFmt = "0.0%";
  if (chart) analytics.addImage(wb.addImage({ base64: chart, extension: "png" }), "A12:F28");
  const colors: Record<string, string> = { Done: "FF166534", "Not Done": "FF991B1B", Absent: "FF18181B", Unmarked: "FF475569" };
  for (const sheet of [ws, analytics]) {
    sheet.getColumn(1).width = 29; sheet.getColumn(2).width = 48; sheet.getColumn(3).width = 18;
    sheet.eachRow((row, n) => {
      row.height = 24;
      row.eachCell((cell) => { cell.font = { name: "Calibri", size: 11 }; cell.alignment = { vertical: "middle", wrapText: true }; });
      if (n === 1 || (sheet === ws && n === 19) || (sheet === analytics && n === 3)) {
        row.eachCell((cell) => { cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF6D28D9" } }; cell.font = { name: "Calibri", bold: true, color: { argb: "FFFFFFFF" }, size: n === 1 ? 16 : 12 }; });
      }
      if (sheet === ws && n >= 20) {
        const color = colors[String(row.getCell(2).value)];
        row.getCell(2).font = { name: "Calibri", bold: true, color: { argb: color ?? "FF475569" } };
      }
    });
  }
  return wb;
}