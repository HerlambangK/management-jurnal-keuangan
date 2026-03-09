import { Transaction } from "@/interfaces/IDashboard";

const toSafeText = (value: unknown): string => {
  if (typeof value !== "string") return "";
  return value.trim();
};

const toExportDate = (value: string): string => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";

  return parsed.toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
};

const formatAmount = (value: unknown): string => {
  const parsed = Number(value);
  const safeValue = Number.isFinite(parsed) ? parsed : 0;

  return new Intl.NumberFormat("id-ID").format(safeValue);
};

const getDownloadDateTime = (): string =>
  new Date().toLocaleString("id-ID", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

const makeFileName = (prefix: string, extension: string): string => {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `${prefix}-${stamp}.${extension}`;
};

const downloadBlob = (blob: Blob, fileName: string) => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
};

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const toAscii = (value: string): string =>
  value
    .normalize("NFKD")
    .replace(/[^\x20-\x7E]/g, "")
    .trim();

const escapePdfText = (value: string): string => value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");

const truncate = (value: string, maxLength: number): string =>
  value.length > maxLength ? `${value.slice(0, Math.max(0, maxLength - 1))}~` : value;

const padRight = (value: string, width: number): string => {
  const clipped = truncate(value, width);
  return clipped.padEnd(width, " ");
};

const padLeft = (value: string, width: number): string => {
  const clipped = truncate(value, width);
  return clipped.padStart(width, " ");
};

const buildPdfStream = (lines: string[]): string => {
  const startY = 806;
  const lineHeight = 14;

  let stream = "BT\n/F1 10 Tf\n";
  stream += `40 ${startY} Td\n`;

  lines.forEach((line, index) => {
    if (index > 0) {
      stream += `0 -${lineHeight} Td\n`;
    }
    stream += `(${escapePdfText(line)}) Tj\n`;
  });

  stream += "ET";
  return stream;
};

const buildSimplePdf = (pages: string[][]): Blob => {
  const safePages = pages.length > 0 ? pages : [["Laporan transaksi kosong"]];
  const pageCount = safePages.length;
  const objects: Array<{ id: number; content: string }> = [];
  const kids: string[] = [];

  objects.push({
    id: 1,
    content: "<< /Type /Catalog /Pages 2 0 R >>",
  });

  objects.push({
    id: 3,
    content: "<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>",
  });

  for (let index = 0; index < pageCount; index += 1) {
    const pageObjectId = 4 + index * 2;
    const contentObjectId = pageObjectId + 1;
    const stream = buildPdfStream(safePages[index]);

    kids.push(`${pageObjectId} 0 R`);
    objects.push({
      id: contentObjectId,
      content: `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    });
    objects.push({
      id: pageObjectId,
      content: `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentObjectId} 0 R >>`,
    });
  }

  objects.push({
    id: 2,
    content: `<< /Type /Pages /Count ${pageCount} /Kids [${kids.join(" ")}] >>`,
  });

  objects.sort((a, b) => a.id - b.id);

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [0];

  for (const object of objects) {
    offsets[object.id] = pdf.length;
    pdf += `${object.id} 0 obj\n${object.content}\nendobj\n`;
  }

  const xrefOffset = pdf.length;
  const objectCount = objects[objects.length - 1]?.id || 0;

  pdf += `xref\n0 ${objectCount + 1}\n`;
  pdf += "0000000000 65535 f \n";

  for (let objectId = 1; objectId <= objectCount; objectId += 1) {
    const offset = offsets[objectId] || 0;
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }

  pdf += `trailer\n<< /Size ${objectCount + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return new Blob([new TextEncoder().encode(pdf)], { type: "application/pdf" });
};

const buildExportRows = (transactions: Transaction[]) =>
  transactions.map((tx, index) => {
    const typeLabel = tx.type === "income" ? "Pemasukan" : "Pengeluaran";
    return {
      no: String(index + 1),
      date: toExportDate(tx.date),
      type: typeLabel,
      category: toSafeText(tx.category?.name) || "-",
      amount: formatAmount(tx.amount),
      note: toSafeText(tx.note) || "-",
    };
  });

export const downloadTransactionExcel = (transactions: Transaction[], periodLabel: string) => {
  const rows = buildExportRows(transactions);
  const htmlRows = rows
    .map(
      (row) =>
        `<tr>
          <td>${escapeHtml(row.no)}</td>
          <td>${escapeHtml(row.date)}</td>
          <td>${escapeHtml(row.type)}</td>
          <td>${escapeHtml(row.category)}</td>
          <td>${escapeHtml(row.amount)}</td>
          <td>${escapeHtml(row.note)}</td>
        </tr>`
    )
    .join("");

  const html = `<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8" />
    <style>
      body { font-family: Arial, sans-serif; font-size: 12px; color: #111827; }
      h1 { margin: 0 0 6px; font-size: 16px; }
      p { margin: 0 0 6px; color: #475569; }
      table { border-collapse: collapse; width: 100%; margin-top: 10px; }
      th, td { border: 1px solid #d1d5db; padding: 6px; text-align: left; }
      th { background: #e2e8f0; }
    </style>
  </head>
  <body>
    <h1>Laporan Transaksi</h1>
    <p>Periode: ${escapeHtml(periodLabel)}</p>
    <p>Dicetak: ${escapeHtml(getDownloadDateTime())}</p>
    <table>
      <thead>
        <tr>
          <th>No</th>
          <th>Tanggal</th>
          <th>Tipe</th>
          <th>Kategori</th>
          <th>Nominal (Rp)</th>
          <th>Catatan</th>
        </tr>
      </thead>
      <tbody>
        ${htmlRows}
      </tbody>
    </table>
  </body>
</html>`;

  const blob = new Blob([html], { type: "application/vnd.ms-excel;charset=utf-8;" });
  downloadBlob(blob, makeFileName("laporan-transaksi", "xls"));
};

export const downloadTransactionPdf = (transactions: Transaction[], periodLabel: string) => {
  const rows = buildExportRows(transactions);
  const header = [
    "LAPORAN TRANSAKSI",
    `Periode: ${periodLabel}`,
    `Dicetak: ${getDownloadDateTime()}`,
    "",
    `${padRight("No", 4)}${padRight("Tanggal", 12)}${padRight("Tipe", 12)}${padRight("Kategori", 20)}${padLeft("Nominal", 14)}  Catatan`,
    `${"-".repeat(4)}${"-".repeat(12)}${"-".repeat(12)}${"-".repeat(20)}${"-".repeat(14)}  ${"-".repeat(32)}`,
  ];

  const body = rows.map((row) =>
    `${padRight(toAscii(row.no), 4)}${padRight(toAscii(row.date), 12)}${padRight(toAscii(row.type), 12)}${padRight(toAscii(row.category), 20)}${padLeft(toAscii(row.amount), 14)}  ${padRight(toAscii(row.note), 32)}`
  );

  const lines = [...header, ...body];
  const linesPerPage = 48;
  const pages: string[][] = [];

  for (let index = 0; index < lines.length; index += linesPerPage) {
    pages.push(lines.slice(index, index + linesPerPage));
  }

  const pdfBlob = buildSimplePdf(pages);
  downloadBlob(pdfBlob, makeFileName("laporan-transaksi", "pdf"));
};

