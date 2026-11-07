import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

import os

os.environ["WARMUP"] = "false"  # tests never touch the network, not even a background warm-up
