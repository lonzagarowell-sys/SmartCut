export declare function exportFilename(name: string): string
export declare function exportDefinition(name: string, columns: string[], rows: string[][], generatedAt?: Date, details?: string[][]): object
export declare function createExportPdf(name: string, columns: string[], rows: string[][], details?: string[][]): Promise<{
  getBuffer(callback: (buffer: Uint8Array) => void): void
  getBlob(callback: (blob: Blob) => void): void
}>
export declare function downloadPdf(name: string, columns: string[], rows: string[][], details?: string[][]): Promise<void>
