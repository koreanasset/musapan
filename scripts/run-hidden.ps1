param(
    [Parameter(Mandatory = $true)]
    [string]$Script
)

# Resolve the project root from this script's own location instead of a
# hardcoded literal path, since PowerShell 5.1 misreads non-ASCII (Korean)
# characters in a .ps1 file saved without a UTF-8 BOM.
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot

& "C:\Program Files\nodejs\node.exe" --env-file=stock-brief.env $Script
exit $LASTEXITCODE
