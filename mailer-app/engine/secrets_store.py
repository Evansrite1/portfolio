"""Mailbox passwords. On Windows they are encrypted with DPAPI (only this Windows user on this
machine can decrypt them). They never leave the laptop and are never sent to Vercel or GitHub."""
import base64
import json
import os
import sys

from . import config


def _protect(raw: bytes) -> bytes:
    if sys.platform != "win32":
        return raw  # dev fallback only (tests / non-Windows)
    import ctypes
    from ctypes import wintypes

    class Blob(ctypes.Structure):
        _fields_ = [("cbData", wintypes.DWORD), ("pbData", ctypes.POINTER(ctypes.c_char))]

    buf = ctypes.create_string_buffer(raw, len(raw))
    inb = Blob(len(raw), ctypes.cast(buf, ctypes.POINTER(ctypes.c_char)))
    out = Blob()
    if not ctypes.windll.crypt32.CryptProtectData(ctypes.byref(inb), None, None, None, None, 0, ctypes.byref(out)):
        raise OSError("CryptProtectData failed")
    try:
        return ctypes.string_at(out.pbData, out.cbData)
    finally:
        ctypes.windll.kernel32.LocalFree(out.pbData)


def _unprotect(blob: bytes) -> bytes:
    if sys.platform != "win32":
        return blob
    import ctypes
    from ctypes import wintypes

    class Blob(ctypes.Structure):
        _fields_ = [("cbData", wintypes.DWORD), ("pbData", ctypes.POINTER(ctypes.c_char))]

    buf = ctypes.create_string_buffer(blob, len(blob))
    inb = Blob(len(blob), ctypes.cast(buf, ctypes.POINTER(ctypes.c_char)))
    out = Blob()
    if not ctypes.windll.crypt32.CryptUnprotectData(ctypes.byref(inb), None, None, None, None, 0, ctypes.byref(out)):
        raise OSError("CryptUnprotectData failed")
    try:
        return ctypes.string_at(out.pbData, out.cbData)
    finally:
        ctypes.windll.kernel32.LocalFree(out.pbData)


def _load() -> dict:
    if not os.path.exists(config.SECRETS_PATH):
        return {}
    with open(config.SECRETS_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def set_secret(key: str, value: str) -> None:
    data = _load()
    data[key] = base64.b64encode(_protect(value.encode("utf-8"))).decode("ascii")
    with open(config.SECRETS_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f)


def get_secret(key: str):
    data = _load()
    if key not in data:
        return None
    return _unprotect(base64.b64decode(data[key])).decode("utf-8")


def delete_secret(key: str) -> None:
    data = _load()
    if key in data:
        del data[key]
        with open(config.SECRETS_PATH, "w", encoding="utf-8") as f:
            json.dump(data, f)
