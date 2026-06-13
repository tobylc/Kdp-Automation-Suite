import fs from "fs";
import path from "path";
import { logger } from "./logger";

const ASSETS_DIR = path.resolve(process.cwd(), "artifacts/api-server/uploads/assets");

export interface BookAssets {
  assetsDir: string;
  manuscriptPath: string;
  coverPngPath: string;
  coverJpgPath: string;
  manuscriptReady: boolean;
  coverPngReady: boolean;
  coverJpgReady: boolean;
}

async function downloadFile(url: string, destPath: string, label: string): Promise<boolean> {
  try {
    logger.info({ url, destPath, label }, "Downloading asset");
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; KDPUploader/1.0)" },
      signal: AbortSignal.timeout(60000),
      redirect: "follow",
    });
    if (!res.ok) {
      logger.warn({ url, status: res.status, label }, "Asset download returned non-OK status");
      return false;
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length < 100) {
      logger.warn({ url, bytes: buffer.length, label }, "Asset download too small — likely empty");
      return false;
    }
    fs.writeFileSync(destPath, buffer);
    logger.info({ destPath, bytes: buffer.length, label }, "Asset downloaded");
    return true;
  } catch (err) {
    logger.error({ err, url, label }, "Asset download failed");
    return false;
  }
}

export async function downloadBookAssets(
  bookId: number,
  manuscriptUrl: string | null,
  coverPngUrl: string | null,
  coverJpgUrl: string | null,
): Promise<BookAssets> {
  const dir = path.join(ASSETS_DIR, String(bookId));
  fs.mkdirSync(dir, { recursive: true });

  const manuscriptPath = path.join(dir, "manuscript_6x9.docx");
  const coverPngPath = path.join(dir, "cover.png");
  const coverJpgPath = path.join(dir, "cover.jpg");

  const [manuscriptReady, coverPngReady, coverJpgReady] = await Promise.all([
    manuscriptUrl ? downloadFile(manuscriptUrl, manuscriptPath, "manuscript") : Promise.resolve(false),
    coverPngUrl ? downloadFile(coverPngUrl, coverPngPath, "cover.png") : Promise.resolve(false),
    coverJpgUrl ? downloadFile(coverJpgUrl, coverJpgPath, "cover.jpg") : Promise.resolve(false),
  ]);

  return {
    assetsDir: dir,
    manuscriptPath,
    coverPngPath,
    coverJpgPath,
    manuscriptReady,
    coverPngReady,
    coverJpgReady,
  };
}
