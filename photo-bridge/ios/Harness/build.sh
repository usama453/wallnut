#!/bin/sh
# Runtime harness: codec + SessionStore + sleep/wake connection tests on macOS.
# Verifies the iOS sources compile and behave correctly without an iOS device.
set -e
cd "$(dirname "$0")"
swiftc -target arm64-apple-macos14.0 -o harness \
  ../PhotoBridge/Core/Protocol.swift \
  ../PhotoBridge/Core/Hash.swift \
  ../PhotoBridge/Core/Logger.swift \
  ../PhotoBridge/Engine/SessionStore.swift \
  ../PhotoBridge/Discovery/DeviceDiscovery.swift \
  ../PhotoBridge/Connection/DeviceConnection.swift \
  main.swift -lsqlite3
./harness
