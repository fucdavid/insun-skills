from __future__ import annotations

import importlib
import json
from dataclasses import dataclass
from pathlib import Path


@dataclass
class LayoutMeta:
    name: str
    aliases: list[str]
    module: str
    owns_title: bool = False
    clear_template_sample_text: bool = False


class LayoutRegistry:
    def __init__(self, skill_dir: Path):
        self.skill_dir = skill_dir
        self._loaded = False
        self._layouts: dict[str, LayoutMeta] = {}
        self._aliases: dict[str, str] = {}

    def _load(self):
        if self._loaded:
            return
        registry_path = self.skill_dir / "layouts" / "registry.json"
        data = json.loads(registry_path.read_text(encoding="utf-8"))
        for item in data.get("layouts", []):
            if item.get("status", "ready") != "ready":
                continue
            if item.get("fidelity") not in {None, "accepted", "ppt_exact"}:
                continue
            name = item["name"]
            aliases = item.get("aliases", [])
            meta = LayoutMeta(
                name=name,
                aliases=aliases,
                module=item.get("module") or name,
                owns_title=bool(item.get("owns_title", False)),
                clear_template_sample_text=bool(item.get("clear_template_sample_text", False)),
            )
            self._layouts[name] = meta
            self._aliases[name] = name
            for alias in aliases:
                self._aliases[alias] = name
        self._loaded = True

    def normalize(self, layout: str | None) -> str:
        self._load()
        layout = layout or "auto"
        return self._aliases.get(layout, layout)

    def get(self, layout: str | None) -> LayoutMeta | None:
        self._load()
        return self._layouts.get(self.normalize(layout))

    def load_renderer(self, layout: str):
        meta = self.get(layout)
        if not meta:
            return None
        return importlib.import_module(f"layouts_impl.{meta.module}")
