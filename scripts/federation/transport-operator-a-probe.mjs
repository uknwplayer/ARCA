import {readFile} from "node:fs/promises";

const [inputPath] = process.argv.slice(2);
const token = process.env.ARCA_FEDERATION_B_TRANSPORT_TOKEN;
const requestId = process.env.ARCA_FEDERATION_REQUEST_ID;
if (!inputPath || !token) throw new Error("ARCA_FEDERATION_TRANSPORT_UNAVAILABLE");
if (!/^[A-Za-z0-9._-]{1,120}$/.test(requestId ?? "")) throw new Error("ARCA_FEDERATION_INVALID_REQUEST_ID");
const raw = await readFile(inputPath);
JSON.parse(raw.toString("utf8"));
const targetRepo = process.env.ARCA_FEDERATION_B_REPOSITORY;
const targetRef = process.env.ARCA_FEDERATION_B_REF ?? "main";
if(!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(targetRepo ?? "")) throw new Error("ARCA_FEDERATION_TARGET_REPOSITORY_REQUIRED");
const targetPath = "federation/mesh-inbox/" + requestId + ".json";
const endpoint = "https://api.github.com/repos/" + targetRepo + "/contents/" + targetPath.split("/").map(encodeURIComponent).join("/");
const response = await fetch(endpoint, {
  method: "PUT",
  headers: {
    Accept: "application/vnd.github+json",
    Authorization: "Bearer " + token,
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "arca-machine-bridge"
  },
  body: JSON.stringify({
    message: "federation: receive signed Mesh probe " + requestId,
    content: raw.toString("base64"),
    branch: targetRef
  })
});
if (!response.ok) throw new Error("ARCA_FEDERATION_TRANSPORT_FAILED_" + response.status);
console.log("transported_request_id=" + requestId);
console.log("transport_target=" + targetRepo);
console.log("transport_path=" + targetPath);
