from pathlib import Path
import modal

ROOT_DIR = Path(__file__).parent

image = (
    modal.Image.debian_slim(python_version="3.12")
    .pip_install_from_requirements(str(ROOT_DIR / "backend" / "requirements.txt"))
    .add_local_dir(
        str(ROOT_DIR / "backend"),
        remote_path="/root/project/backend",
        ignore=["**/__pycache__", "**/.env", "**/app_state.json"],
    )
    .add_local_dir(
        str(ROOT_DIR / "frontend"),
        remote_path="/root/project/frontend",
    )
)

app = modal.App("suunta-demo", image=image)


@app.function(
    secrets=[modal.Secret.from_name("suunta-secrets")],
    max_containers=1,          # Kaikki käyttäjät samassa kontissa -> muistissa oleva istuntotila säilyy
    scaledown_window=300,      # Pysyy lämpimänä 5 min käytön jälkeen, sitten 0 €/h lepotilaan
)
@modal.concurrent(max_inputs=50)  # Jopa 50 samanaikaista pyyntöä rinnakkain
@modal.asgi_app()
def web():
    import sys
    sys.path.insert(0, "/root/project/backend")
    from app.main import app as fastapi_app

    return fastapi_app