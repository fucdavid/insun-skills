from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path


DEFAULT_FONT = "Microsoft YaHei"


@dataclass
class RenderContext:
    skill_dir: Path
    template_path: Path
    tokens: dict = field(default_factory=dict)

    def token(self, name: str, default: str) -> str:
        value = self.tokens.get(name, default)
        return str(value).replace("#", "") if value else default

    def font_for(self, role: str = "body") -> str:
        if role == "title":
            return self.token("font_title", self.token("font_body", DEFAULT_FONT))
        if role == "number":
            return self.token("font_number", self.token("font_body", DEFAULT_FONT))
        return self.token("font_body", DEFAULT_FONT)

    def palette(self) -> list[str]:
        primary = self.token("primary_color", "093BAA")
        secondary = self.token("secondary_color", self.token("accent_color", "2DBCEB"))
        accent = self.token("accent_color", primary)
        success = self.token("success_color", "10A875")
        warning = self.token("warning_color", "F28C28")
        return [primary, secondary, success, warning, primary]

