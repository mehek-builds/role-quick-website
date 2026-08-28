import assert from "node:assert/strict";
import test from "node:test";
import { safeBrowserLiveViewUrl } from "./browser-live-view.ts";

test("only exact Browserbase session viewers may enter an iframe", () => {
  for (const url of [
    "https://debug.browserbase.com/sessions/session-1/fullscreen?token=short-lived",
    "https://www.browserbase.com/sessions/session-1",
    "https://browserbase.com/sessions/session-1",
    "https://live.browserbase.com/session/session-1?navbar=false",
  ]) assert.equal(safeBrowserLiveViewUrl(url), url);
});

test("an employer URL or confused Browserbase-looking URL is always absent", () => {
  for (const url of [
    "https://employer.example/apply",
    "https://debug.browserbase.com.evil.example/sessions/session-1",
    "https://debug.browserbase.com@employer.example/sessions/session-1",
    "http://debug.browserbase.com/sessions/session-1",
    "https://debug.browserbase.com:444/sessions/session-1",
    "https://debug.browserbase.com/settings",
    "https://debug.browserbase.com/sessions/session-1#https://employer.example/apply",
    " https://debug.browserbase.com/sessions/session-1",
  ]) assert.equal(safeBrowserLiveViewUrl(url), null, url);
  assert.equal(safeBrowserLiveViewUrl(null), null);
  assert.equal(safeBrowserLiveViewUrl({}), null);
});
