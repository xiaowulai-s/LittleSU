#!/bin/bash
set -e

echo "--------------------------------------------------------------------------------"
echo "configure_gradle_signing.sh: signing is handled by apksigner after the build."
echo "Adding Google Cast SDK dependency for native Chromecast support..."
echo "--------------------------------------------------------------------------------"

GRADLE_FILE="src-tauri/gen/android/app/build.gradle.kts"

if [ -f "$GRADLE_FILE" ]; then
  if grep -q "play-services-cast-framework" "$GRADLE_FILE"; then
    echo "Cast SDK dependency already present."
  else
    printf '\ndependencies {\n    implementation("com.google.android.gms:play-services-cast-framework:21.4.0")\n}\n' >> "$GRADLE_FILE"
    echo "Added play-services-cast-framework:21.4.0"
  fi
else
  GROOVY_FILE="$(find src-tauri/gen/android/app -maxdepth 1 -name 'build.gradle' 2>/dev/null | head -n 1)"
  if [ -n "$GROOVY_FILE" ]; then
    if ! grep -q "play-services-cast-framework" "$GROOVY_FILE"; then
      printf "\ndependencies {\n    implementation 'com.google.android.gms:play-services-cast-framework:21.4.0'\n}\n" >> "$GROOVY_FILE"
      echo "Added Cast SDK dependency to $GROOVY_FILE"
    fi
  else
    echo "ERROR: Android Gradle file not found; CastManager.kt would not compile." >&2
    exit 1
  fi
fi

# Keep the script successful; unsigned artifacts are signed in a later step.
exit 0
