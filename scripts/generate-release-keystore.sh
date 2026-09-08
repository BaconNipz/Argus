#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
KEYSTORE_PATH="${1:-$ROOT_DIR/native-android/keystore/argus-release.jks}"
KEY_ALIAS="${ARGUS_KEY_ALIAS:-argus-release}"
STORE_PASSWORD="${ARGUS_KEYSTORE_PASSWORD:-}"
KEY_PASSWORD="${ARGUS_KEY_PASSWORD:-$STORE_PASSWORD}"

if [[ -z "$STORE_PASSWORD" ]]; then
  echo "Set ARGUS_KEYSTORE_PASSWORD before running this script."
  echo "Example: ARGUS_KEYSTORE_PASSWORD='long private password' bash scripts/generate-release-keystore.sh"
  exit 1
fi

if [[ -e "$KEYSTORE_PATH" ]]; then
  echo "Keystore already exists: $KEYSTORE_PATH"
  echo "Move it somewhere safe or pass a different output path if you really need another key."
  exit 1
fi

mkdir -p "$(dirname "$KEYSTORE_PATH")"

keytool -genkeypair \
  -v \
  -keystore "$KEYSTORE_PATH" \
  -storepass "$STORE_PASSWORD" \
  -alias "$KEY_ALIAS" \
  -keypass "$KEY_PASSWORD" \
  -keyalg RSA \
  -keysize 4096 \
  -validity 10000 \
  -dname "CN=Argus Release, OU=Argus, O=BaconNipz, L=Adelaide, ST=South Australia, C=AU"

base64_no_wrap() {
  if base64 --help 2>/dev/null | grep -q -- "-w"; then
    base64 -w0 "$1"
  else
    base64 "$1" | tr -d '\n'
  fi
}

echo
echo "Created private release keystore:"
echo "$KEYSTORE_PATH"
echo
echo "Add these GitHub Actions secrets to BaconNipz/Argus:"
echo "ARGUS_KEYSTORE_BASE64=$(base64_no_wrap "$KEYSTORE_PATH")"
echo "ARGUS_KEYSTORE_PASSWORD=$STORE_PASSWORD"
echo "ARGUS_KEY_ALIAS=$KEY_ALIAS"
echo "ARGUS_KEY_PASSWORD=$KEY_PASSWORD"
echo
echo "Keep the .jks file and passwords backed up privately. Losing them means future updates cannot install over old signed releases."
