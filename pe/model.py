"""Model access. Agents call draft(); routine calls are charged to the 'model' budget,
which the user configures once. No key or no budget means the template fallback is used.
"""
import os

from .approvals import BudgetExceeded, charge
from .untrusted import fence

EST_COST_PER_CALL = 0.02


class TemplateModel:
    name = "template"

    def draft(self, conn, system, user, idem_key):
        return None  # caller falls back to its template


class ClaudeModel:
    name = "claude"

    def __init__(self, model="claude-sonnet-5-5"):
        import anthropic  # optional dependency
        self.client = anthropic.Anthropic()
        self.model = model

    def draft(self, conn, system, user, idem_key):
        try:
            charge(conn, "model", EST_COST_PER_CALL, f"model:{idem_key}")
        except BudgetExceeded:
            return None
        msg = self.client.messages.create(model=self.model, max_tokens=800, system=system,
                                          messages=[{"role": "user", "content": user}])
        return msg.content[0].text


def get_model():
    if os.environ.get("ANTHROPIC_API_KEY"):
        try:
            return ClaudeModel()
        except ImportError:
            pass
    return TemplateModel()


__all__ = ["get_model", "fence"]
