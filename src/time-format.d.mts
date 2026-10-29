export declare function parseTime24(value: unknown): { hour: number; minute: string } | null
export declare function formatTime12(value: unknown, fallback?: string): string
export declare function timeTo24(hour: string | number, minute: string, period: string): string
export declare function formatNotificationTime(message: unknown, time: unknown): string
export declare function formatDateManila(value: unknown, fallback?: string): string
export declare function timestampMillis(value: unknown): number
export declare function formatTimestampManila(value: unknown, fallback?: string): string
