export type ConsoleRole = "user" | "staff" | "dev";

export interface ConsoleSession {
  role: ConsoleRole;
  identifier: string; // e.g., mobile number or staff ID or dev ID
  name: string;
  customerId?: string; // only for user, e.g. "priya"
  createdAt: number;
  expiresAt: number;
}

export interface SignInCredentials {
  identifier: string;
  passcode?: string;
  otp?: string;
  customerId?: string;
}

export interface SignInResult {
  success: boolean;
  error?: string;
  session?: ConsoleSession;
  returnTo?: string;
}

export interface ConsoleAuthAdapter {
  role: ConsoleRole;
  getSession(): Promise<ConsoleSession | null> | ConsoleSession | null;
  signIn(credentials: SignInCredentials): Promise<SignInResult>;
  signOut(): Promise<void> | void;
}

