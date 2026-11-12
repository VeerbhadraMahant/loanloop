import { ConsoleRole, ConsoleAuthAdapter } from "./types";
import { DummyUserAuthAdapter } from "./user-adapter";
import { DummyStaffAuthAdapter } from "./staff-adapter";
import { DummyDevAuthAdapter } from "./dev-adapter";

export * from "./types";
export * from "./user-adapter";
export * from "./staff-adapter";
export * from "./dev-adapter";

const userAdapter = new DummyUserAuthAdapter();
const staffAdapter = new DummyStaffAuthAdapter();
const devAdapter = new DummyDevAuthAdapter();

export function getAuthAdapter(role: ConsoleRole): ConsoleAuthAdapter {
  switch (role) {
    case "user":
      return userAdapter;
    case "staff":
      return staffAdapter;
    case "dev":
      return devAdapter;
    default:
      throw new Error(`Unknown role adapter requested: ${role}`);
  }
}

