// Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  badgeText,
  notificationDestination,
  notificationGroup,
  notificationQuote,
  notificationText,
  notificationTitle,
  relativeTime,
} from "../src/utils/notificationText.ts";
import type { AppNotification } from "../src/utils/notificationText.ts";

const base: AppNotification = {
  id: "n1", type: "room_message", created_at: "2026-10-22T10:00:00Z", read_at: null,
  actor_id: "u2", actor_name: "Maya", actor_avatar_url: null,
  room_id: "r1", room_name: "Summer Fits", message_id: "m1", message_preview: "Can you style item #008?",
  request_id: null, request_status: null, response_message: null,
  item_id: null, item_name: null, item_number: null,
};

test("chat message wording, preview and destination", () => {
  assert.equal(notificationTitle(base), "New message");
  assert.equal(notificationText(base), "Maya sent a message in Summer Fits.");
  assert.equal(notificationQuote(base), "Can you style item #008?");
  assert.equal(notificationGroup(base), "messages");
  assert.deepEqual(notificationDestination(base), { path: "/rooms", state: { roomId: "r1", view: "chat" } });
});

test("borrow wording names the item and its number", () => {
  const req = { ...base, type: "borrow_requested" as const, request_id: "q1", item_name: "Pearl Earrings", item_number: 3, message_preview: null };
  assert.equal(notificationTitle(req), "New borrow request");
  assert.equal(notificationText(req), "Maya wants to borrow your Pearl Earrings (#003).");
  assert.equal(notificationGroup(req), "borrow");
  assert.deepEqual(notificationDestination(req)?.state, { roomId: "r1", view: "requests", tab: "incoming", requestId: "q1" });
  const ok = { ...req, type: "borrow_accepted" as const, item_name: "Black Dress", item_number: 12, response_message: "Enjoy!" };
  assert.equal(notificationText(ok), "Maya accepted your request for the Black Dress (#012).");
  assert.equal(notificationQuote(ok), "Enjoy!");
  assert.equal(notificationDestination(ok)?.state.tab, "outgoing");
  const no = { ...ok, type: "borrow_declined" as const, response_message: "I need it for an event tomorrow." };
  assert.equal(notificationTitle(no), "Request declined");
  assert.equal(notificationText(no), "Maya declined your request for the Black Dress (#012).");
  assert.equal(notificationQuote(no), "I need it for an event tomorrow.");
  const gone = { ...req, type: "borrow_cancelled" as const };
  assert.equal(notificationText(gone), "Maya withdrew their request for your Pearl Earrings (#003).");
});

test("deleted rooms, items and people degrade gracefully", () => {
  const left = { ...base, room_id: null, room_name: null, message_preview: null, actor_name: null };
  assert.equal(notificationText(left), "Someone sent a message in a room you're no longer in.");
  assert.equal(notificationDestination(left), null);
  const noItem = { ...base, type: "borrow_declined" as const, item_name: null, item_number: null };
  assert.equal(notificationText(noItem), "Maya declined your request for an item.");
  assert.equal(notificationText({ ...noItem, type: "borrow_requested" }), "Maya wants to borrow one of your items.");
});

test("relative times", () => {
  const now = new Date("2026-10-22T12:00:00Z");
  assert.equal(relativeTime("2026-10-22T11:59:40Z", now), "Just now");
  assert.equal(relativeTime("2026-10-22T11:55:00Z", now), "5m ago");
  assert.equal(relativeTime("2026-10-22T09:00:00Z", now), "3h ago");
  assert.equal(relativeTime("2026-10-21T10:00:00Z", now), "Yesterday");
  assert.equal(relativeTime("2026-10-18T12:00:00Z", now), "4d ago");
  assert.match(relativeTime("2026-09-01T12:00:00Z", now), /Sept?|1/);
  assert.equal(relativeTime("2026-10-22T12:05:00Z", now), "Just now"); // clock skew never shows the future
});

test("badge text", () => {
  assert.equal(badgeText(0), null);
  assert.equal(badgeText(1), "1");
  assert.equal(badgeText(4), "4");
  assert.equal(badgeText(10), "9+");
  assert.equal(badgeText(250), "9+");
});
