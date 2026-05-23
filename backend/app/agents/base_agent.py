"""
Base agent — wraps Ollama calls with structured prompting.
Falls back to a simple heuristic response if Ollama is unavailable.
"""
import json
import httpx
from typing import Any, Optional
from app.config import settings


class BaseAgent:
    name: str = "BaseAgent"
    model: str = None  # uses settings.OLLAMA_MODEL by default

    def __init__(self):
        self.model = self.model or settings.OLLAMA_MODEL
        self.ollama_host = settings.OLLAMA_HOST

    async def _call_llm(self, prompt: str, system: str = "", json_mode: bool = False) -> str:
        payload = {
            "model": self.model,
            "prompt": prompt,
            "system": system,
            "stream": False,
            "options": {"temperature": 0.3, "num_predict": 2048},
        }
        if json_mode:
            payload["format"] = "json"

        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                response = await client.post(
                    f"{self.ollama_host}/api/generate",
                    json=payload,
                )
                response.raise_for_status()
                data = response.json()
                return data.get("response", "")
        except httpx.ConnectError:
            return self._fallback_response(prompt)
        except Exception as e:
            return f'{{"error": "LLM call failed: {e}"}}'

    def _fallback_response(self, prompt: str) -> str:
        """Returns a minimal valid JSON response when Ollama is offline."""
        return json.dumps({
            "summary": "AI analysis unavailable (Ollama not running). Please start Ollama.",
            "recommendations": [],
            "tasks": [],
            "score": 0,
        })

    def _parse_json_response(self, text: str) -> dict:
        try:
            start = text.find("{")
            end = text.rfind("}") + 1
            if start >= 0 and end > start:
                return json.loads(text[start:end])
        except Exception:
            pass
        return {}

    async def analyze(self, data: Any) -> dict:
        raise NotImplementedError
