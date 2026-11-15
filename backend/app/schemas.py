from typing import Any
from pydantic import BaseModel, Field


class OnboardingRequest(BaseModel):
    statement_id: str = "DEMO_TILIOTE"
    lang: str = "fi"
    suunta_enabled: bool = True
    monthly_income_eur: float | None = None
    mandatory_regular_eur: float | None = None
    everyday_monthly_eur: float | None = None
    priorities: list[str] = Field(default_factory=lambda: ["Ruokakauppa"])
    cut_from: list[str] = Field(default_factory=list)
    savings_goal_name: str = "Säästää tavoitteeseen"
    savings_goal_monthly_eur: float = 100.0
    savings_goal_target_eur: float | None = None


class ChatRequest(BaseModel):
    statement_id: str = "DEMO_TILIOTE"
    message: str
    lang: str = "fi"


class ApplyPlanRequest(BaseModel):
    statement_id: str = "DEMO_TILIOTE"
    lang: str = "fi"
    plan_id: str
    title: str
    monthly_savings_delta_eur: float = 0.0
    everyday_budget_delta_eur: float = 0.0
    buffer_delta_eur: float = 0.0
    goal_name: str | None = None
    goal_target_eur: float | None = None


class AgentActionCard(BaseModel):
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
    reply: str
    action_cards: list[AgentActionCard] = Field(default_factory=list)
    updated_state: dict[str, Any]