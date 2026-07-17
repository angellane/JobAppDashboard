import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Extracts plain text from an uploaded resume/CV so it can be fed to the
 * auto-apply agent. Supports PDF, DOCX, and plain text. Errors are returned
 * as JSON so the client can fall back to manual paste.
 */
export async function POST(req: Request) {
  let file: File | null = null;
  try {
    const form = await req.formData();
    const f = form.get("file");
    if (f instanceof File) file = f;
  } catch {
    return NextResponse.json({ error: "Invalid upload." }, { status: 400 });
  }

  if (!file) {
    return NextResponse.json({ error: "No file provided." }, { status: 400 });
  }

  const name = file.name.toLowerCase();
  const type = file.type || "";
  const buf = Buffer.from(await file.arrayBuffer());

  try {
    let text = "";

    if (type.includes("pdf") || name.endsWith(".pdf")) {
      const { PDFParse } = await import("pdf-parse");
      const parser = new PDFParse({ data: new Uint8Array(buf) });
      const result = await parser.getText();
      text = result.text;
      await parser.destroy();
    } else if (
      name.endsWith(".docx") ||
      type.includes("officedocument.wordprocessingml")
    ) {
      const mammoth = (await import("mammoth")).default;
      const result = await mammoth.extractRawText({ buffer: buf });
      text = result.value;
    } else if (
      type.startsWith("text/") ||
      name.endsWith(".txt") ||
      name.endsWith(".md")
    ) {
      text = buf.toString("utf-8");
    } else {
      return NextResponse.json(
        { error: "Unsupported file type. Please upload a PDF, DOCX, or TXT." },
        { status: 415 },
      );
    }

    text = text
      .replace(/\r/g, "")
      // Strip pdf-parse's "-- 1 of 3 --" page separators.
      .replace(/^-{2,}\s*\d+\s+of\s+\d+\s*-{2,}$/gm, "")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    if (!text) {
      return NextResponse.json(
        {
          error:
            "No text found — the file may be a scanned image. You can paste the text manually.",
        },
        { status: 422 },
      );
    }

    return NextResponse.json({ text });
  } catch (err) {
    console.error("parse-resume failed:", err);
    return NextResponse.json(
      {
        error:
          "Couldn't extract text from that file. You can paste it manually below.",
      },
      { status: 422 },
    );
  }
}
