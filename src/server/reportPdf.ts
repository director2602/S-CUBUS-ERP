import PDFDocument from "pdfkit";

const PLUM = "#400C4D";
const MAUVE = "#75507E";
const EMBER = "#FF8C00";
const INK = "#221126";
const LINE = "#E6DAE9";
const GREEN = "#1F9D55";
const RED = "#B42318";

export function bufferFromDoc(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.end();
  });
}

function header(doc: PDFKit.PDFDocument, title: string, subtitle: string) {
  doc.rect(0, 0, doc.page.width, 90).fill(PLUM);
  doc.fillColor("#ffffff").fontSize(9).font("Helvetica-Bold").text("S-CUBUS CAREER PRIVATE LIMITED", 40, 24, { characterSpacing: 1 });
  doc.fontSize(20).text(title, 40, 40);
  doc.fontSize(10).font("Helvetica").fillColor("#e4d3e8").text(subtitle, 40, 66);
  doc.fillColor(INK);
  doc.y = 110;
}

function sectionTitle(doc: PDFKit.PDFDocument, text: string) {
  doc.moveDown(0.6);
  doc.fontSize(13).font("Helvetica-Bold").fillColor(PLUM).text(text);
  doc.moveTo(40, doc.y + 2).lineTo(doc.page.width - 40, doc.y + 2).strokeColor(LINE).lineWidth(1).stroke();
  doc.moveDown(0.5);
  doc.fillColor(INK).font("Helvetica");
}

function metricRow(doc: PDFKit.PDFDocument, metrics: { label: string; value: string }[]) {
  const startX = 40;
  const colWidth = (doc.page.width - 80) / metrics.length;
  const y = doc.y;
  metrics.forEach((m, i) => {
    const x = startX + i * colWidth;
    doc.fontSize(15).font("Helvetica-Bold").fillColor(PLUM).text(m.value, x, y, { width: colWidth - 10 });
    doc.fontSize(8).font("Helvetica").fillColor(MAUVE).text(m.label.toUpperCase(), x, y + 20, { width: colWidth - 10, characterSpacing: 0.3 });
  });
  doc.y = y + 42;
}

function simpleTable(
  doc: PDFKit.PDFDocument,
  headers: string[],
  rows: (string | number)[][],
  colWidths?: number[]
) {
  const startX = 40;
  const tableWidth = doc.page.width - 80;
  const widths = colWidths ?? headers.map(() => tableWidth / headers.length);
  let y = doc.y;

  doc.rect(startX, y, tableWidth, 18).fill("#F7F2F8");
  doc.fontSize(8).font("Helvetica-Bold").fillColor(MAUVE);
  let x = startX;
  headers.forEach((h, i) => {
    doc.text(h.toUpperCase(), x + 6, y + 5, { width: widths[i] - 10 });
    x += widths[i];
  });
  y += 18;

  doc.font("Helvetica").fontSize(9).fillColor(INK);
  for (const row of rows) {
    if (y > doc.page.height - 80) {
      doc.addPage();
      y = 50;
    }
    x = startX;
    row.forEach((cell, i) => {
      doc.text(String(cell), x + 6, y + 5, { width: widths[i] - 10 });
      x += widths[i];
    });
    doc.moveTo(startX, y + 20).lineTo(startX + tableWidth, y + 20).strokeColor(LINE).lineWidth(0.5).stroke();
    y += 20;
  }
  doc.y = y + 8;
}

/** Simple horizontal bar chart drawn with primitives (no external chart lib needed in PDF). */
function barChart(
  doc: PDFKit.PDFDocument,
  data: { label: string; value: number; maxValue: number; color?: string }[]
) {
  const startX = 140;
  const barMaxWidth = doc.page.width - 80 - 140;
  let y = doc.y;
  for (const d of data) {
    if (y > doc.page.height - 60) {
      doc.addPage();
      y = 50;
    }
    doc.fontSize(9).fillColor(INK).text(d.label, 40, y + 2, { width: 95 });
    const w = d.maxValue > 0 ? Math.max(2, (d.value / d.maxValue) * barMaxWidth) : 0;
    doc.rect(startX, y, barMaxWidth, 12).fill("#F1EAF3");
    doc.rect(startX, y, w, 12).fill(d.color ?? EMBER);
    doc.fontSize(8).fillColor(MAUVE).text(`${d.value}%`, startX + barMaxWidth + 6, y + 2);
    y += 22;
  }
  doc.y = y + 6;
}

export interface StudentReportData {
  studentName: string;
  scid: string | null;
  sathiiKey: string | null;
  examName: string;
  total: number;
  percentage: number;
  rank: number | null;
  percentile: number | null;
  subjects: { name: string; marks: number; maxMarks: number }[];
  previousResult: { examName: string; total: number; percentage: number } | null;
  cohort: { classAvg: number | null; batchAvg: number | null; cohortAvg: number | null; topper: number | null };
  questionSummary: { correctCount: number; wrongCount: number; unattemptedCount: number; accuracy: number } | null;
  chapterStats: { chapter: string; accuracy: number }[];
  scholarship: {
    category: string;
    percentage: number;
    tuitionFee: number;
    scholarshipAmount: number;
    netTuitionFee: number;
    explanation: string;
  } | null;
  generatedAt: string;
}

