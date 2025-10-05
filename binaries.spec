import os
import sys
from pathlib import Path

block_cipher = None

current_dir = Path.cwd()

def find_package_path(package_name):
    """Find the path to a Python package"""
    try:
        import importlib.util
        spec = importlib.util.find_spec(package_name)
        if spec and spec.origin:
            return Path(spec.origin).parent
    except ImportError:
        pass
    return None

espeakng_loader_path = find_package_path('espeakng_loader')

kokoro_path = find_package_path('kokoro')
misaki_path = find_package_path('misaki')

spacy_models = []
try:
    import spacy
    import en_core_web_sm
    spacy_model_path = en_core_web_sm.__path__[0]
    spacy_models.append((spacy_model_path, 'en_core_web_sm'))
    print(f"Found spaCy model en_core_web_sm at: {spacy_model_path}")
except ImportError:
    print("Warning: en_core_web_sm not found - you may need to install it with: python -m spacy download en_core_web_sm")
except Exception as e:
    print(f"Warning: Could not locate spaCy model: {e}")

espeak_data_path = None

if espeakng_loader_path:
    pkg_espeak_path = espeakng_loader_path / 'espeak-ng-data'
    if pkg_espeak_path.exists():
        espeak_data_path = str(pkg_espeak_path)
        print(f"Found espeak-ng-data in package at: {espeak_data_path}")

if not espeak_data_path:
    possible_espeak_paths = [
        "/usr/share/espeak-ng-data",
        "/usr/local/share/espeak-ng-data", 
        "/opt/homebrew/share/espeak-ng-data",
        "/usr/share/espeak-data",
        "/usr/local/share/espeak-data",
        "/opt/homebrew/share/espeak-data",
    ]
    
    for path in possible_espeak_paths:
        if Path(path).exists():
            espeak_data_path = path
            print(f"Found espeak-ng-data at system path: {espeak_data_path}")
            break

whisper_path = find_package_path('whisper')
language_tags_path = find_package_path('language_tags')

datas = [
    ('src/index.html', '.'),
]

if whisper_path and (whisper_path / 'assets').exists():
    datas.append((str(whisper_path / 'assets'), 'whisper/assets'))
    print(f"Found whisper assets at: {whisper_path / 'assets'}")
else:
    print("Warning: whisper assets not found")

if language_tags_path and (language_tags_path / 'data').exists():
    datas.append((str(language_tags_path / 'data'), 'language_tags/data'))
    print(f"Found language_tags data at: {language_tags_path / 'data'}")
else:
    print("Warning: language_tags data not found")

if kokoro_path:
    # Include individual data files to avoid directory conflicts
    kokoro_data_path = kokoro_path / 'data'
    if kokoro_data_path.exists():
        # Add individual files instead of the whole directory
        for file_path in kokoro_data_path.rglob('*'):
            if file_path.is_file():
                rel_path = file_path.relative_to(kokoro_path.parent)
                datas.append((str(file_path), str(rel_path.parent)))
        print(f"Found Kokoro data files at: {kokoro_data_path}")
    
    # Include other Kokoro assets carefully
    for subdir in ['assets', 'models', 'voices', 'configs']:
        kokoro_subdir = kokoro_path / subdir
        if kokoro_subdir.exists():
            for file_path in kokoro_subdir.rglob('*'):
                if file_path.is_file():
                    rel_path = file_path.relative_to(kokoro_path.parent)
                    datas.append((str(file_path), str(rel_path.parent)))
            print(f"Found Kokoro {subdir} files at: {kokoro_subdir}")

if misaki_path:
    misaki_data_path = misaki_path / 'data'
    if misaki_data_path.exists():
        # Add specific known files to avoid directory conflicts
        known_files = ['us_gold.json', 'gb_gold.json', 'ca_gold.json', 'au_gold.json']
        for filename in known_files:
            file_path = misaki_data_path / filename
            if file_path.exists():
                datas.append((str(file_path), 'misaki/data'))
                print(f"Added misaki data file: {filename}")
        
        # Also add any other JSON files found
        for json_file in misaki_data_path.glob('*.json'):
            if json_file.name not in known_files:  # Avoid duplicates
                datas.append((str(json_file), 'misaki/data'))
                print(f"Added additional misaki file: {json_file.name}")
        
        # Add other file types
        for pattern in ['*.yaml', '*.yml', '*.txt', '*.csv', '*.dat']:
            for file_path in misaki_data_path.glob(pattern):
                datas.append((str(file_path), 'misaki/data'))
                print(f"Added misaki file: {file_path.name}")
    
    # Include other potential Misaki files
    for subdir in ['assets', 'models', 'voices']:
        misaki_subdir = misaki_path / subdir
        if misaki_subdir.exists():
            for file_path in misaki_subdir.rglob('*'):
                if file_path.is_file():
                    rel_dir = f"misaki/{subdir}"
                    if file_path.parent != misaki_subdir:
                        # Preserve subdirectory structure
                        subpath = file_path.relative_to(misaki_subdir)
                        rel_dir = f"misaki/{subdir}/{subpath.parent}" if subpath.parent != Path('.') else f"misaki/{subdir}"
                    datas.append((str(file_path), rel_dir))
            print(f"Added Misaki {subdir} files")

for model_path, model_name in spacy_models:
    datas.append((model_path, model_name))

if espeak_data_path:
    # Bundle to the path that Kokoro expects: espeakng_loader/espeak-ng-data
    datas.append((espeak_data_path, 'espeakng_loader/espeak-ng-data'))
    print(f"Bundling espeak-ng-data from {espeak_data_path} to espeakng_loader/espeak-ng-data")
else:
    print("Warning: espeak-ng-data not found")

a = Analysis(
    ['src-python/main.py'],
    pathex=[],
    binaries=[],
    datas=datas,
    hiddenimports=[
        'whisper',
        'numpy',
        'scipy',
        'scipy.signal',
        'soundfile',
        'aiohttp',
        'uvicorn',
        'fastapi',
        'pydantic',
        'pygame',
        'language_tags',
        'kokoro',
        'misaki',  # Add misaki
        'espeakng_loader',
        'spacy',
        'en_core_web_sm',
        'tiktoken',
        'regex',
        'requests',
        'yaml',
        'packaging',
        'tokenizers',
        'safetensors',
        'accelerate',
        'bitsandbytes',
        'sentencepiece',
        'protobuf',
        'huggingface_hub',
        'filelock',
        'fsspec',
        'typing_extensions',
        'psutil',
        'setuptools',
        'wheel',
        'pip',
        'pkg_resources',
        # Additional Kokoro-related packages
        'phonemizer',
        'gruut',
        'epitran',
        'panphon',
    ],
    hookspath=['./hooks'],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name='main-x86_64-apple-darwin',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    # FIX: Prevent multiprocessing from spawning duplicate processes
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)