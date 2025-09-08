import os
from dotenv import load_dotenv
from app import create_app

load_dotenv()  # Load variables from .env

app = create_app()

if __name__ == "__main__":
    debug_mode = os.environ.get("FLASK_DEBUG", "0") == "1"
    app.run(debug=debug_mode)