#!/usr/bin/env python3
"""给 Tauri 生成的 AndroidManifest 注入后台播放与 APK 安装所需声明。

脚本可重复执行：已存在的权限与服务声明会被跳过。
"""

from pathlib import Path
import re
import sys

MANIFEST = Path("src-tauri/gen/android/app/src/main/AndroidManifest.xml")

PERMISSIONS = [
    "android.permission.INTERNET",
    "android.permission.ACCESS_NETWORK_STATE",
    "android.permission.ACCESS_WIFI_STATE",
    "android.permission.CHANGE_WIFI_MULTICAST_STATE",
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

EPG_RECEIVER = (
    '<receiver android:name="com.xiaowulai.littlesu.EpgReminderReceiver" '
    'android:exported="false" />'
)

CAST_META = (
    '<meta-data android:name="com.google.android.gms.cast.framework.OPTIONS_PROVIDER_CLASS_NAME" '
    'android:value="com.xiaowulai.littlesu.CastOptionsProvider" />'
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

    if "EpgReminderReceiver" not in text:
        index = text.rfind("</application>")
        if index < 0:
            print("Cannot find </application> in AndroidManifest", file=sys.stderr)
            return 1
        text = text[:index] + f"        {EPG_RECEIVER}\n" + text[index:]

    if "OPTIONS_PROVIDER_CLASS_NAME" not in text:
        index = text.rfind("</application>")
        if index < 0:
            print("Cannot find </application> in AndroidManifest", file=sys.stderr)
            return 1
        text = text[:index] + f"        {CAST_META}\n" + text[index:]

    # 后台播放依赖系统画中画，需要给 MainActivity 打开 supportsPictureInPicture。
    if "supportsPictureInPicture" not in text:
        for pattern in (
            r'(<activity[^>]*android:name="\.MainActivity")',
            r'(<activity[^>]*android:name="[^"]*\.MainActivity")',
        ):
            if re.search(pattern, text):
                text = re.sub(
                    pattern,
                    r'\1 android:supportsPictureInPicture="true"',
                    text,
                    count=1,
                )
                print("Enabled picture-in-picture on MainActivity")
                break
        else:
            print("WARNING: MainActivity activity not found; PiP is unavailable", file=sys.stderr)

    # DLNA 的 SSDP/设备描述和控制请求走局域网 http，需要允许 cleartext。
    if "usesCleartextTraffic" not in text:
        if re.search(r"<application\b", text):
            text = re.sub(
                r"<application\b",
                '<application android:usesCleartextTraffic="true"',
                text,
                count=1,
            )
            print("Enabled cleartext traffic for DLNA")

    MANIFEST.write_text(text, encoding="utf-8")
    print(f"Patched {MANIFEST}")
    print(text)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
