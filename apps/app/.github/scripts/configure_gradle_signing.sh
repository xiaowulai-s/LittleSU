#!/bin/bash
set -e

echo "--------------------------------------------------------------------------------"
echo "configure_gradle_signing.sh: Intentionally NOT modifying build.gradle.kts."
echo "The build process will rely on Gradle producing unsigned release artifacts."
echo "A subsequent step will use apksigner for signing."
echo "--------------------------------------------------------------------------------"

# Ensure the script exits successfully
exit 0
