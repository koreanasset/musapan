$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot

# If WakeToRun woke the PC from sleep, give networking a moment before git push.
Start-Sleep -Seconds 15

$file = Join-Path $projectRoot "src\App.jsx"
$content = Get-Content -Raw -Encoding UTF8 $file
$updated = $content.Replace('hiddenSubs: ["분양정보", "부동산토론"]', 'hiddenSubs: ["부동산토론"]')

if ($updated -eq $content) {
    Write-Output "No change made (marker string not found — may have already been unhidden manually)."
    exit 0
}

[System.IO.File]::WriteAllText($file, $updated, (New-Object System.Text.UTF8Encoding($false)))

git add src/App.jsx
git commit -m "Unhide 분양정보 board -- apt subscription content starts appearing 2026-07-20"
git push origin main

exit $LASTEXITCODE
