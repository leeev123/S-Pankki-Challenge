from typing import Any, Literal
from pydantic import BaseModel, Field


class OnboardingRequest(BaseModel):
    """Käyttöönotossa lähetettävät käyttäjän arvot, leikkauskohteet ja S-AI:n aktivointitila."""
    customer_id: str = "CUST_ANNI"
    s_ai_enabled: bool = True
    monthly_income_eur: float | None = None
    priorities: list[str] = Field(default_factory=lambda: ["Laadukas arkiruoka", "Säästäminen"])
    cut_from: list[str] = Field(default_factory=lambda: ["Kahvilat", "Noutoruoka"])
    savings_goal_name: str = "Puskuri & Läppäri"
    savings_goal_monthly_eur: float = 250.0


class ChatRequest(BaseModel):
    """Käyttäjän chat-viesti backendille."""
    customer_id: str = "CUST_ANNI"
    message: str


class ApplyPlanRequest(BaseModel):
    """Kun käyttäjä hyväksyy AI:n ehdottaman budjettivaihtoehdon."""
    customer_id: str = "CUST_ANNI"
    plan_id: str
    title: str
    monthly_savings_delta_eur: float = 0.0
    everyday_budget_delta_eur: float = 0.0
    buffer_delta_eur: float = 0.0
    goal_name: str | None = None
    goal_target_eur: float | None = None


class AgentActionCard(BaseModel):
    """Chat-kuplan sisällä näytettävä toimintokortti ('Hyväksy suunnitelma')."""
    plan_id: str
    title: str
    summary: str
    impact_weekly_eur: float
    impact_savings_months: int | None = None
    monthly_savings_delta_eur: float = 0.0
    everyday_budget_delta_eur: float = 0.0
    buffer_delta_eur: float = 0.0
    goal_name: str | None = None
    goal_target_eur: float | None = None


class ChatResponse(BaseModel):
    """API:n vastaus chat-viestiin."""
    reply: str
    action_cards: list[AgentActionCard] = Field(default_factory=list)
    updated_state: dict[str, Any]