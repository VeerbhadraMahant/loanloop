import { AuthUser } from "./auth-types";

export const DEMO_PERSONAS: Record<"priya" | "ramesh" | "sunita", AuthUser> = {
  priya: {
    id: "1",
    name: "Priya Deshmukh",
    initials: "PD",
    mobile: "9000014417",
    mobile_masked: "+91 90000 ••417",
    customer_ref: "priya",
    loan_id: "410020487391",
    loan_id_masked: "HL-88201-M · •••• 7391",
    loan_type: "Sahyadri Prime Home Loan",
    account_masked: "•••• 0417",
    balance: "₹42,18,940",
    tier: 1,
    tier_label: "Tier 1: Verified (DOB Auth)",
    status: "Active · Inbound Clean",
    branch: "Kothrud, Pune",
    ifsc: "SAHY0000101",
  },
  ramesh: {
    id: "2",
    name: "Ramesh Patil",
    initials: "RP",
    mobile: "9822054109",
    mobile_masked: "+91 98220 ••109",
    customer_ref: "ramesh",
    loan_id: "410030115520",
    loan_id_masked: "AL-10492-P · •••• 5520",
    loan_type: "Vehicle Auto-Debit Mandate",
    account_masked: "•••• 3158",
    balance: "₹3,45,200",
    tier: 2,
    tier_label: "Tier 2: Overdue (PTP Negotiation)",
    status: "Bucket 1-30 DPD",
    branch: "Nashik Road, Nashik",
    ifsc: "SAHY0000112",
  },
  sunita: {
    id: "3",
    name: "Sunita Kulkarni",
    initials: "SK",
    mobile: "9423077182",
    mobile_masked: "+91 94230 ••182",
    customer_ref: "sunita",
    loan_id: "410040228864",
    loan_id_masked: "PL-33901-K · •••• 8864",
    loan_type: "Personal Loan Restructure",
    account_masked: "•••• 0912",
    balance: "₹1,82,400",
    tier: 1,
    tier_label: "Tier 1: Verified (Hardship)",
    status: "Hardship Review",
    branch: "Satara Powai Naka",
    ifsc: "SAHY0000119",
  },
};

export const DUMMY_OTP = "123456";

export function resolvePersonaByMobile(rawMobile: string): AuthUser {
  const clean = rawMobile.replace(/\D/g, "");
  if (clean.endsWith("54109") || clean.endsWith("23158") || clean.includes("ramesh")) {
    return DEMO_PERSONAS.ramesh;
  }
  if (clean.endsWith("77182") || clean.endsWith("30912") || clean.includes("sunita")) {
    return DEMO_PERSONAS.sunita;
  }
  return DEMO_PERSONAS.priya;
}

