# IPP Printer PoC Verification Script
# Run this after deploying relay-worker and starting laptop-agent

param(
    [string]$RelayUrl = "relay-worker.your-subdomain.workers.dev",
    [string]$Slug = "home-printer"
)

$BaseUrl = "https://$RelayUrl"
$TestDir = $PSScriptRoot

Write-Host "===== IPP Printer PoC Verification =====" -ForegroundColor Cyan
Write-Host "Relay URL: $BaseUrl"
Write-Host "Printer slug: $Slug"
Write-Host ""

# Step 1: Health check
Write-Host "[1/5] Health check..." -ForegroundColor Yellow
try {
    $health = Invoke-RestMethod -Uri "$BaseUrl/" -Method GET
    Write-Host "  ✅ Worker is running: $($health | ConvertTo-Json -Compress)" -ForegroundColor Green
} catch {
    Write-Host "  ❌ Worker not responding: $_" -ForegroundColor Red
    exit 1
}

# Step 2: List printers
Write-Host "[2/5] Listing printers..." -ForegroundColor Yellow
try {
    $printers = Invoke-RestMethod -Uri "$BaseUrl/printers/" -Method GET
    Write-Host "  ✅ Printers:" -ForegroundColor Green
    $printers | ForEach-Object { Write-Host "    - $($_.name): $($_.url)" }
} catch {
    Write-Host "  ⚠️ Could not list printers (agent may not be connected): $_" -ForegroundColor DarkYellow
}

# Step 3: Get-Printer-Attributes
Write-Host "[3/5] Get-Printer-Attributes..." -ForegroundColor Yellow
$testFile = Join-Path $TestDir "get-printer-attributes-test.bin"
if (Test-Path $testFile) {
    try {
        $bytes = [System.IO.File]::ReadAllBytes($testFile)
        $response = Invoke-WebRequest -Uri "$BaseUrl/printers/$Slug" `
            -Method POST `
            -ContentType "application/ipp" `
            -Body $bytes `
            -OutFile (Join-Path $TestDir "response-get-attrs.bin")
        
        Write-Host "  ✅ Got IPP response ($($response.StatusCode)), saved to response-get-attrs.bin" -ForegroundColor Green
    } catch {
        Write-Host "  ❌ Failed: $_" -ForegroundColor Red
    }
} else {
    Write-Host "  ⚠️ Test binary not found. Run: npx tsx test/generate-ipp-test.ts" -ForegroundColor DarkYellow
}

# Step 4: Validate-Job
Write-Host "[4/5] Validate-Job..." -ForegroundColor Yellow
$testFile = Join-Path $TestDir "validate-job-test.bin"
if (Test-Path $testFile) {
    try {
        $bytes = [System.IO.File]::ReadAllBytes($testFile)
        $response = Invoke-WebRequest -Uri "$BaseUrl/printers/$Slug" `
            -Method POST `
            -ContentType "application/ipp" `
            -Body $bytes `
            -OutFile (Join-Path $TestDir "response-validate.bin")
        
        Write-Host "  ✅ Got IPP response ($($response.StatusCode))" -ForegroundColor Green
    } catch {
        Write-Host "  ❌ Failed: $_" -ForegroundColor Red
    }
} else {
    Write-Host "  ⚠️ Test binary not found." -ForegroundColor DarkYellow
}

# Step 5: Print-Job (careful — this will actually print if agent is connected!)
Write-Host "[5/5] Print-Job (sends fake PDF)..." -ForegroundColor Yellow
$testFile = Join-Path $TestDir "print-job-test.bin"
if (Test-Path $testFile) {
    $confirm = Read-Host "  This will send a print job to the real printer. Continue? (y/N)"
    if ($confirm -eq 'y') {
        try {
            $bytes = [System.IO.File]::ReadAllBytes($testFile)
            $response = Invoke-WebRequest -Uri "$BaseUrl/printers/$Slug" `
                -Method POST `
                -ContentType "application/ipp" `
                -Body $bytes `
                -OutFile (Join-Path $TestDir "response-print.bin")
            
            Write-Host "  ✅ Got IPP response ($($response.StatusCode)), saved to response-print.bin" -ForegroundColor Green
        } catch {
            Write-Host "  ❌ Failed: $_" -ForegroundColor Red
        }
    } else {
        Write-Host "  ⏭️ Skipped" -ForegroundColor DarkYellow
    }
} else {
    Write-Host "  ⚠️ Test binary not found." -ForegroundColor DarkYellow
}

Write-Host ""
Write-Host "===== Verification complete =====" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "  1. On Android: Settings > Connected devices > Printing > Default Print Service > ☰ > Add printer"
Write-Host "  2. Enter: ipps://$RelayUrl/printers/$Slug"
Write-Host "  3. Printer should appear as ready with your display name"
Write-Host "  4. Print a test page from any app"
