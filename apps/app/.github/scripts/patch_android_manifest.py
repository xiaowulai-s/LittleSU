#!/usr/bin/env python3
"""给 Tauri 生成的 AndroidManifest 注入后台播放与 APK 安装所需声明。

脚本可重复执行：已存在的权限与服务声明会被跳过。
"""

from pathlib import Path
import sys

MANIFEST = Path("src-tauri/gen/android/app/src/main/AndroidManifest.xml")

PERMISSIONS = [
    "android.permission.REQUEST_INSTALL_PACKAGES",
    "android.permission.FOREGROUND_SERVICE",
    "android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK",
    "android.permission.POST_NOTIFICATIONS",
    "android.permission.WAKE_LOCK",
]

SERVICE = (
    '<service android:name="com.xiaowulai.littlesu.PlaybackService" '
    'android:exported="false" android:foregroundServiceType="mediaPlayback" />'
)


def main() -> int:
    if not MANIFEST.exists():
        print(f"AndroidManifest not found: {MANIFEST}", file=sys.stderr)
        return 1

    text = MANIFEST.read_text(encoding="utf-8")

    missing = [item for item in PERMISSIONS if item not in text]
    if missing:
        lines = "\n".join(f'    <uses-permission android:name="{item}" />' for item in missing)
        index = text.find("<application")
        if index < 0:
            print("Cannot find <application> in AndroidManifest", file=sys.stderr)
            return 1
        text = text[:index] + lines + "\n" + text[index:]

    if "PlaybackService" not in text:
        index = text.rfind("</application>")
        if index < 0:
            print("Cannot find </application> in AndroidManifest", file=sys.stderr)
            return 1
        text = text[:index] + f"        {SERVICE}\n" + text[index:]

    MANIFEST.write_text(text, encoding="utf-8")
    print(f"Patched {MANIFEST}")
    print(text)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
