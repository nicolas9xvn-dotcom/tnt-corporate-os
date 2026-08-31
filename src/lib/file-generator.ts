import path from "node:path";
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import { Document, Packer, Paragraph, HeadingLevel, Table, TableRow, TableCell, TextRun } from "docx";

// Lets an agent hand back a real downloadable file (Excel/PDF/Word) instead
// of only plain chat text — see the generate_file tool in agent-runner.ts.
// The agent always writes plain Markdown (headings, paragraphs, pipe
// tables) since that's what LLMs produce reliably; parseMarkdown below is
// the ONE shared parser all three format generators build from, so the
// model never has to know anything about xlsx/pdf/docx internals.
export type FileFormat = "xlsx" | "pdf" | "docx";

export const FILE_FORMAT_EXTENSIONS: Record<FileFormat, string> = {
  xlsx: "xlsx",
  pdf: "pdf",
  docx: "docx",
};

export const FILE_FORMAT_MIME_TYPES: Record<FileFormat, string> = {
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

type Block =
  | { type: "heading"; level: number; text: string }
  | { type: "paragraph"; text: string }
  | { type: "table"; headers: string[]; rows: string[][] };

const TABLE_ROW_RE = /^\|.*\|$/;
const TABLE_SEPARATOR_RE = /^\|?[\s:-]+\|[\s:|-]*$/;

function splitTableRow(line: string): string[] {
  const trimmed = line.trim();
  const inner = trimmed.startsWith("|") && trimmed.endsWith("|") ? trimmed.slice(1, -1) : trimmed;
  return inner.split("|").map((cell) => cell.trim());
}

export function parseMarkdown(content: string): Block[] {
  const lines = content.split(/\r?\n/);
  const blocks: Block[] = [];
  let paragraphBuffer: string[] = [];

  function flushParagraph() {
    const text = paragraphBuffer.join(" ").trim();
    if (text) blocks.push({ type: "paragraph", text });
    paragraphBuffer = [];
  }

  let i = 0;
  while (i < lines.length) {
    const trimmed = lines[i].trim();

    const headingMatch = trimmed.match(/^(#{1,3})\s+(.*)$/);
    if (headingMatch) {
      flushParagraph();
      blocks.push({ type: "heading", level: headingMatch[1].length, text: headingMatch[2].trim() });
      i++;
      continue;
    }

    if (TABLE_ROW_RE.test(trimmed) && i + 1 < lines.length && TABLE_SEPARATOR_RE.test(lines[i + 1].trim())) {
      flushParagraph();
      const headers = splitTableRow(trimmed);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && TABLE_ROW_RE.test(lines[i].trim())) {
        rows.push(splitTableRow(lines[i]));
        i++;
      }
      blocks.push({ type: "table", headers, rows });
      continue;
    }

    if (trimmed === "") {
      flushParagraph();
      i++;
      continue;
    }

    paragraphBuffer.push(trimmed);
    i++;
  }
  flushParagraph();
  return blocks;
}

function cellToValue(cell: string): string | number {
  const normalized = cell.replace(/[,\s]/g, "");
  if (normalized !== "" && /^-?\d+(\.\d+)?%?$/.test(normalized)) {
    const num = Number(normalized.replace("%", ""));
    if (!Number.isNaN(num)) return num;
  }
  return cell;
}

async function generateXlsx(title: string, blocks: Block[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet((title || "Sheet1").slice(0, 31));
  let row = 1;

  for (const block of blocks) {
    if (block.type === "heading") {
      const cell = sheet.getCell(row, 1);
      cell.value = block.text;
      cell.font = { bold: true, size: block.level === 1 ? 14 : 12 };
      row += 2;
    } else if (block.type === "paragraph") {
      sheet.getCell(row, 1).value = block.text;
      row += 2;
    } else if (block.type === "table") {
      const headerRow = sheet.getRow(row);
      block.headers.forEach((h, idx) => {
        const cell = headerRow.getCell(idx + 1);
        cell.value = h;
        cell.font = { bold: true };
      });
      row += 1;
      for (const dataCells of block.rows) {
        const dataRow = sheet.getRow(row);
        dataCells.forEach((c, idx) => {
          dataRow.getCell(idx + 1).value = cellToValue(c);
        });
        row += 1;
      }
      row += 1;
    }
  }

  sheet.columns.forEach((col) => {
    col.width = 26;
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

// DejaVu Sans is bundled as a plain, un-subsetted TTF that covers Vietnamese
// diacritics in full — unlike most "Vietnamese subset" webfont packages
// (e.g. @fontsource's), which are split by Google's browser unicode-range
// strategy and are missing plain ASCII letters on their own, producing
// blank glyph boxes for ordinary text. Verified by rendering a test PDF to
// an image before choosing this font.
const PDF_FONT_REGULAR = path.join(process.cwd(), "node_modules/dejavu-fonts-ttf/ttf/DejaVuSans.ttf");
const PDF_FONT_BOLD = path.join(process.cwd(), "node_modules/dejavu-fonts-ttf/ttf/DejaVuSans-Bold.ttf");

function generatePdf(title: string, blocks: Block[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.registerFont("body", PDF_FONT_REGULAR);
    doc.registerFont("body-bold", PDF_FONT_BOLD);

    if (title) {
      doc.font("body-bold").fontSize(18).text(title);
      doc.moveDown();
    }

    for (const block of blocks) {
      if (block.type === "heading") {
        doc.moveDown(0.4);
        doc.font("body-bold").fontSize(block.level === 1 ? 15 : 13).text(block.text);
        doc.moveDown(0.2);
      } else if (block.type === "paragraph") {
        doc.font("body").fontSize(11).text(block.text);
        doc.moveDown(0.3);
      } else if (block.type === "table") {
        doc.moveDown(0.2);
        const colWidth = (doc.page.width - doc.page.margins.left - doc.page.margins.right) / block.headers.length;
        const startX = doc.page.margins.left;
        let y = doc.y;

        doc.font("body-bold").fontSize(10);
        block.headers.forEach((h, idx) => doc.text(h, startX + idx * colWidth, y, { width: colWidth }));
        y += 18;

        doc.font("body").fontSize(10);
        for (const dataCells of block.rows) {
          if (y > doc.page.height - doc.page.margins.bottom - 20) {
            doc.addPage();
            y = doc.page.margins.top;
          }
          dataCells.forEach((c, idx) => doc.text(c, startX + idx * colWidth, y, { width: colWidth }));
          y += 18;
        }
        doc.x = startX;
        doc.y = y + 10;
      }
    }

    doc.end();
  });
}

async function generateDocx(title: string, blocks: Block[]): Promise<Buffer> {
  const children: (Paragraph | Table)[] = [];

  if (title) {
    children.push(new Paragraph({ text: title, heading: HeadingLevel.TITLE }));
  }

  const headingLevels = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3];

  for (const block of blocks) {
    if (block.type === "heading") {
      children.push(new Paragraph({ text: block.text, heading: headingLevels[block.level - 1] ?? HeadingLevel.HEADING_3 }));
    } else if (block.type === "paragraph") {
      children.push(new Paragraph({ children: [new TextRun(block.text)] }));
    } else if (block.type === "table") {
      const headerRow = new TableRow({
        children: block.headers.map(
          (h) => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: h, bold: true })] })] })
        ),
      });
      const dataRows = block.rows.map(
        (r) =>
          new TableRow({
            children: r.map((c) => new TableCell({ children: [new Paragraph(c)] })),
          })
      );
      children.push(new Table({ rows: [headerRow, ...dataRows] }));
      children.push(new Paragraph({ text: "" }));
    }
  }

  const doc = new Document({ sections: [{ children }] });
  return Packer.toBuffer(doc);
}

export async function generateFile(format: FileFormat, title: string, markdownContent: string): Promise<Buffer> {
  const blocks = parseMarkdown(markdownContent);
  switch (format) {
    case "xlsx":
      return generateXlsx(title, blocks);
    case "pdf":
      return generatePdf(title, blocks);
    case "docx":
      return generateDocx(title, blocks);
  }
}
