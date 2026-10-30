// A letöltött irat szövege a cég- és határidő-felismeréshez. PDF-ből és
// szöveges fájlokból (xml, txt, html) olvasunk; a többit (aláírás,
// titkosított ÁNYK-csomag) kihagyjuk. A szkennelt (szövegréteg nélküli) PDF-oldalakat
// és a képfájlokat helyi OCR-rel (Tesseract, magyar nyelv) olvassuk: a kép nem hagyja
// el a gépet. Egy fájl hibája nem állítja meg a feldolgozást: annál a levélnél
// egyszerűen kevesebb szöveg lesz.

import { readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, extname, join } from "node:path";

import { createWorker } from "tesseract.js";
import { extractText, getDocumentProxy, renderPageAsImage } from "unpdf";

const MAX_FILE_BYTES = 30 * 1024 * 1024;
const TEXT_EXTENSIONS = new Set([".txt", ".xml", ".html", ".htm", ".json", ".csv"]);
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".bmp"]);
// Ennél kevesebb nem-szóköz karakter egy oldalon: az oldal szkennelt képnek számít.
const MIN_PAGE_TEXT_CHARS = 25;
const MAX_OCR_PAGES = 8;
const OCR_SCALE = 3;
const OCR_TIMEOUT_MS = 120_000;
const INK_SCALE = 0.6;
const INK_LUMINANCE = 225;
const INK_RATIO = 0.001;
// Egyetlen rövid sor is tintának számít, ha eléri ezt a sötét képpont-számot.
const INK_MIN_PIXELS = 40;

// A Tesseract tipikus tévesztései a dátumokban: „2026, november 20.” (vessző a pont helyett),
// „2O26” / „l5” / „I5” (betű a számjegy helyett számok között). Csak az OCR-kimenetre alkalmazzuk.
const MONTHS = "január|február|március|április|május|június|július|augusztus|szeptember|október|november|december";
export function cleanOcrText(text: string): string {
  return text
    .replace(new RegExp(`(\\d{4})\\s*[,;:]\\s+(?=(?:${MONTHS})\\b)`, "giu"), "$1. ")
    .replace(/(?<=\d)[OoÖö](?=\d)|(?<=\d)[OoÖö](?=[\s.,)-]|$)|(?<=^|[\s(])[OoÖö](?=\d{3}\b)/gmu, "0")
    .replace(/(?<=\d)[lI|](?=\d)|(?<=^|[\s(])[lI|](?=\d{1,3}(?:\s*\(|\s+)(?:napon|munkanapon|napos|\p{L}+\)\s*napon))/gmu, "1");
}

interface Ocr {
  recognize(image: Uint8Array): Promise<string>;
  close(): Promise<void>;
}

async function openOcr(): Promise<Ocr> {
  const require = createRequire(import.meta.url);
  const langPath = join(dirname(require.resolve("@tesseract.js-data/hun/package.json")), "4.0.0_best_int");
  const worker = await createWorker("hun", 1, { langPath, gzip: true, cacheMethod: "none" });
  return {
    async recognize(image) {
      let timer: NodeJS.Timeout | undefined;
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("az OCR időtúllépés miatt megszakadt")), OCR_TIMEOUT_MS);
      });
      try {
        const { data } = await Promise.race([worker.recognize(Buffer.from(image)), timeout]);
        return cleanOcrText(data.text);
      } finally {
        clearTimeout(timer);
      }
    },
    close: async () => {
      await worker.terminate();
    }
  };
}

interface FileText {
  readonly text: string;
  /** Az OCR ténylegesen szöveget adott (a szöveg tévesztést tartalmazhat). */
  readonly ocr: boolean;
  /** Az OCR hibázott vagy a határ miatt kimaradt oldal: a szöveg hiányos lehet. */
  readonly ocrIncomplete: boolean;
  readonly warnings: readonly string[];
}

type OcrFactory = () => Promise<Ocr>;

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function nonSpace(text: string): number {
  return text.replace(/\s/gu, "").length;
}

// Az oldal tartalmaz-e látható „tintát” (nem üres lap)? Kis felbontású rendereléssel, olcsón.
// Ha nem tudjuk eldönteni, tartalmasnak vesszük: a tévedés iránya a figyelmeztetés.
async function pageHasInk(pdf: Parameters<typeof renderPageAsImage>[0], pageNumber: number): Promise<boolean> {
  try {
    const canvas = await import("@napi-rs/canvas");
    const png = await renderPageAsImage(pdf, pageNumber, {
      canvasImport: () => import("@napi-rs/canvas"),
      scale: INK_SCALE
    });
    const image = await canvas.loadImage(Buffer.from(png));
    const surface = canvas.createCanvas(image.width, image.height);
    const context = surface.getContext("2d");
    context.fillStyle = "#fff";
    context.fillRect(0, 0, image.width, image.height);
    context.drawImage(image, 0, 0);
    const { data } = context.getImageData(0, 0, image.width, image.height);
    let dark = 0;
    for (let offset = 0; offset < data.length; offset += 4) {
      const luminance = 0.299 * (data[offset] ?? 255) + 0.587 * (data[offset + 1] ?? 255) + 0.114 * (data[offset + 2] ?? 255);
      if (luminance < INK_LUMINANCE) {
        dark += 1;
      }
    }
    return dark >= INK_MIN_PIXELS || dark / (image.width * image.height) >= INK_RATIO;
  } catch {
    return true;
  }
}

