#!/usr/bin/env bash
if [ "${VITE_NEXUS_USE_MODULE_PROXY:-}" = "1" ]; then
  export VITE_NEXUS_API_URL=
  echo "Nexus build: proxy del módulo → 127.0.0.1:3092"
elif [ -n "${VITE_NEXUS_API_URL:-}" ]; then
  echo "Nexus build: VITE_NEXUS_API_URL=${VITE_NEXUS_API_URL}"
else
  export VITE_NEXUS_API_URL="${NEXUS_PUBLIC_ORIGIN:-https://cierrelmds.exelixitech.com}/nexus-api"
  echo "Nexus build: VITE_NEXUS_API_URL=${VITE_NEXUS_API_URL}"
fi
