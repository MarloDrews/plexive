"""What the thumbnail generators are, as data.

A generator is not just a function: to pick one you have to know what image it
produces, when it is the right choice, and what its parameters mean. That
description used to live in three places at once -- a frozenset of allowed keys
in generators.py, a paragraph in the content-structure doc, and the docstrings
in service.py -- so they drifted.

Here it is one GeneratorInfo per generator, and everything else is derived from
it: the key allowlist used to validate a spec, the markdown doc, and the JSON
handed to the model that chooses a generator for a post (see suggest.py). Add a
generator and all three follow.

This module imports nothing from generators.py -- the registry is passed into
the rendering functions -- so the registry can import from here.
"""

import json
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Mapping, Optional, Sequence, Tuple

# Spec value types, named the way JSON names them so the descriptions read the
# same in Python and in the JSON handed to a model.
TYPES = ("string", "number", "integer", "boolean")


@dataclass(frozen=True)
class Param:
    """One key a generator accepts in its spec."""

    name: str
    type: str
    # Written for whoever (or whatever) is filling the spec in: what the value
    # does to the image, not what the code does with it.
    description: str
    required: bool = False
    default: Any = None
    # Allowed values for a string parameter. None means free text.
    choices: Optional[Tuple[str, ...]] = None
    # Inclusive bounds for a number/integer parameter.
    minimum: Optional[float] = None
    maximum: Optional[float] = None

    def as_dict(self) -> Dict[str, Any]:
        """The JSON form. Absent keys mean "no constraint", so they are dropped
        rather than sent as nulls -- a smaller prompt is a clearer prompt."""
        out: Dict[str, Any] = {
            "name": self.name,
            "type": self.type,
            "description": self.description,
        }
        if self.required:
            out["required"] = True
        if self.default is not None:
            out["default"] = self.default
        if self.choices is not None:
            out["choices"] = list(self.choices)
        if self.minimum is not None:
            out["minimum"] = self.minimum
        if self.maximum is not None:
            out["maximum"] = self.maximum
        return out


@dataclass(frozen=True)
class GeneratorInfo:
    """A generator plus everything needed to choose and configure it."""

    name: str
    # What image this produces, in one line.
    summary: str
    # The selection decision, written at whoever is choosing: when this
    # generator is the right answer for a post, and when it is not. Picking no
    # generator at all is always allowed, so when_not_to_use matters as much as
    # its counterpart.
    when_to_use: str
    when_not_to_use: str
    params: Tuple[Param, ...]
    # spec -> PNG bytes.
    render: Callable[[Dict[str, Any]], bytes] = field(compare=False, default=None)  # type: ignore[assignment]
    # Groups where exactly one key must be present, e.g. (("place", "osm_id"),).
    one_of: Tuple[Tuple[str, ...], ...] = ()
    # Hard-won specifics that no parameter description can carry: data sets that
    # resolve a name to the wrong thing, names that must be spelled a certain
    # way. Each entry is one standalone sentence.
    rules: Tuple[str, ...] = ()
    # Real specs that render well. Also serve as the regression fixtures --
    # test_catalog validates every one of them.
    examples: Tuple[Dict[str, Any], ...] = ()

    @property
    def keys(self) -> frozenset:
        """The spec keys this generator accepts."""
        return frozenset(param.name for param in self.params)

    def param(self, name: str) -> Optional[Param]:
        for param in self.params:
            if param.name == name:
                return param
        return None

    def as_dict(self) -> Dict[str, Any]:
        """The JSON form, without the render callable."""
        return {
            "name": self.name,
            "summary": self.summary,
            "when_to_use": self.when_to_use,
            "when_not_to_use": self.when_not_to_use,
            "parameters": [param.as_dict() for param in self.params],
            "one_of": [list(group) for group in self.one_of],
            "rules": list(self.rules),
            "examples": list(self.examples),
        }


def validate_spec(info: GeneratorInfo, spec: Mapping[str, Any]) -> List[str]:
    """Check `spec` against what `info` declares. Returns every problem found.

    Every problem, not the first: the caller shows this list to whoever wrote
    the spec, and a model asked to fix one error at a time takes one round trip
    per mistake.

    "generator" is expected in the spec and not reported as unknown -- it is
    what selected this generator in the first place.
    """
    errors: List[str] = []

    unknown = set(spec) - info.keys - {"generator"}
    for name in sorted(unknown):
        errors.append(f"unknown key {name!r} (allowed: {', '.join(sorted(info.keys))})")

    for param in info.params:
        if param.name not in spec:
            if param.required:
                errors.append(f"missing required key {param.name!r}")
            continue
        errors.extend(_check_value(param, spec[param.name]))

    for group in info.one_of:
        present = [name for name in group if _is_set(spec.get(name))]
        if not present:
            errors.append(f"one of {', '.join(repr(n) for n in group)} is required")
        elif len(present) > 1:
            # EXACTLY one, not at least one. Two keys that answer the same
            # question leave the renderer to pick, and whichever it picks the
            # other one was silently ignored -- a spec that says both `share`
            # and `formula` does not know what it wants, and a spec that pins
            # an `osm_id` while also naming a `place` is very likely a mistake
            # about which of the two is in charge.
            errors.append(
                f"give only one of {', '.join(repr(n) for n in group)}, got "
                f"{', '.join(repr(n) for n in present)}"
            )

    return errors