async function pdfText(bytes: Buffer, openOcrFn: OcrFactory): Promise<FileText> {
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  let ocr: Ocr | null = null;
  try {
    const { text: pages } = await extractText(pdf, { mergePages: false });
    const parts: string[] = [];
    const warnings: string[] = [];
    let ocrPages = 0;
    let ocrUsed = false;
    let ocrBroken = false;
    let incomplete = false;
    for (const [index, pageText] of pages.entries()) {
      parts.push(pageText);
      if (nonSpace(pageText) >= MIN_PAGE_TEXT_CHARS) {
        continue;
      }
      if (ocrBroken || ocrPages >= MAX_OCR_PAGES) {
        incomplete ||= await pageHasInk(pdf, index + 1);
        continue;
      }
      ocrPages += 1;
      // Az OCR hibája sosem veszíthet el már kiolvasott szöveget: oldalanként kezeljük.
      try {
        ocr ??= await openOcrFn();
        const image = await renderPageAsImage(pdf, index + 1, {
          canvasImport: () => import("@napi-rs/canvas"),
          scale: OCR_SCALE
        });
        const recognized = await ocr.recognize(new Uint8Array(image));
        parts.push(recognized);
        if (nonSpace(recognized) >= MIN_PAGE_TEXT_CHARS) {
          ocrUsed = true;
        } else if (await pageHasInk(pdf, index + 1)) {
          // Nem üres lap, de az OCR nem tudott belőle olvasni.
          incomplete = true;
        }
      } catch (error) {
        ocrBroken = true;
        incomplete = true;
        warnings.push(`OCR hiba (${index + 1}. oldal): ${describe(error)}`);
      }
    }
    return { text: parts.join("\n"), ocr: ocrUsed, ocrIncomplete: incomplete, warnings };
  } finally {
    await ocr?.close();
    await pdf.cleanup();
  }
}

async function imageText(bytes: Buffer, openOcrFn: OcrFactory): Promise<FileText> {
  let ocr: Ocr | null = null;
  try {
    ocr = await openOcrFn();
    const text = await ocr.recognize(new Uint8Array(bytes));
    const readable = nonSpace(text) >= MIN_PAGE_TEXT_CHARS;
    return { text, ocr: readable, ocrIncomplete: !readable, warnings: [] };
  } catch (error) {
    return { text: "", ocr: false, ocrIncomplete: true, warnings: [`OCR hiba: ${describe(error)}`] };
  } finally {
    await ocr?.close();
  }
}

function markupText(raw: string): string {
  return raw
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

const NO_TEXT: FileText = { text: "", ocr: false, ocrIncomplete: false, warnings: [] };

export async function fileTextDetail(path: string, openOcrFn: OcrFactory = openOcr): Promise<FileText> {
  const extension = extname(path).toLowerCase();
  if (extension !== ".pdf" && !TEXT_EXTENSIONS.has(extension) && !IMAGE_EXTENSIONS.has(extension)) {
    return NO_TEXT;
  }
  if (statSync(path).size > MAX_FILE_BYTES) {
    return NO_TEXT;
  }
  const bytes = readFileSync(path);
  if (extension === ".pdf") {
    return pdfText(bytes, openOcrFn);
  }
  if (IMAGE_EXTENSIONS.has(extension)) {
    return imageText(bytes, openOcrFn);
  }
  const raw = bytes.toString("utf8");
  return { ...NO_TEXT, text: extension === ".txt" || extension === ".csv" ? raw : markupText(raw) };
}

export async function fileText(path: string): Promise<string> {
  return (await fileTextDetail(path)).text;
}

/** Az összes olvasható fájl szövege egyben, a nem olvashatók hibái, és az OCR állapota. */
export async function textOfFiles(
  paths: readonly string[],
  openOcrFn: OcrFactory = openOcr
): Promise<{ text: string; errors: string[]; ocr: boolean; ocrIncomplete: boolean }> {
  const parts: string[] = [];
  const errors: string[] = [];
  let ocr = false;
  let ocrIncomplete = false;
  for (const path of paths) {
    try {
      const detail = await fileTextDetail(path, openOcrFn);
      parts.push(detail.text);
      ocr ||= detail.ocr;
      ocrIncomplete ||= detail.ocrIncomplete;
      errors.push(...detail.warnings.map((warning) => `${path}: ${warning}`));
    } catch (error) {
      errors.push(`${path}: ${describe(error)}`);
    }
  }
  return { text: parts.filter((part) => part !== "").join("\n\n"), errors, ocr, ocrIncomplete };
}
