#!/usr/bin/env python3
"""
CitePay Clear -- direct REST integration example (Python 3.8+, stdlib only).

Shows the pattern any custom agent loop (LangChain, a hand-rolled
tool-call loop, etc.) should follow: before citing or paying for a quoted
source, call POST /api/clear/check. Only proceed if decision == "CLEARED".

Usage:
    CITEPAY_API_KEY=cpk_... python3 check_before_cite.py
"""

import json
import os
import sys
import urllib.error
import urllib.request

CITEPAY_API = os.environ.get("CITEPAY_API", "https://citepay-markets.vercel.app")
CITEPAY_API_KEY = os.environ.get("CITEPAY_API_KEY")

if not CITEPAY_API_KEY:
    print("Set CITEPAY_API_KEY (a cpk_... key) before running this example.", file=sys.stderr)
    sys.exit(1)


def check_citation(claim: str, quote: str, source: dict, max_price_micro: int = 100_000) -> dict:
    """The reusable integration point. Call this before using a quote, and
    treat any decision other than CLEARED as a hard stop."""
    payload = json.dumps({
        "claim": claim,
        "quote": quote,
        "source": source,
        "policy": {"maxPricePerCitationMicro": max_price_micro, "requiredLicenseClass": "standard"},
        "visibility": "public",
    }).encode("utf-8")

    req = urllib.request.Request(
        f"{CITEPAY_API}/api/clear/check",
        data=payload,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {CITEPAY_API_KEY}",
        },
    )
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as err:
        body = json.loads(err.read())
        raise RuntimeError(f"clear/check failed: HTTP {err.code} - {body.get('error', 'unknown error')}") from err


def cite_if_cleared(label: str, result: dict) -> None:
    """What a real agent should do with the result -- refuse anything not CLEARED."""
    if result["decision"] == "CLEARED":
        print(f"[OK] [{label}] CLEARED -- safe to cite/pay. Receipt: {result['receiptUrl']}")
    else:
        print(f"[BLOCKED] [{label}] {result['decision']} -- refusing to cite. Not paying.")


def main() -> None:
    source = {
        "text": (
            "x402 enables machine-native payments over HTTP. It uses the 402 status "
            "code, previously reserved but unused, to signal that payment is required "
            "before a resource is served."
        ),
        "label": "x402 protocol overview",
    }

    # Case 1: an exact, real quote from the source -- should CLEAR.
    real_quote = check_citation(
        claim="x402 uses the HTTP 402 status code to request payment.",
        quote="x402 enables machine-native payments over HTTP. It uses the 402 status code",
        source=source,
    )
    cite_if_cleared("real quote", real_quote)

    # Case 2: a plausible-sounding but fabricated quote -- should be refused,
    # regardless of how confident an LLM might be that it's "close enough."
    fabricated_quote = check_citation(
        claim="x402 was designed by the HTTP working group in 2019.",
        quote="x402 was designed by the HTTP working group in 2019.",
        source=source,
    )
    cite_if_cleared("fabricated quote", fabricated_quote)


if __name__ == "__main__":
    try:
        main()
    except RuntimeError as e:
        print(str(e), file=sys.stderr)
        sys.exit(1)
