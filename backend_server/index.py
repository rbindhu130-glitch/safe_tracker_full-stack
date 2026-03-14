import sys
import os
from pathlib import Path

# Add the project root to sys.path so we can import 'backend'
root_path = Path(__file__).resolve().parent.parent
if str(root_path) not in sys.path:
    sys.path.append(str(root_path))

# Also add backend to sys.path to resolve 'api' imports if they were relative to backend
backend_path = root_path / "backend"
if str(backend_path) not in sys.path:
    sys.path.append(str(backend_path))

from backend.api.index import app
