from PyInstaller.utils.hooks import collect_data_files, get_package_paths
import os
from pathlib import Path

datas = []
binaries = []
hiddenimports = ["misaki"]

try:
    # Get misaki package path
    misaki_pkg_paths = get_package_paths("misaki")
    if misaki_pkg_paths:
        misaki_path = Path(misaki_pkg_paths[0])

        # Manually collect data files to avoid conflicts
        for root, dirs, files in os.walk(misaki_path):
            for file in files:
                if file.endswith(
                    (".json", ".yaml", ".yml", ".txt", ".csv", ".dat", ".bin")
                ):
                    full_path = os.path.join(root, file)
                    # Create proper relative path
                    rel_path = os.path.relpath(root, misaki_path.parent)
                    datas.append((full_path, rel_path))

        print(f"Collected {len(datas)} misaki data files")

except Exception as e:
    print(f"Warning: Could not collect misaki data files: {e}")

    # Fallback: try basic collection
    try:
        fallback_datas = collect_data_files("misaki")
        # Filter out problematic entries
        for src, dst in fallback_datas:
            if not src.endswith(".json/.json"):  # Avoid the duplicate issue
                datas.append((src, dst))
    except Exception as e2:
        print(f"Fallback collection also failed: {e2}")
