import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createWorkbenchServer } from "../packages/workbench/src/server.ts";

async function fixture(t) {
  const home = await mkdtemp(join(tmpdir(), "arca-workbench-review-ui-"));
  const instance = createWorkbenchServer({ home, host: "127.0.0.1", port: 0 });
  const address = await instance.start();
  t.after(async () => {
    await instance.stop();
    await rm(home, { recursive: true, force: true });
  });
  return address.url;
}

test("Workbench exposes the Human Review Inbox under the same security boundary", async (t) => {
  const url = await fixture(t);

  const sessionResponse = await fetch(`${url}/api/session`);
  const session = await sessionResponse.json();
  assert.equal(session.workbenchVersion, "0.2.2");
  assert.equal(session.humanReviewVersion, "0.1.0");

  const mainResponse = await fetch(`${url}/`);
  const mainHtml = await mainResponse.text();
  assert.equal(mainResponse.status, 200);
  assert.match(mainHtml, /href="\/reviews\.html"/);
  assert.match(mainHtml, /Inbox de revisão/);
  assert.match(mainHtml, /Propostas de agentes/);

  const reviewResponse = await fetch(`${url}/reviews.html`);
  const reviewHtml = await reviewResponse.text();
  assert.equal(reviewResponse.status, 200);
  assert.match(reviewResponse.headers.get("content-security-policy"), /script-src 'self'/);
  assert.match(reviewHtml, /Human Review Queue/);
  assert.match(reviewHtml, /src="\/reviews\.js"/);

  const scriptResponse = await fetch(`${url}/reviews.js`);
  const script = await scriptResponse.text();
  assert.equal(scriptResponse.status, 200);
  assert.match(scriptResponse.headers.get("content-type"), /text\/javascript/);
  assert.doesNotThrow(() => new vm.Script(script, { filename: "reviews.js" }));
  assert.match(script, /\/api\/reviews/);
  assert.match(script, /expectedRecordHash/);
});
