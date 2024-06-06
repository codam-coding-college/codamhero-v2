export const URL_ORIGIN = process.env.URL_ORIGIN!;
export const SESSION_SECRET = process.env.SESSION_SECRET!;
export const INTRA_API_UID = process.env.INTRA_API_UID!;
export const INTRA_API_SECRET = process.env.INTRA_API_SECRET!;
export const CAMPUS_ID: number = parseInt(process.env.INTRA_CAMPUS_ID!);
export const NODE_ENV = process.env.NODE_ENV || "development";
export const DEV_DAYS_LIMIT: number = process.env.DEV_DAYS_LIMIT ? parseInt(process.env.DEV_DAYS_LIMIT) : 365;