export function buildStudentReportPdf(data: StudentReportData): PDFKit.PDFDocument {
  const doc = new PDFDocument({ size: "A4", margin: 40, bufferPages: true });

  header(doc, "Student Performance Report", `${data.examName} · Generated ${data.generatedAt}`);

  doc.fontSize(16).font("Helvetica-Bold").fillColor(INK).text(data.studentName);
  doc.fontSize(9).font("Helvetica").fillColor(MAUVE);
  const idBits = [data.scid ? `SCID: ${data.scid}` : null, data.sathiiKey ? `SATHII KEY: ${data.sathiiKey}` : null]
    .filter(Boolean)
    .join("   ·   ");
  if (idBits) doc.text(idBits);
  doc.moveDown(0.8);

  sectionTitle(doc, "Result Summary");
  metricRow(doc, [
    { label: "Total Marks", value: String(data.total) },
    { label: "Percentage", value: `${data.percentage}%` },
    { label: "Rank", value: data.rank !== null ? String(data.rank) : "—" },
    { label: "Percentile", value: data.percentile !== null ? String(data.percentile) : "—" },
  ]);

  sectionTitle(doc, "Subject-wise Marks");
  simpleTable(
    doc,
    ["Subject", "Marks", "Max", "%"],
    data.subjects.map((s) => [s.name, s.marks, s.maxMarks, s.maxMarks > 0 ? `${((s.marks / s.maxMarks) * 100).toFixed(1)}%` : "—"])
  );

  if (data.previousResult) {
    sectionTitle(doc, "Current vs Previous");
    const delta = data.total - data.previousResult.total;
    metricRow(doc, [
      { label: "Previous Exam", value: data.previousResult.examName },
      { label: "Previous Total", value: String(data.previousResult.total) },
      { label: "Change", value: `${delta >= 0 ? "+" : ""}${delta}` },
    ]);
  }

  sectionTitle(doc, "Student vs Cohort");
  const cohortMetrics = [{ label: "This Student", value: String(data.total) }];
  if (data.cohort.classAvg !== null) cohortMetrics.push({ label: "Class Avg", value: data.cohort.classAvg.toFixed(1) });
  if (data.cohort.batchAvg !== null) cohortMetrics.push({ label: "Batch Avg", value: data.cohort.batchAvg.toFixed(1) });
  if (data.cohort.cohortAvg !== null) cohortMetrics.push({ label: "Cohort Avg", value: data.cohort.cohortAvg.toFixed(1) });
  if (data.cohort.topper !== null) cohortMetrics.push({ label: "Topper", value: String(data.cohort.topper) });
  metricRow(doc, cohortMetrics);

  if (data.questionSummary) {
    sectionTitle(doc, "Question-wise Performance");
    metricRow(doc, [
      { label: "Correct", value: String(data.questionSummary.correctCount) },
      { label: "Wrong", value: String(data.questionSummary.wrongCount) },
      { label: "Unattempted", value: String(data.questionSummary.unattemptedCount) },
      { label: "Accuracy", value: `${data.questionSummary.accuracy}%` },
    ]);
  }

  if (data.chapterStats.length > 0) {
    sectionTitle(doc, "Chapter-wise Accuracy");
    barChart(
      doc,
      data.chapterStats.map((c) => ({
        label: c.chapter.length > 18 ? c.chapter.slice(0, 17) + "…" : c.chapter,
        value: c.accuracy,
        maxValue: 100,
        color: c.accuracy >= 60 ? GREEN : c.accuracy >= 35 ? EMBER : RED,
      }))
    );
  }

  if (data.scholarship) {
    sectionTitle(doc, "Scholarship");
    doc.fontSize(11).font("Helvetica-Bold").fillColor(PLUM).text(data.scholarship.category.replace(/_/g, " "));
    doc.moveDown(0.3);
    metricRow(doc, [
      { label: "Scholarship", value: `${data.scholarship.percentage}%` },
      { label: "Tuition Fee", value: `Rs. ${data.scholarship.tuitionFee.toLocaleString("en-IN")}` },
      { label: "Scholarship Amount", value: `Rs. ${data.scholarship.scholarshipAmount.toLocaleString("en-IN")}` },
      { label: "Payable", value: `Rs. ${data.scholarship.netTuitionFee.toLocaleString("en-IN")}` },
    ]);
    doc.fontSize(8).font("Helvetica").fillColor(MAUVE).text(data.scholarship.explanation, { width: doc.page.width - 80 });
  }

  doc.fontSize(7).fillColor(MAUVE).text(
    "S-CUBUS CAREER PRIVATE LIMITED — Examination Result & Analytics ERP",
    40,
    doc.page.height - 40,
    { width: doc.page.width - 80, align: "center" }
  );

  return doc;
}
