"""Prepare an isolated local stack without opening any .env files.

Run with backend/.venv/bin/python scripts/prepare_local_stack.py.
Build contexts contain an explicit allowlist of sources, never host dependencies.
The generated configuration and local credentials live in ignored handoffs/.
"""

import json
import re
import secrets
import shutil
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "handoffs" / "local-stack"
OUT.mkdir(parents=True, exist_ok=True)
credentials = OUT / "credentials.json"

if credentials.exists():
    values = json.loads(credentials.read_text())
else:
    values = {
        "POSTGRES_USER": "postgres",
        "POSTGRES_PASSWORD": secrets.token_hex(16),
        "POSTGRES_DB": "postgres",
        "JWT_SECRET": secrets.token_hex(32),
        "ENCRYPTION_KEY": secrets.token_hex(32),
        "NEXTAUTH_SECRET": secrets.token_hex(32),
        "SALT": secrets.token_hex(16),
        "TELEMETRY_ENABLED": "false",
        "NEXT_PUBLIC_API_URL": "/api",
    }
    credentials.write_text(json.dumps(values, indent=2))
    credentials.chmod(0o600)


def expand(value):
    if isinstance(value, str):

        def replace(match):
            key, _, default = match.group(1).partition(":-")
            return values.get(key, default)

        return re.sub(r"\$\{([^}]+)\}", replace, value)
    if isinstance(value, list):
        return [expand(v) for v in value]
    if isinstance(value, dict):
        return {k: expand(v) for k, v in value.items()}
    return value


for folder, names in {
    "backend": [
        "src",
        "utils",
        "main.py",
        "logging.ini",
        "pyproject.toml",
        "uv.lock",
        "README.md",
        ".dockerignore",
        "docker/Dockerfile",
    ],
    "frontend": [
        "src",
        "public",
        "package.json",
        "package-lock.json",
        "next.config.mjs",
        "tsconfig.json",
        "next-env.d.ts",
        "tailwind.config.ts",
        "postcss.config.mjs",
        ".eslintrc.json",
        ".dockerignore",
        "docker/Dockerfile",
    ],
}.items():
    destination = OUT / folder
    destination.mkdir(exist_ok=True)
    for name in names:
        source, target = ROOT / folder / name, destination / name
        if not source.exists():
            continue
        if source.is_dir():
            shutil.copytree(
                source,
                target,
                dirs_exist_ok=True,
                ignore=shutil.ignore_patterns(
                    "*.env*", "__pycache__", "node_modules", ".venv"
                ),
            )
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, target)

merged = {
    "services": {},
    "volumes": {},
    "networks": {"app_network": {"driver": "bridge"}},
}
for folder, name in [
    ("backend", "docker-compose.yaml"),
    ("frontend", "docker-compose.yaml"),
    ("docker", "docker-compose.yml"),
]:
    data = expand(yaml.safe_load((ROOT / folder / name).read_text()))
    for service_name, service in data["services"].items():
        service.pop("env_file", None)
        service.pop("container_name", None)
        service.pop("ports", None)
        if service_name == "nginx":
            service["ports"] = ["127.0.0.1:8080:80"]
        for i, volume in enumerate(service.get("volumes", [])):
            if isinstance(volume, str) and volume.startswith("./"):
                source, rest = volume.split(":", 1)
                service["volumes"][i] = str(ROOT / folder / source) + ":" + rest
        if "build" in service:
            service["build"]["context"] = str(OUT / folder)
        if service_name in ("backend", "celery_worker"):
            service["environment"]["PYTHON_DOTENV_DISABLED"] = "1"
            service["environment"]["A2A_BASE_URL"] = "http://localhost:8080/api"
            # No external calls without explicitly configured provider credentials.
            service["environment"].pop("OPENAI_API_KEY", None)
            service["environment"].pop("TAVILY_API_KEY", None)
        merged["services"][service_name] = service
    merged["volumes"].update(data.get("volumes", {}))
config = OUT / "compose.yaml"
config.write_text(yaml.safe_dump(merged, sort_keys=False))
config.chmod(0o600)
print(f"Prepared {len(merged['services'])} services: {config}")
print(
    "Start: docker compose --env-file /dev/null -p bassoon-local -f handoffs/local-stack/compose.yaml up -d --build"
)
print("Open: http://localhost:8080")
