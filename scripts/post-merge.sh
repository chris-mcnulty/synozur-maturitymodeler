#!/bin/bash
set -e
npm install --no-audit --no-fund --prefer-offline
npm run db:push