def _is_set(value: Any) -> bool:
    """A key present but blank does not count as given -- an empty place name
    reaches the geocoder as a lookup for nothing."""
    if value is None:
        return False
    if isinstance(value, str):
        return bool(value.strip())
    return True


def _check_value(param: Param, value: Any) -> List[str]:
    errors: List[str] = []
    where = f"{param.name!r}"

    if param.type == "boolean":
        # Checked before the number branch: bool is a subclass of int in
        # Python, so True would otherwise pass as a valid integer.
        if not isinstance(value, bool):
            return [f"{where} must be true or false, got {value!r}"]
        return errors

    if param.type == "string":
        # A nullable parameter (place/osm_id: give one or the other) is left to
        # the one_of check rather than reported twice.
        if value is None:
            return errors
        if not isinstance(value, str):
            return [f"{where} must be a string, got {value!r}"]
        if param.choices is not None and value not in param.choices:
            return [f"{where} must be one of {', '.join(param.choices)}, got {value!r}"]
        return errors

    if param.type in ("number", "integer"):
        if value is None:
            return errors
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            article = "an" if param.type == "integer" else "a"
            return [f"{where} must be {article} {param.type}, got {value!r}"]
        if param.type == "integer" and not isinstance(value, int):
            return [f"{where} must be a whole number, got {value!r}"]
        if param.minimum is not None and value < param.minimum:
            errors.append(f"{where} must be at least {param.minimum}, got {value!r}")
        if param.maximum is not None and value > param.maximum:
            errors.append(f"{where} must be at most {param.maximum}, got {value!r}")
        return errors

    return [f"{where} has an unsupported declared type {param.type!r}"]


def catalog_json(generators: Mapping[str, GeneratorInfo]) -> List[Dict[str, Any]]:
    """The catalog as plain data -- this is what a model is shown."""
    return [generators[name].as_dict() for name in sorted(generators)]


def catalog_markdown(generators: Mapping[str, GeneratorInfo]) -> str:
    """The catalog as a document, for people."""
    lines = [
        "# Thumbnail generators",
        "",
        "Generated from `backend/app/thumbnails/generators.py` by",
        "`backend/scripts/thumbnail_catalog.py --write-doc`. Do not edit by hand.",
        "",
        "A post JSON's optional top-level `thumbnail` object names one of these in its",
        "`generator` key; every other key is a parameter below. A post that suits none of",
        "them simply has no `thumbnail` object and falls back to the placeholder image.",
        "",
    ]

    for name in sorted(generators):
        info = generators[name]
        lines += [
            f"## `{info.name}`",
            "",
            info.summary,
            "",
            f"**Use it when** {info.when_to_use}",
            "",
            f"**Do not use it when** {info.when_not_to_use}",
            "",
        ]

        for group in info.one_of:
            lines += [f"Exactly one of {_join_code(group)} is required.", ""]

        lines += ["| Key | Type | Default | Values | Meaning |", "|---|---|---|---|---|"]
        for param in info.params:
            values = ", ".join(f"`{c}`" for c in param.choices) if param.choices else _range(param)
            default = "required" if param.required else _cell(param.default)
            lines.append(
                f"| `{param.name}` | {param.type} | {default} | {values or '-'} "
                f"| {param.description} |"
            )
        lines.append("")

        if info.rules:
            lines += ["**Rules**", ""]
            lines += [f"- {rule}" for rule in info.rules]
            lines.append("")

        if info.examples:
            lines += ["**Examples**", "", "```json"]
            for example in info.examples:
                lines.append(json.dumps(example, ensure_ascii=False))
            lines += ["```", ""]

    return "\n".join(lines).rstrip() + "\n"


def _join_code(names: Sequence[str]) -> str:
    return " or ".join(f"`{name}`" for name in names)


def _range(param: Param) -> str:
    if param.minimum is None and param.maximum is None:
        return ""
    low = "" if param.minimum is None else _cell(param.minimum)
    high = "" if param.maximum is None else _cell(param.maximum)
    return f"{low}–{high}"


def _cell(value: Any) -> str:
    if value is None:
        return "-"
    if value == "":
        # An empty-string default is a real value ("no caption"), so it has to
        # look different from "no default at all".
        return '`""`'
    if isinstance(value, bool):
        return "`true`" if value else "`false`"
    if isinstance(value, float) and value.is_integer():
        return f"`{int(value)}`"
    return f"`{value}`"
