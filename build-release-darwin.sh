#!/bin/bash

export MACOSX_DEPLOYMENT_TARGET=10.15
export CMAKE_OSX_DEPLOYMENT_TARGET=10.15
export CXXFLAGS="-mmacosx-version-min=10.15"

pnpm tauri build
