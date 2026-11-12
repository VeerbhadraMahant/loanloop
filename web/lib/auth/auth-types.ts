export type UserRole = "user" | "staff" | "dev";
export type SupportedLang = "en" | "hi" | "mr";

export interface AuthUser {
  id: string;
  name: string;
  initials: string;
  mobile: string;
  mobile_masked: string;
  customer_ref: "priya" | "ramesh" | "sunita";
  loan_id: string;
  loan_id_masked: string;
  loan_type: string;
  account_masked: string;
  balance: string;
  tier: 1 | 2;
  tier_label: string;
  status: string;
  branch: string;
  ifsc: string;
}

export interface Session {
  user: AuthUser | null;
  role: UserRole;
  language: SupportedLang;
  isAuthenticated: boolean;
  micMode: "hold" | "tap";
}

export interface AuthContextValue extends Session {
  setLanguage: (lang: SupportedLang) => void;
  setMicMode: (mode: "hold" | "tap") => void;
  sendOtp: (mobile: string) => Promise<{ success: boolean; error?: string }>;
  verifyOtp: (mobile: string, otp: string) => Promise<{ success: boolean; error?: string }>;
  switchDemoUser: (customerRef: "priya" | "ramesh" | "sunita") => void;
  signOut: () => void;
}
