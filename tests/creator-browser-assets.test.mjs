import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

test("Creator browser JavaScript parses and contains explicit WebAuthn serialization boundary",async()=>{
  const source=await readFile(new URL("../packages/workbench/public/creator.js",import.meta.url),"utf8");
  assert.doesNotThrow(()=>new Function(source));
  assert.match(source,/navigator\.credentials\.create/);
  assert.match(source,/navigator\.credentials\.get/);
  assert.match(source,/encodeBase64url/);
  assert.match(source,/decodeBase64url/);
  assert.match(source,/\/api\/chat\/status/);
  assert.match(source,/\/api\/chat\/collect/);
  assert.match(source,/\/api\/chat\/pending/);
  assert.match(source,/watchPendingChat/);
  assert.match(source,/resumePendingChats/);
  assert.match(source,/\/api\/reviews\?status=pending/);
  assert.match(source,/\/api\/reviews\/resolve/);
  assert.match(source,/refreshReviews/);
  assert.match(source,/decideReview/);
  assert.match(source,/\/api\/workflows\/capabilities/);
  assert.match(source,/\/api\/workflows\/proposals/);
  assert.match(source,/\/api\/workflows\/propose/);
  assert.match(source,/\/api\/workflows\/register/);
  assert.match(source,/refreshWorkflows/);
  assert.match(source,/registerWorkflowProposal/);
  assert.match(source,/\/api\/workflows\/reason/);
  assert.match(source,/\/api\/workflows\/reason\/status/);
  assert.match(source,/\/api\/workflows\/reason\/collect/);
  assert.match(source,/\/api\/workflows\/reason\/pending/);
  assert.match(source,/watchWorkflowReasoning/);
  assert.match(source,/reviewAuthorizationText/);
});

test("Creator browser HTML keeps first-enrollment confirmation explicit",async()=>{
  const html=await readFile(new URL("../packages/workbench/public/creator.html",import.meta.url),"utf8");
  assert.match(html,/id="passkey-confirm"/);
  assert.match(html,/id="passkey-enroll"/);
  assert.match(html,/id="passkey-step-up"/);
  assert.match(html,/id="passkey-login"/);
  assert.match(html,/id="review-panel"/);
  assert.match(html,/id="review-list"/);
  assert.match(html,/id="review-refresh"/);
  assert.match(html,/id="workflow-panel"/);
  assert.match(html,/id="workflow-form"/);
  assert.match(html,/id="workflow-steps"/);
  assert.match(html,/id="workflow-refresh"/);
});
