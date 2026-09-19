import * as pdfjsLib from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { parseStatementPages, type TextItem, type ParsedStatement } from './statementParser'
export type { ParsedTransaction, ParsedStatement } from './statementParser'

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl

export async function readStatementPdf(file: File): Promise<ParsedStatement> {
  const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise
  try {
    const pages: TextItem[][] = []
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const content = await (await pdf.getPage(pageNum)).getTextContent()
      pages.push(content.items.flatMap((item) => 'str' in item && item.str.trim()
        ? [{ str: item.str, x: item.transform[4], y: item.transform[5] }] : []))
    }
    return parseStatementPages(pages)
  } finally {
    await pdf.destroy()
  }
}

export async function parseStatementPdf(file: File) {
  return (await readStatementPdf(file)).transactions
}
