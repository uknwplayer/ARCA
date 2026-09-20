from __future__ import annotations

import base64
import io
import json
import re
import urllib.error
import urllib.parse
import urllib.request
import zipfile
from dataclasses import dataclass
from typing import Any, Mapping

from .adapter import ProviderPermanentError, ProviderTransientError


_REPOSITORY = re.compile(r"^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$")
_REF = re.compile(r"^[A-Za-z0-9._/-]+$")


@dataclass(frozen=True)
class QueueTargetPolicy:
    branches: Mapping[str, tuple[str, ...]]

    def authorize(self, ref: str, path: str) -> None:
        prefixes = self.branches.get(ref)
        if prefixes is None:
            raise ProviderPermanentError("queue branch is outside the transport allowlist")
        if not any(path.startswith(prefix.rstrip("/") + "/") for prefix in prefixes):
            raise ProviderPermanentError("queue path is outside the transport allowlist")


class GitHubContentsQueueTransport:
    """Minimal GitHub transport for bounded, public queue envelopes.

    The token is used only in HTTP headers by the control plane. It is never added
    to a request body, commit, artifact, result, or returned dispatch reference.
    """

    def __init__(
        self,
        *,
        token: str,
        allowed_targets: Mapping[str, QueueTargetPolicy],
        default_repository: str | None = None,
        api_url: str = "https://api.github.com",
        timeout_seconds: int = 30,
    ):
        if not token:
            raise ValueError("GitHub control-plane token is required")
        self._token = token
        self.allowed_targets = dict(allowed_targets)
        self.default_repository = default_repository
        self.api_url = api_url.rstrip("/")
        self.timeout_seconds = timeout_seconds

    def _repository(self, target: str) -> str:
        repository = self.default_repository if target == "self" else target
        if repository is None or not _REPOSITORY.fullmatch(repository):
            raise ProviderPermanentError("invalid or unresolved GitHub repository target")
        if repository not in self.allowed_targets:
            raise ProviderPermanentError("GitHub repository target is not allowlisted")
        return repository

    def _authorize(self, target: str, ref: str, path: str) -> str:
        repository = self._repository(target)
        if not _REF.fullmatch(ref) or ".." in ref.split("/"):
            raise ProviderPermanentError("invalid queue ref")
        if path.startswith("/") or ".." in path.split("/"):
            raise ProviderPermanentError("invalid queue path")
        self.allowed_targets[repository].authorize(ref, path)
        return repository

    def _request(
        self,
        method: str,
        path: str,
        *,
        body: dict[str, Any] | None = None,
        accept: str = "application/vnd.github+json",
    ) -> tuple[int, bytes]:
        data = None if body is None else json.dumps(body).encode("utf-8")
        request = urllib.request.Request(
            f"{self.api_url}{path}",
            data=data,
            method=method,
            headers={
                "Accept": accept,
                "Authorization": f"Bearer {self._token}",
                "X-GitHub-Api-Version": "2022-11-28",
                "User-Agent": "arca-executor-mesh/0.3",
                **({"Content-Type": "application/json"} if data is not None else {}),
            },
        )
        try:
            with urllib.request.urlopen(request, timeout=self.timeout_seconds) as response:
                return response.status, response.read()
        except urllib.error.HTTPError as exc:
            payload = exc.read()
            if exc.code == 429 or exc.code >= 500:
                raise ProviderTransientError(f"GitHub API temporary failure: HTTP {exc.code}") from exc
            error = ProviderPermanentError(f"GitHub API rejected request: HTTP {exc.code}")
            error.status_code = exc.code
            error.response_body = payload
            raise error from exc
        except (urllib.error.URLError, TimeoutError) as exc:
            raise ProviderTransientError("GitHub API transport unavailable") from exc

    def _json(self, method: str, path: str, body: dict[str, Any] | None = None) -> Any:
        _, raw = self._request(method, path, body=body)
        return json.loads(raw)

    def _download_artifact(self, repository: str, artifact_id: int) -> bytes:
        """Download an Actions artifact without forwarding GitHub auth off-host."""
        path = f"/repos/{repository}/actions/artifacts/{artifact_id}/zip"
        request = urllib.request.Request(
            f"{self.api_url}{path}",
            method="GET",
            headers={
                "Accept": "application/vnd.github+json",
                "Authorization": f"Bearer {self._token}",
                "X-GitHub-Api-Version": "2022-11-28",
                "User-Agent": "arca-executor-mesh/0.3",
            },
        )

        class _NoRedirect(urllib.request.HTTPRedirectHandler):
            def redirect_request(self, req, fp, code, msg, headers, newurl):
                return None

        try:
            urllib.request.build_opener(_NoRedirect).open(
                request, timeout=self.timeout_seconds
            )
        except urllib.error.HTTPError as exc:
            if exc.code != 302:
                if exc.code == 429 or exc.code >= 500:
                    raise ProviderTransientError(
                        f"GitHub API temporary failure: HTTP {exc.code}"
                    ) from exc
                raise ProviderPermanentError(
                    f"GitHub artifact request rejected: HTTP {exc.code}"
                ) from exc
            location = exc.headers.get("Location")
            if not location:
                raise ProviderPermanentError(
                    "GitHub artifact redirect is missing Location"
                ) from exc
        else:
            raise ProviderPermanentError(
                "GitHub artifact endpoint did not return a redirect"
            )

        redirected = urllib.request.Request(
            location,
            method="GET",
            headers={"User-Agent": "arca-executor-mesh/0.3"},
        )
        try:
            with urllib.request.urlopen(
                redirected, timeout=self.timeout_seconds
            ) as response:
                return response.read()
        except urllib.error.HTTPError as exc:
            if exc.code == 429 or exc.code >= 500:
                raise ProviderTransientError(
                    f"artifact storage temporary failure: HTTP {exc.code}"
                ) from exc
            raise ProviderPermanentError(
                f"artifact storage rejected download: HTTP {exc.code}"
            ) from exc
        except (urllib.error.URLError, TimeoutError) as exc:
            raise ProviderTransientError("artifact storage unavailable") from exc

    def _content(self, repository: str, ref: str, path: str) -> dict[str, Any] | None:
        encoded_path = urllib.parse.quote(path, safe="/")
        query = urllib.parse.urlencode({"ref": ref})
        try:
            return self._json("GET", f"/repos/{repository}/contents/{encoded_path}?{query}")
        except ProviderPermanentError as exc:
            if getattr(exc, "status_code", None) == 404:
                return None
            raise

    def _latest_path_commit(self, repository: str, ref: str, path: str) -> str:
        query = urllib.parse.urlencode({"sha": ref, "path": path, "per_page": 1})
        commits = self._json("GET", f"/repos/{repository}/commits?{query}")
        if not commits:
            raise ProviderPermanentError("existing queue request has no commit history")
        return commits[0]["sha"]

    def create_request(self, *, target: str, ref: str, path: str, content: str, message: str) -> str:
        repository = self._authorize(target, ref, path)
        existing = self._content(repository, ref, path)
        if existing is not None:
            current = base64.b64decode(existing["content"]).decode("utf-8")
            if current != content:
                raise ProviderPermanentError("idempotency conflict for existing queue request")
            return self._latest_path_commit(repository, ref, path)

        encoded_path = urllib.parse.quote(path, safe="/")
        response = self._json(
            "PUT",
            f"/repos/{repository}/contents/{encoded_path}",
            {
                "message": message,
                "content": base64.b64encode(content.encode("utf-8")).decode("ascii"),
                "branch": ref,
            },
        )
        return response["commit"]["sha"]

    def _run_by_head_sha(self, repository: str, head_sha: str) -> dict[str, Any] | None:
        query = urllib.parse.urlencode({"head_sha": head_sha, "event": "push", "per_page": 20})
        data = self._json("GET", f"/repos/{repository}/actions/runs?{query}")
        runs = data.get("workflow_runs", [])
        return runs[0] if runs else None

    def status_by_head_sha(self, head_sha: str) -> str:
        for repository in self.allowed_targets:
            run = self._run_by_head_sha(repository, head_sha)
            if run is None:
                continue
            if run["status"] != "completed":
                return run["status"]
            return run.get("conclusion") or "completed"
        return "queued"

    def result_by_head_sha(self, head_sha: str) -> dict[str, Any]:
        for repository in self.allowed_targets:
            run = self._run_by_head_sha(repository, head_sha)
            if run is None:
                continue
            artifacts = self._json("GET", f"/repos/{repository}/actions/runs/{run['id']}/artifacts")
            candidates = [item for item in artifacts.get("artifacts", []) if not item.get("expired")]
            if len(candidates) != 1:
                raise ProviderPermanentError("expected exactly one non-expired result artifact")
            archive = self._download_artifact(repository, candidates[0]["id"])
            with zipfile.ZipFile(io.BytesIO(archive)) as zipped:
                names = [name for name in zipped.namelist() if name.endswith("execution-result.json")]
                if len(names) != 1:
                    raise ProviderPermanentError("result artifact does not contain exactly one execution result")
                return json.loads(zipped.read(names[0]))
        raise ProviderTransientError("no workflow run exists for dispatch commit yet")
