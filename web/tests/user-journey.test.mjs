import test from "node:test";
import assert from "node:assert/strict";

const BASE = process.env.SMOKE_URL ?? "http://localhost:3000";

test("user onboarding flow pages render cleanly with expected content", async () => {
  // 1. Welcome Screen
  const welcomeRes = await fetch(`${BASE}/user/welcome`);
  assert.equal(welcomeRes.status, 200);
  const welcomeHtml = await welcomeRes.text();
  assert.ok(welcomeHtml.includes("Sahyadri Voice Banking"), "Welcome missing brand badge");
  assert.ok(welcomeHtml.includes("Zero Secrets Guarantee"), "Welcome missing zero secrets badge");
  assert.ok(welcomeHtml.includes("Get Started"), "Welcome missing CTA");

  // 2. Language Selection Screen
  const langRes = await fetch(`${BASE}/user/language`);
  assert.equal(langRes.status, 200);
  const langHtml = await langRes.text();
  assert.ok(langHtml.includes("Select Language"), "Language missing title");
  assert.ok(langHtml.includes("English") && langHtml.includes("हिंदी") && langHtml.includes("मराठी"), "Missing language options");

  // 3. Mobile Number Input Screen
  const mobileRes = await fetch(`${BASE}/user/mobile`);
  assert.equal(mobileRes.status, 200);
  const mobileHtml = await mobileRes.text();
  assert.ok(mobileHtml.includes("Enter Mobile Number"), "Mobile missing title");
  assert.ok(mobileHtml.includes("Priya Deshmukh"), "Mobile missing Priya demo shortcut");
  assert.ok(mobileHtml.includes("Ramesh Patil"), "Mobile missing Ramesh demo shortcut");
  assert.ok(mobileHtml.includes("Sunita Kulkarni"), "Mobile missing Sunita demo shortcut");

  // 4. OTP Verification Screen
  const otpRes = await fetch(`${BASE}/user/otp?m=9000014417`);
  assert.equal(otpRes.status, 200);
  const otpHtml = await otpRes.text();
  assert.ok(otpHtml.includes("Verification"), "OTP missing title");
  assert.ok(otpHtml.includes("123456"), "OTP missing demo code hint");
});

test("user phone console main tabs render properly with borrower data", async () => {
  // 1. Home tab
  const homeRes = await fetch(`${BASE}/user/home`);
  assert.equal(homeRes.status, 200);
  const homeHtml = await homeRes.text();
  assert.ok(homeHtml.includes("Sahyadri Voice Desk"), "Home missing voice card");
  assert.ok(homeHtml.includes("Active Loan"), "Home missing active loan section");
  assert.ok(homeHtml.includes("Quick Services"), "Home missing quick actions grid");
  assert.ok(homeHtml.includes("Change EMI Date"), "Home missing EMI date shortcut");

  // 2. Inbox tab
  const inboxRes = await fetch(`${BASE}/user/inbox`);
  assert.equal(inboxRes.status, 200);
  const inboxHtml = await inboxRes.text();
  assert.ok(inboxHtml.includes("Inbox & Approvals") || inboxHtml.includes("Inbox"), "Inbox missing title");
  assert.ok(inboxHtml.includes("Bank SMS Alerts"), "Inbox missing SMS heading");

  // 3. Talk tab
  const talkRes = await fetch(`${BASE}/user/talk`);
  assert.equal(talkRes.status, 200);
  const talkHtml = await talkRes.text();
  assert.ok(talkHtml.includes("Voice Assistant"), "Talk missing title");
  assert.ok(talkHtml.includes("Speak") && talkHtml.includes("Check") && talkHtml.includes("Done"), "Talk missing 3-step stepper");

  // 4. Activity tab
  const actRes = await fetch(`${BASE}/user/activity`);
  assert.equal(actRes.status, 200);
  const actHtml = await actRes.text();
  assert.ok(actHtml.includes("Service Requests"), "Activity missing service requests tab");
  assert.ok(actHtml.includes("Voice Calls"), "Activity missing voice calls tab");

  // 5. Help tab & Other Consoles Redirect
  const helpRes = await fetch(`${BASE}/user/help`);
  assert.equal(helpRes.status, 200);
  const helpHtml = await helpRes.text();
  assert.ok(helpHtml.includes("Zero Secrets Guarantee"), "Help missing zero secrets guarantee");
  assert.ok(helpHtml.includes("Microphone Mode"), "Help missing mic mode toggle");
  assert.ok(helpHtml.includes("Other Consoles"), "Help missing other consoles block");
  assert.ok(helpHtml.includes("/collections") && helpHtml.includes("/ops"), "Help missing staff console links");
  assert.ok(helpHtml.includes("/dev") && helpHtml.includes("/metrics"), "Help missing dev console links");
});

test("backend customer and phone endpoints respond correctly for borrower", async () => {
  const [phoneRes, smsRes, apprRes] = await Promise.all([
    fetch(`${BASE}/gw/phone/priya`),
    fetch(`${BASE}/gw/phone/priya/sms`),
    fetch(`${BASE}/gw/phone/priya/approvals`),
  ]);

  assert.equal(phoneRes.status, 200);
  const phone = await phoneRes.json();
  assert.equal(phone.name, "Priya Deshmukh");
  assert.ok(phone.mobile_masked.includes("417"), "Mobile should be masked");

  assert.equal(smsRes.status, 200);
  const sms = await smsRes.json();
  assert.ok(Array.isArray(sms), "SMS must be an array");

  assert.equal(apprRes.status, 200);
  const appr = await apprRes.json();
  assert.ok(Array.isArray(appr), "Approvals must be an array");
});
