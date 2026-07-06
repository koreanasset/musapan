param(
    [Parameter(Mandatory = $true)]
    [string]$Script
)

# Resolve the project root from this script's own location instead of a
# hardcoded literal path, since PowerShell 5.1 misreads non-ASCII (Korean)
# characters in a .ps1 file saved without a UTF-8 BOM.
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot

# Prevent the PC from going back to sleep while the script runs.
# ES_CONTINUOUS (0x80000000) | ES_SYSTEM_REQUIRED (0x00000001) = 0x80000001
$signature = '[DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint esFlags);'
$type = Add-Type -MemberDefinition $signature -Name "PowerMgmt" -Namespace "Win32" -PassThru
$type::SetThreadExecutionState(0x80000001) | Out-Null

& "C:\Program Files\nodejs\node.exe" --env-file=stock-brief.env $Script
$exitCode = $LASTEXITCODE

# Release the sleep lock.
$type::SetThreadExecutionState(0x80000000) | Out-Null

exit $exitCode
