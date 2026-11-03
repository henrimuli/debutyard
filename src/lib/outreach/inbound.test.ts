import { describe, expect, it } from "vitest";
import {
  asksIfSpam,
  asksToStop,
  declines,
  readFailure,
  bouncedAddress,
  isAutoReply,
  isBounce,
  isHardBounce,
  isPositive,
  referenced,
  suppressionFor,
} from "./inbound";

describe("bounces", () => {
  it("recognises bounce messages", () => {
    expect(isBounce("mailer-daemon@googlemail.com", "Hi", {})).toBe(true);
    expect(isBounce("x@y.com", "Undeliverable: hello", {})).toBe(true);
    expect(isBounce("x@y.com", "Re: hello", { "content-type": "multipart/report; report-type=delivery-status" })).toBe(
      true,
    );
    expect(isBounce("founder@acme.com", "Re: hello", {})).toBe(false);
  });

  it("finds the address that failed", () => {
    expect(bouncedAddress("", { "x-failed-recipients": "Hello@Acme.com, b@c.com" })).toBe("hello@acme.com");
    expect(bouncedAddress("Final-Recipient: rfc822; hello@acme.com\nAction: failed", {})).toBe("hello@acme.com");
    expect(bouncedAddress("Nothing useful", {})).toBeNull();
  });

  it("only treats permanent failures as bad addresses", () => {
    expect(isHardBounce("550 5.1.1 user unknown")).toBe(true);
    expect(isHardBounce("452 4.2.2 mailbox full")).toBe(false);
  });
});

describe("what a reply means", () => {
  it("spots auto-replies", () => {
    expect(isAutoReply("Hi", { "auto-submitted": "auto-replied" })).toBe(true);
    expect(isAutoReply("Hi", { "auto-submitted": "no" })).toBe(false);
    expect(isAutoReply("Re: Out of office", {})).toBe(true);
    expect(isAutoReply("Re: who's ranking", {})).toBe(false);
  });

  it("spots a short request to stop, and leaves long replies to the model", () => {
    expect(asksToStop("Please unsubscribe me.")).toBe(true);
    expect(asksToStop("stop")).toBe(true);
    expect(asksToStop("Sounds interesting, how does it work?")).toBe(false);
    expect(asksToStop(`${"We can't stop thinking about SEO. ".repeat(10)}unsubscribe`)).toBe(false);
  });

  it("spots a complaint", () => {
    expect(asksIfSpam("This is spam.")).toBe(true);
    expect(asksIfSpam("Your email went to my spam folder but I'm interested")).toBe(false);
  });

  it("counts the right replies as positive", () => {
    expect(isPositive("interested")).toBe(true);
    expect(isPositive("question")).toBe(true);
    expect(isPositive("not_interested")).toBe(false);
    expect(isPositive(null)).toBe(false);
  });

  it("stops contacting people who said so", () => {
    expect(suppressionFor("unsubscribe")).toBe("unsubscribed");
    expect(suppressionFor("complaint")).toBe("complained");
    expect(suppressionFor("not_interested")).toBe("not_interested");
    expect(suppressionFor("interested")).toBeNull();
    expect(suppressionFor("auto_reply")).toBeNull();
  });
});

describe("threading", () => {
  it("collects referenced message ids", () => {
    expect(referenced("<a@x>", "<b@x> <a@x>")).toEqual(["<a@x>", "<b@x>"]);
    expect(referenced(null, undefined)).toEqual([]);
  });
});

describe("declines", () => {
  it.each([
    "Not interested",
    "not interested, thanks",
    "No thanks.",
    "No thank you",
    "This isn't useful, not relevant to us.",
  ])("catches %s", (t) => {
    expect(declines(t)).toBe(true);
  });

  it("leaves questions and long replies to the model", () => {
    expect(declines("Not interested in SEO, but do you do directories in Germany?")).toBe(false);
    expect(declines(`${"We looked at this closely and thought about it. ".repeat(6)} not interested`)).toBe(false);
    expect(declines("Sounds good, tell me more")).toBe(false);
  });
});

describe("readFailure", () => {
  const failure = (extra: object) => Object.assign(new Error("Command failed"), extra);

  it("says what the server answered", () => {
    expect(readFailure(failure({ responseText: "Mailbox doesn't exist" }))).toBe(
      "Command failed: Mailbox doesn't exist",
    );
  });

  it("calls a refused login what it is", () => {
    expect(readFailure(failure({ authenticationFailed: true, responseText: "Invalid credentials" }))).toBe(
      "The server refused the login: Invalid credentials",
    );
    expect(readFailure(failure({ authenticationFailed: true }))).toBe("The server refused the login");
  });

  it("keeps other errors as they are", () => {
    expect(readFailure(new Error("getaddrinfo ENOTFOUND imap.example.com"))).toBe(
      "getaddrinfo ENOTFOUND imap.example.com",
    );
    expect(readFailure("odd")).toBe("odd");
  });
});
