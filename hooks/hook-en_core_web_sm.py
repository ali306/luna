from PyInstaller.utils.hooks import collect_all, collect_data_files

datas, binaries, hiddenimports = collect_all("en_core_web_sm")

try:
    additional_datas = collect_data_files("en_core_web_sm")
    datas.extend(additional_datas)
except OSError:
    pass
