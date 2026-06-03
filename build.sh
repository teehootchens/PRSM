#!/bin/bash
set -e
cd /opt/PRSM/frontend
npm run build
sudo chown -R prsm:prsm /opt/PRSM/backend/static
sudo systemctl restart prsm
echo "Build complete"
