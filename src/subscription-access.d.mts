export declare const billingPlans: Record<string, { name: string; amount: number }>
export declare function billingDeadline(record: Record<string, unknown> | null | undefined): Date | undefined
export declare function workspaceAccess(record: Record<string, unknown> | null | undefined, now?: number): { allowed: boolean; reason: string; deadline?: Date }
export declare function addBillingMonth(date: Date): Date
export declare function manilaDueDate(value: string): Date
