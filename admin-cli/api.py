"""Thin HTTP wrapper around the admin API."""

import json
import sys
import requests
from config import API_BASE_URL, HEADERS


def _url(path: str) -> str:
    return f"{API_BASE_URL}{path}"


def _check(resp: requests.Response) -> dict:
    if resp.status_code >= 400:
        print(f"  ✗ HTTP {resp.status_code}: {resp.text}", file=sys.stderr)
        resp.raise_for_status()
    return resp.json()


# ── Jobs ──────────────────────────────────────────────

def list_jobs(status: str) -> list[dict]:
    return _check(requests.get(_url(f"/api/admin/jobs?status={status}"), headers=HEADERS))["data"]


def get_payload(job_id: str) -> dict:
    return _check(requests.get(_url(f"/api/admin/jobs/{job_id}/payload"), headers=HEADERS))


def claim(job_id: str, claimed_by: str = "admin") -> dict:
    return _check(requests.post(_url(f"/api/admin/jobs/{job_id}/claim"), headers=HEADERS,
                                json={"claimedBy": claimed_by}))


def start(job_id: str) -> dict:
    return _check(requests.post(_url(f"/api/admin/jobs/{job_id}/start"), headers=HEADERS))


def fail(job_id: str, failure_type: str = "execution_error", error_summary: str = "") -> dict:
    return _check(requests.post(_url(f"/api/admin/jobs/{job_id}/fail"), headers=HEADERS,
                                json={"failureType": failure_type, "errorSummary": error_summary}))


def cancel(job_id: str) -> dict:
    return _check(requests.post(_url(f"/api/admin/jobs/{job_id}/cancel"), headers=HEADERS))


# ── Review ────────────────────────────────────────────

def review_ready(job_id: str, payload: dict) -> dict:
    return _check(requests.post(_url(f"/api/admin/jobs/{job_id}/review-ready"), headers=HEADERS,
                                json=payload))


def get_review(job_id: str) -> dict:
    return _check(requests.get(_url(f"/api/admin/jobs/{job_id}/review"), headers=HEADERS))


def publish(job_id: str) -> dict:
    return _check(requests.post(_url(f"/api/admin/jobs/{job_id}/publish"), headers=HEADERS))


def reject(job_id: str, failure_type: str = "quality_rejected", review_note: str = "") -> dict:
    return _check(requests.post(_url(f"/api/admin/jobs/{job_id}/reject"), headers=HEADERS,
                                json={"failureType": failure_type, "reviewNote": review_note}))


# ── Profile Requests ─────────────────────────────────

def list_profile_requests(status: str = "queued") -> list[dict]:
    return _check(requests.get(_url(f"/api/admin/profile-requests?status={status}"), headers=HEADERS))["data"]


def get_profile_payload(request_id: str) -> dict:
    return _check(requests.get(_url(f"/api/admin/profile-requests/{request_id}/payload"), headers=HEADERS))


def claim_profile(request_id: str) -> dict:
    return _check(requests.post(_url(f"/api/admin/profile-requests/{request_id}/claim"), headers=HEADERS))


def start_profile(request_id: str) -> dict:
    return _check(requests.post(_url(f"/api/admin/profile-requests/{request_id}/start"), headers=HEADERS))


def complete_profile(request_id: str, profile_data: dict, run_id: str = "") -> dict:
    return _check(requests.post(_url(f"/api/admin/profile-requests/{request_id}/complete"), headers=HEADERS,
                                json={"profile": profile_data, "run_id": run_id}))


def fail_profile(request_id: str, error_summary: str = "") -> dict:
    return _check(requests.post(_url(f"/api/admin/profile-requests/{request_id}/fail"), headers=HEADERS,
                                json={"error_summary": error_summary}))


# ── User Feedback ────────────────────────────────────

def get_user_feedback_summary(phone: str) -> dict:
    return _check(requests.get(_url(f"/api/admin/users/{phone}/feedback-summary"), headers=HEADERS))
