import os
import json
import re
from pathlib import Path
from typing import Dict, Any, List
from dotenv import load_dotenv
from pydantic import BaseModel, Field

# Load .env securely
_env_path = Path(__file__).resolve().parent.parent / ".env"
if _env_path.exists():
    load_dotenv(dotenv_path=_env_path)
load_dotenv()  # Fallback to root or environment

class AIAnalysisResult(BaseModel):
    risk_level: str = Field(description="Must be LOW, MEDIUM, or HIGH")
    risk_reasons: List[str] = Field(description="2-4 concise bullet points explaining risk assessment")
    budget_context: str = Field(description="Explain whether expense is small, normal, or significant relative to department's available budget")
    potential_anomalies: List[str] = Field(default_factory=list, description="List unusual patterns, threshold breaches, or duplicate indicators if present")
    recommendation: str = Field(description="Short, actionable guidance for the human approver")

def get_api_key() -> str:
    key = os.environ.get("GEMINI_API_KEY", "").strip()
    if not key or key in ("YOUR_KEY_HERE", "YOUR_GEMINI_API_KEY", "your_key_here"):
        raise ValueError("Gemini API key is not configured.")
    return key

def analyze_expense(claim_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Analyzes an expense claim using Google Gemini.
    Returns structured risk evaluation and budget anomaly insights.
    """
    api_key = get_api_key()

    from google import genai
    from google.genai import types

    # Initialize Gemini client with backend-only key
    client = genai.Client(api_key=api_key)

    # Build concise, privacy-safe payload for Gemini
    prompt_payload = {
        "claim_number": claim_data.get("claim_number"),
        "title": claim_data.get("title"),
        "department": claim_data.get("department_name"),
        "total_amount": claim_data.get("total_amount"),
        "currency": claim_data.get("currency", "USD"),
        "business_justification": claim_data.get("business_justification"),
        "is_high_value": claim_data.get("is_high_value"),
        "high_value_reason": claim_data.get("high_value_reason"),
        "department_threshold": claim_data.get("high_value_threshold"),
        "department_budget": {
            "allocated": claim_data.get("allocated_amount"),
            "spent": claim_data.get("spent_amount"),
            "reserved": claim_data.get("reserved_amount"),
            "available_headroom": claim_data.get("available_headroom"),
            "quarter": claim_data.get("quarter", 3),
            "fiscal_year": claim_data.get("fiscal_year", 2026),
        },
        "expense_items": [
            {
                "category": item.get("category_name"),
                "merchant": item.get("merchant_name"),
                "date": item.get("item_date"),
                "amount": item.get("amount"),
                "tax": item.get("tax_amount"),
                "notes": item.get("notes")
            }
            for item in claim_data.get("items", [])
        ],
        "potential_duplicates_detected": claim_data.get("duplicate_alerts", [])
    }

    prompt = f"""You are an expert Enterprise Expense Risk & Audit Assistant.
Analyze the following expense claim data and assess financial risk for human management review.

STRICT INSTRUCTIONS:
1. You are an ASSISTANT only. You do NOT approve or reject expenses; final authority belongs to the authorized human reviewer.
2. Use ONLY the information provided. Do NOT assume facts that are not present.
3. If there is insufficient evidence for an anomaly, state so or provide an empty list.
4. Return ONLY a valid JSON object matching the exact schema specified below.

CLAIM DATA:
{json.dumps(prompt_payload, indent=2)}

OUTPUT FORMAT (JSON ONLY, no markdown fences, no extra text):
{{
  "risk_level": "LOW", // Exactly one of: "LOW", "MEDIUM", "HIGH"
  "risk_reasons": [
    "Concise point 1",
    "Concise point 2"
  ],
  "budget_context": "Explain whether the expense is small, normal, or significant relative to the department's remaining available budget headroom.",
  "potential_anomalies": [
    "Unusual characteristic or duplicate risk if supported by the data"
  ],
  "recommendation": "Short recommendation for the human approver."
}}
"""

    try:
        # Request JSON structured output from Gemini
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                temperature=0.2,
            )
        )

        response_text = response.text.strip()
        # Clean potential markdown wrapping if present
        if response_text.startswith("```"):
            response_text = re.sub(r"^```(?:json)?\n?", "", response_text)
            response_text = re.sub(r"\n?```$", "", response_text)

        parsed = json.loads(response_text)

        # Validate with Pydantic model
        validated = AIAnalysisResult(
            risk_level=parsed.get("risk_level", "MEDIUM").upper(),
            risk_reasons=parsed.get("risk_reasons", ["Review required."]),
            budget_context=parsed.get("budget_context", "Budget impact requires review."),
            potential_anomalies=parsed.get("potential_anomalies", []),
            recommendation=parsed.get("recommendation", "Review claim details before approving.")
        )

        # Ensure risk level is strictly one of LOW, MEDIUM, HIGH
        if validated.risk_level not in ("LOW", "MEDIUM", "HIGH"):
            validated.risk_level = "MEDIUM"

        return validated.model_dump()

    except Exception as e:
        # Fallback to gemini-1.5-flash if 2.5-flash is temporarily unavailable
        if "not found" in str(e).lower() or "model" in str(e).lower():
            try:
                response = client.models.generate_content(
                    model="gemini-1.5-flash",
                    contents=prompt,
                    config=types.GenerateContentConfig(response_mime_type="application/json", temperature=0.2)
                )
                parsed = json.loads(response.text.strip())
                validated = AIAnalysisResult(
                    risk_level=parsed.get("risk_level", "MEDIUM").upper(),
                    risk_reasons=parsed.get("risk_reasons", []),
                    budget_context=parsed.get("budget_context", ""),
                    potential_anomalies=parsed.get("potential_anomalies", []),
                    recommendation=parsed.get("recommendation", "")
                )
                return validated.model_dump()
            except Exception as e2:
                raise RuntimeError(f"Gemini API analysis failed: {str(e2)}")

        raise RuntimeError(f"Gemini API analysis failed: {str(e)}")
