import test from "node:test";
import assert from "node:assert/strict";
import { applicationSelectionPath } from "./application-selection-url.ts";

test("opening an application writes one reload-safe apply instruction", () => {
  assert.equal(
    applicationSelectionPath(
      { pathname: "/dashboard/applications", search: "", hash: "" },
      "packet-25",
    ),
    "/dashboard/applications?application=packet-25&intent=apply",
  );
});

test("opening a different application replaces stale selection and preserves dashboard state", () => {
  const opened = applicationSelectionPath(
    {
      pathname: "/dashboard/applications",
      search: "?application=packet-1&intent=detail&state=action&qa=max-borges",
      hash: "#packet-review",
    },
    " packet-2 ",
  );

  assert.equal(
    opened,
    "/dashboard/applications?application=packet-2&intent=apply&state=action&qa=max-borges#packet-review",
  );

  const reloaded = new URL(opened, "https://trylitos.com");
  assert.equal(reloaded.searchParams.getAll("application").length, 1);
  assert.equal(reloaded.searchParams.get("application"), "packet-2");
  assert.equal(reloaded.searchParams.get("intent"), "apply");
  assert.equal(reloaded.searchParams.get("state"), "action");
  assert.equal(reloaded.searchParams.get("qa"), "max-borges");
  assert.equal(reloaded.hash, "#packet-review");
});

test("opening an application clears mutually exclusive composer and posting instructions", () => {
  assert.equal(
    applicationSelectionPath(
      {
        pathname: "/dashboard/applications",
        search: "?new=1&checkout_action=tailor&job=posting-4&state=action",
        hash: "",
      },
      "packet-4",
    ),
    "/dashboard/applications?state=action&application=packet-4&intent=apply",
  );
});

test("closing an application removes its full instruction and preserves unrelated query state", () => {
  assert.equal(
    applicationSelectionPath(
      {
        pathname: "/dashboard/applications",
        search: "?state=ready&application=packet-2&intent=apply&qa=packet-audit",
        hash: "#ready",
      },
      null,
    ),
    "/dashboard/applications?state=ready&qa=packet-audit#ready",
  );
});

test("closing a malformed mixed workspace cannot reactivate its composer or posting lookup", () => {
  assert.equal(
    applicationSelectionPath(
      {
        pathname: "/dashboard/applications",
        search: "?new=1&checkout_action=tailor&job=posting-4&application=packet-4&intent=apply&state=ready",
        hash: "",
      },
      null,
    ),
    "/dashboard/applications?state=ready",
  );
});

test("closing the only application instruction leaves no empty query and keeps a hash", () => {
  assert.equal(
    applicationSelectionPath(
      {
        pathname: "/dashboard/applications",
        search: "?application=packet-2&intent=apply",
        hash: "#applications",
      },
      "   ",
    ),
    "/dashboard/applications#applications",
  );

  assert.equal(
    applicationSelectionPath(
      { pathname: "/dashboard/applications", search: "", hash: "" },
      null,
    ),
    "/dashboard/applications",
  );
});
