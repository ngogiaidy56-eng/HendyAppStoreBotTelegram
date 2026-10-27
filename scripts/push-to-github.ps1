$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
  throw 'Python 3 and Git must be installed. Install them, then rerun this script.'
}
python .\scripts\push-to-github.py
if ($LASTEXITCODE -ne 0) { throw 'Source import failed. Read the message above for the required fix.' }
