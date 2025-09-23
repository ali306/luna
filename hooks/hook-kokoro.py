from PyInstaller.utils.hooks import collect_all, collect_data_files, get_package_paths

datas, binaries, hiddenimports = collect_all("kokoro")

try:
    misaki_datas, misaki_binaries, misaki_hiddenimports = collect_all("misaki")
    datas.extend(misaki_datas)
    binaries.extend(misaki_binaries)
    hiddenimports.extend(misaki_hiddenimports)
except:
    pass

additional_packages = ["phonemizer", "gruut", "epitran", "panphon"]
for pkg in additional_packages:
    try:
        pkg_datas = collect_data_files(pkg)
        datas.extend(pkg_datas)
    except:
        pass

import os
from pathlib import Path


def find_tts_data_files():
    """Find common TTS data file patterns"""
    additional_datas = []

    # Common locations for TTS data
    try:
        import kokoro

        kokoro_path = Path(kokoro.__file__).parent

        # Look for data directories
        for pattern in ["data", "voices", "models", "assets"]:
            data_dir = kokoro_path / pattern
            if data_dir.exists():
                additional_datas.append((str(data_dir), f"kokoro/{pattern}"))
    except:
        pass

    # Look for misaki data
    try:
        import misaki

        misaki_path = Path(misaki.__file__).parent

        for pattern in ["data", "voices", "models", "assets"]:
            data_dir = misaki_path / pattern
            if data_dir.exists():
                additional_datas.append((str(data_dir), f"misaki/{pattern}"))
    except:
        pass

    return additional_datas


datas.extend(find_tts_data_files())
